/**
 * **시즌0 이전 경기는 어떤 길로도 열리지 않는다** (2026-09-04 · 사장님 지시 · Part 2).
 *
 * ── 왜 이 파일이 있나
 *   사장님: *"9/3일 오전 7시 전 기록은 전부 다 버린다"* · *"못 열게"*.
 *
 *   목록(기록실)은 이미 창에 걸려 있었다(`matchPage` → `withSeasonWindow`).
 *   그런데 **상세(`getMatch`)만 안 걸려 있어서**, 목록엔 안 보이는 경기가
 *   **주소를 알면 그대로 열렸다.** 한쪽만 막은 것은 막은 것이 아니다.
 *
 * ── ★확인 조건은 사장님이 정하셨다★
 *   *"3개 리그 모두 확인"* · *"코드 수정만으로 완료 판정 금지"* ·
 *   *"실제 경계값 직전/직후"* · *"진입 경로 · 직접 URL · API 까지"*
 *
 * ── 그래서 이 파일이 재는 것
 *   ```
 *   리그 4개      supply(SPL) · nolink(IPL) · daerule(열산) · sanply
 *   경계          시작 1ms 전  →  못 연다
 *                 시작 정각    →  열린다   (경계는 「이상」이다)
 *   진입 경로     리그 기록실 · 클랜 기록실 · 선수 기록실  → 목록에 안 뜬다
 *   직접 주소     getMatch(리그, 경기번호)                → null → 라우트가 404
 *   ```
 *   ★HTTP 404 와 실제 배포 화면은 이 파일이 아니라 운영 사이트로 확인했다★ —
 *   검사는 서버 없이도 돌아야 하기 때문이다. 그 증거는 커밋 메시지에 적는다.
 *
 * ⚠ 창 값(9/3 07:00)을 여기에 다시 적지 않는다. `SEASON0_FROM` 을 그대로 쓴다.
 *   ★창이 또 옮겨져도 이 검사는 살아 있다.★
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import {
  getLeagueClanMatches,
  getLeagueMatches,
  getLeaguePlayerMatches,
  getMatch,
} from '../lib/server/queries/matches'
import { SEASON0_FROM } from '../lib/server/queries/season0Scope'

const P = 'TWIN-'

/** ★사장님이 말씀하신 세 리그 + sanply★ — 슬러그는 운영 값과 겹치지 않게 접두사를 둔다 */
const LEAGUES = [
  { key: 'supply', slug: 'twin-spl', label: 'SPL', n: '1' },
  { key: 'nolink', slug: 'twin-ipl', label: 'IPL', n: '2' },
  { key: 'daerule', slug: 'twin-dae', label: '열산', n: '3' },
  { key: 'sanply', slug: 'twin-san', label: 'sanply', n: '4' },
] as const

/** ★경계 1ms 전★ — 「직전」의 가장 가혹한 값이다 */
const JUST_BEFORE = new Date(SEASON0_FROM.getTime() - 1)
/** ★경계 정각★ — `gte` 라 이 순간은 창 **안** 이어야 한다 */
const AT_BOUNDARY = new Date(SEASON0_FROM.getTime())

/** 경기 번호 18자리. 앞 6자리는 실제 날짜와 겹치지 않게 `9909` 로 시작한다 */
const keyOf = (n: string, when: '1' | '2') => `990900000000000${n}0${when}`.slice(0, 18)

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
const up = await dbUp()

interface Built {
  leagueId: string
  redLeagueClanId: string
  playerId: string
  beforeKey: string
  atKey: string
}
const built = new Map<string, Built>()

