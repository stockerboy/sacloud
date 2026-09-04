/**
 * **시즌0 이전 경기는 열리지 않는다** (2026-09-04 · 사장님 지시).
 *
 * ── 왜 이 파일이 있나
 *   사장님: *"9/3일 오전 7시 전 기록은 전부 다 버린다"* · *"못 열게"*.
 *   *"SPL 경기 굳이 경기상세 이전꺼 띄우지말고 걍 카드로 만들어서"*.
 *
 *   목록(기록실)은 이미 창에 걸려 있었다(`matchPage` → `withSeasonWindow`).
 *   그런데 **상세(`getMatch`)만 안 걸려 있어서**, 목록엔 안 보이는 경기가
 *   **주소를 알면 그대로 열렸다.** 한쪽만 막은 것은 막은 것이 아니다.
 *
 * ── 고정하는 것
 *   1. 창 **안** 경기는 그대로 열린다
 *   2. 창 **앞** 경기는 `null` 이다 — 라우트가 404 로 바꾼다
 *   3. **지워지지 않았다** — 행은 DB 에 그대로 있다 (사장님이 「B」로 고르셨다)
 *   4. 화면은 「없다」가 아니라 **왜 안 보이는지**를 말한다
 *
 * ⚠ 창 값(9/3 07:00)을 여기에 다시 적지 않는다. `seasonWindowFixture` 가 창을 따라간다.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getMatch } from '../lib/server/queries/matches'
import { BEFORE_WINDOW, IN_WINDOW } from './seasonWindowFixture'

const P = 'TWIN-'
const SLUG = 'twin0'
const INSIDE = '990904000000000001'
const OUTSIDE = '990904000000000002'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
const up = await dbUp()

let leagueId: string | null = null

async function cleanup() {
  await prisma.matchPlayerStat.deleteMany({ where: { matchId: { in: [INSIDE, OUTSIDE] } } })
  await prisma.match.deleteMany({ where: { id: { in: [INSIDE, OUTSIDE] } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: SLUG } } })
  await prisma.league.deleteMany({ where: { slug: SLUG } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: 'twin0-' } } })
  await prisma.gameMap.deleteMany({ where: { name: `${P}맵` } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  const map = await prisma.gameMap.create({ data: { name: `${P}맵` } })
  const clans = await Promise.all(
    ['r', 'b'].map((tag, index) =>
      prisma.clan.create({ data: { slug: `twin0-${tag}`, name: `${P}클랜${index}` } }),
    ),
  )
  const league = await prisma.league.create({
    data: { slug: SLUG, name: `${P}리그`, maps: { create: [{ mapId: map.id }] } },
  })
  const [red, blue] = await Promise.all(
    clans.map((clan) =>
      prisma.leagueClan.create({
        data: { leagueId: league.id, clanId: clan.id, division: 1, placement: false },
      }),
    ),
  )

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
  })

  await prisma.match.create({ data: row(INSIDE, IN_WINDOW) })
  await prisma.match.create({ data: row(OUTSIDE, BEFORE_WINDOW) })

  leagueId = league.id
})

afterAll(async () => {
  if (up) await cleanup()
})

describe.runIf(up)('시즌0 이전 경기는 못 연다', () => {
  it('창 **안** 경기는 그대로 열린다', async () => {
    const detail = await getMatch(leagueId!, INSIDE, null)
    expect(detail?.id).toBe(INSIDE)
  })

  it('★창 **앞** 경기는 안 열린다★ — 주소를 알아도 못 연다', async () => {
    const detail = await getMatch(leagueId!, OUTSIDE, null)
    expect(detail).toBeNull()
  })

  it('★지워진 게 아니다★ — 행은 DB 에 그대로 있다 (사장님이 「B」로 고르셨다)', async () => {
    const row = await prisma.match.findUnique({
      where: { id: OUTSIDE },
      select: { id: true, startAt: true },
    })
    expect(row?.id).toBe(OUTSIDE)
  })
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