async function cleanup() {
  const slugs = LEAGUES.map((l) => l.slug)
  const matches = await prisma.match.findMany({
    where: { league: { slug: { in: slugs } } },
    select: { id: true },
  })
  const ids = matches.map((m) => m.id)
  await prisma.matchPlayerStat.deleteMany({ where: { matchId: { in: ids } } })
  await prisma.match.deleteMany({ where: { id: { in: ids } } })
  await prisma.leaguePlayer.deleteMany({ where: { league: { slug: { in: slugs } } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: { in: slugs } } } })
  await prisma.league.deleteMany({ where: { slug: { in: slugs } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: 'twinc-' } } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.gameMap.deleteMany({ where: { name: `${P}맵` } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  const map = await prisma.gameMap.create({ data: { name: `${P}맵` } })

  for (const lg of LEAGUES) {
    const [redClan, blueClan] = await Promise.all([
      prisma.clan.create({ data: { slug: `twinc-${lg.key}-r`, name: `${P}${lg.key}R` } }),
      prisma.clan.create({ data: { slug: `twinc-${lg.key}-b`, name: `${P}${lg.key}B` } }),
    ])
    const league = await prisma.league.create({
      data: { slug: lg.slug, name: `${P}${lg.label}`, maps: { create: [{ mapId: map.id }] } },
    })
    const [red, blue] = await Promise.all(
      [redClan, blueClan].map((clan) =>
        prisma.leagueClan.create({
          data: { leagueId: league.id, clanId: clan.id, division: 1, placement: false },
        }),
      ),
    )
    const player = await prisma.player.create({
      data: { id: `${P}${lg.key}`, name: `${P}${lg.key}` },
    })
    /* ★`LeaguePlayer` 가 없으면 선수 기록실이 통째로 `null` 이다★ —
       그러면 「창 앞 경기가 안 뜬다」가 ★빈 목록으로 그냥 통과해 버린다.★
       막혔는지 재려면 ★안 막힌 경기가 실제로 뜨는 것★ 을 함께 봐야 한다 */
    await prisma.leaguePlayer.create({
      data: { leagueId: league.id, playerId: player.id, clanId: redClan.id },
    })

    const beforeKey = keyOf(lg.n, '1')
    const atKey = keyOf(lg.n, '2')

    const row = (id: string, startAt: Date) => ({
      id,
      sourceMatchId: id,
      origin: '3rd.supply',
      leagueId: league.id,
      mapId: map.id,
      playerCount: 10,
      startAt,
      playTime: 100,
      winnerSide: 'red',
      redLeagueClanId: red!.id,
      blueLeagueClanId: blue!.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      /* ★선수 기록실 경로를 재려면 참가 기록이 있어야 한다★ */
      stats: {
        create: [
          {
            playerId: player.id,
            side: 'red',
            kill: 1,
            death: 1,
            assist: 0,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
        ],
      },
    })

    await prisma.match.create({ data: row(beforeKey, JUST_BEFORE) })
    await prisma.match.create({ data: row(atKey, AT_BOUNDARY) })

    built.set(lg.key, {
      leagueId: league.id,
      redLeagueClanId: red!.id,
      playerId: player.id,
      beforeKey,
      atKey,
    })
  }
}, 120_000)

afterAll(async () => {
  if (up) await cleanup()
})

describe.runIf(up)('Part 2 · 시즌0 이전 경기는 못 연다', () => {
  it('전제 — 경계 1ms 전과 경계 정각으로 리그 4개에 경기를 깔았다', () => {
    expect(built.size).toBe(LEAGUES.length)
    expect(JUST_BEFORE.getTime()).toBe(SEASON0_FROM.getTime() - 1)
    expect(AT_BOUNDARY.getTime()).toBe(SEASON0_FROM.getTime())
  })

  for (const lg of LEAGUES) {
    describe(`${lg.label} (${lg.key})`, () => {
      it('★경계 1ms 전 경기는 안 열린다★ — 주소를 알아도 못 연다', async () => {
        const b = built.get(lg.key)!
        expect(await getMatch(b.leagueId, b.beforeKey, null)).toBeNull()
      })

      it('★경계 정각 경기는 열린다★ — 경계는 「이상」이다', async () => {
        const b = built.get(lg.key)!
        const detail = await getMatch(b.leagueId, b.atKey, null)
        expect(detail?.id).toBe(b.atKey)
      })

      it('리그 기록실 목록에 창 앞 경기가 안 뜬다', async () => {
        const b = built.get(lg.key)!
        const page = await getLeagueMatches(b.leagueId, null, 50)
        const ids = page.items.map((m) => m.id)
        expect(ids).not.toContain(b.beforeKey)
        expect(ids).toContain(b.atKey)
      })

      it('클랜 기록실 목록에도 안 뜬다', async () => {
        const b = built.get(lg.key)!
        const page = await getLeagueClanMatches(b.redLeagueClanId, null, 50)
        const ids = (page?.items ?? []).map((m) => m.id)
        expect(ids).not.toContain(b.beforeKey)
        expect(ids).toContain(b.atKey)
      })

      it('선수 기록실 목록에도 안 뜬다', async () => {
        const b = built.get(lg.key)!
        const page = await getLeaguePlayerMatches(b.leagueId, b.playerId, null, 50)
        const ids = (page?.items ?? []).map((m) => m.id)
        expect(ids).not.toContain(b.beforeKey)
        expect(ids).toContain(b.atKey)
      })

      it('★지워진 게 아니다★ — 행은 DB 에 그대로 있다 (사장님이 「B」로 고르셨다)', async () => {
        const b = built.get(lg.key)!
        const row = await prisma.match.findUnique({
          where: { id: b.beforeKey },
          select: { id: true },
        })
        expect(row?.id).toBe(b.beforeKey)
      })
    })
  }
})

describe('경기 상세 화면 · 안 열릴 때의 말', () => {
  const SRC = readFileSync(
    new URL('../app/league/[leagueSlug]/match/[matchId]/MatchDetailScreen.tsx', import.meta.url),
    'utf8',
  )

  it('★「없다」가 아니라 왜 안 보이는지를 말한다★', () => {
    expect(SRC).toContain('시즌0(9/3 07:00 이후) 경기만 볼 수 있습니다.')
  })

  it('왜 이렇게 했는지가 파일에 적혀 있다', () => {
    expect(SRC).toContain('기록이 지워진 줄 안다')
  })
})

describe('API 라우트가 없는 경기를 404 로 돌려준다', () => {
  const SRC = readFileSync(
    new URL('../app/api/leagues/[league]/matches/[matchId]/route.ts', import.meta.url),
    'utf8',
  )

  it('`getMatch` 가 null 이면 `notFound` 다 — 200 에 빈 값을 담지 않는다', () => {
    expect(SRC).toContain("notFound('경기를 찾을 수 없습니다')")
  })
})
