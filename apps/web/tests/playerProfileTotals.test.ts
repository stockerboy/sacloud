/**
 * 선수 프로필 `상세정보` 가 **본문(최근매치)과 같은 경기를 센다** (D-176).
 *
 * ── 왜 이 테스트가 있나
 *   운영 화면(2026-08-29)에서 같은 카드 안의 두 숫자가 어긋나 있었다.
 *
 *     본문 `최근매치`   20전 11승 9패 (55%) · 3시간 전 경기까지 보임
 *     오른쪽 `상세정보` 0승 0패 0% · 0킬 0데스 · MVP 0회
 *
 *   원인은 데이터가 없어서가 아니었다. 본문은 `Match` 를 그 자리에서 세고,
 *   상세정보는 `LeaguePlayer` 의 **누적 칸**을 읽었다. 그 칸은 배치 집계가 채우는 값이라
 *   집계가 훑는 기간(시즌 창) 밖의 경기는 한 판도 들어가지 않는다.
 *   실측: `supply` 리그에서 래더 경기가 있는 선수 10,324명 중 **7,370명**의
 *   누적 승패가 `0승 0패` 였다.
 *
 *   그래서 여기서 보는 것은 "숫자가 크다" 가 아니라 **두 숫자가 같은 모집단에서 나오는가** 다.
 *
 * ── 대상 선수를 고르는 법
 *   경기 수로 전체를 group by 하면 36만 경기를 훑는다. 최근 경기의 참가자에서
 *   고르면 같은 목적을 몇 번의 인덱스 조회로 끝낼 수 있다.
 *   적재 전 작업공간이면 후보가 없다 — 그때는 건너뛴다. 지어낸 데이터로 통과시키지 않는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { LeaguePlayerDetail } from '@sacloud/contract'
import { getLeaguePlayerDetail } from '../lib/server/queries/records'
import { withLadderMatch } from '../lib/server/queries/ladderScope'
import { seasonWindowWhere } from '../lib/server/queries/season0Scope'

/**
 * 상세정보의 모집단 — **현재 시즌 창 안의 래더 경기** (D-178).
 *
 * D-176 은 창을 걸지 않아 상세정보가 전 기간을 셌고, 랭킹 표(엔진 집계 = 시즌0 창)와
 * 같은 선수의 숫자가 어긋났다. 사용자 지시로 화면 성적 수치를 전부 창 기준으로 통일했다.
 * 여기서도 **같은 조건으로** 세야 "두 숫자가 같은 모집단인가" 를 실제로 검사하게 된다.
 */
function scoped(where: Parameters<typeof withLadderMatch>[0] = {}) {
  return withLadderMatch({ AND: [where, seasonWindowWhere()] })
}

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

/** 배치고사 기준이 10경기다 (D-145). 그보다 확실히 많이 뛴 선수를 본다 */
const ENOUGH_GAMES = 20

interface Target {
  leagueSlug: string
  leagueId: string
  playerId: string
  games: number
  detail: LeaguePlayerDetail
}

/**
 * 래더 경기를 충분히 뛴 선수 — 최근 경기 참가자 중에서 찾는다.
 *
 * ⚠ **참가자가 있는 경기만 본다** (2026-09-01).
 *   `SEASON0_ORIGINS` 에 `nexon_barracks` 가 들어오면서 IPL 경기가 래더 경기가 됐는데,
 *   IPL 은 **경기는 있고 라인업이 없는 구간이 크다** — 매치목록 원문에 선수 칸이 없어
 *   배틀로그를 받은 경기에만 `MatchPlayerStat` 이 있다 (`jobs/battlelogLineup.ts`).
 *   그래서 "가장 최근 12경기" 를 그냥 집으면 참가자 0명인 경기만 잡혀 후보가 비었고,
 *   아래 「대상을 찾는다」 검사가 배선이 끊긴 것처럼 빨개졌다.
 *
 *   이 테스트가 보려는 것은 **선수 누적이 본문과 같은 모집단인가** 이므로,
 *   애초에 선수가 없는 경기는 표본이 될 수 없다. 조건을 좁히는 것이 맞다 —
 *   문턱을 낮추거나 검사를 지우는 것이 아니다.
 */
async function findTargets(limit: number): Promise<Target[]> {
  const matches = await prisma.match.findMany({
    where: scoped({ stats: { some: {} } }),
    orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    take: 12,
    select: {
      leagueId: true,
      league: { select: { slug: true } },
      stats: { select: { playerId: true, kill: true } },
    },
  })

  const seen = new Set<string>()
  const found: Target[] = []
  for (const match of matches) {
    for (const stat of match.stats) {
      if (found.length >= limit) return found
      const key = `${match.leagueId}:${stat.playerId}`
      if (seen.has(key)) continue
      seen.add(key)
      const games = await prisma.match.count({
        where: scoped({ leagueId: match.leagueId, stats: { some: { playerId: stat.playerId } } }),
      })
      if (games < ENOUGH_GAMES) continue
      const detail = await getLeaguePlayerDetail(match.league.slug, stat.playerId)
      if (!detail) continue
      found.push({
        leagueSlug: match.league.slug,
        leagueId: match.leagueId,
        playerId: stat.playerId,
        games,
        detail,
      })
    }
  }
  return found
}

let targets: Target[] = []

beforeAll(async () => {
  if (!up) return
  targets = await findTargets(6)
}, 120_000)

describe.runIf(up)('선수 상세정보 누적 (D-176)', () => {
  /* 아래 검사들은 대상이 없으면 조용히 통과한다. 그러니 **대상이 있었는지**를 먼저 못 박는다.
     미러가 적재된 DB(래더 경기 10만건 이상)에서 후보가 0이면 배선이 끊긴 것이다 */
  it('미러가 적재된 DB 라면 검사 대상을 찾는다 (적재 전이면 건너뛴다)', async () => {
    /* 이 문턱은 **적재 여부**를 보는 것이라 창을 걸지 않는다 —
       창 안 경기는 만 건 단위라 10만으로 재면 영원히 건너뛴다 */
    const ladderMatches = await prisma.match.count({ where: withLadderMatch({}) })
    if (ladderMatches < 100_000) return

    /*
     * ⚠ ★적재량과 「창 안에 대상이 있느냐」는 다른 문제다★ (2026-09-04).
     *
     * 시즌0 창이 ★9/3 07:00 ~ 10/1★ 로 좁아지자 ★적재는 18만 건인데 창 안 대상은 0★ 이 됐다.
     * 옛 단언은 「적재됐으면 대상이 있다」였는데 ★그 전제가 창에 달려 있었다.★
     *
     * ★한 번 더 틀렸다★ (같은 날, 두 번째) — 「창 안 경기가 0건인가」로 걸렀더니
     * ★창 안에 경기는 있는데 `${ENOUGH_GAMES}`경기를 뛴 선수는 아직 없는★ 상태에서 또 빨개졌다.
     * ★시즌이 하루밖에 안 됐으면 그게 정상이다.★
     *
     * 그래서 ★전제를 그대로 재 본다★ — 창 안에서 `${ENOUGH_GAMES}`경기 이상 뛴 선수가
     * ★한 명이라도 있는가.★ 없으면 검사할 것이 없으니 건너뛴다.
     * (`findTargets` 와 다른 길로 센다 — 그쪽은 「최근 12경기 참가자」 표본이라
     *  이 값을 그대로 되쓰면 검사가 자기 자신을 확인하게 된다.)
     *
     * ★없는 것을 있다고 우기지 않는다.★ ★문턱을 낮춰 통과시키지도 않는다.★
     */
    const perPlayer = await prisma.matchPlayerStat.groupBy({
      by: ['playerId'],
      where: { match: scoped() },
      _count: { _all: true },
      orderBy: { _count: { playerId: 'desc' } },
      take: 1,
    })
    const mostGames = perPlayer[0]?._count._all ?? 0
    if (mostGames < ENOUGH_GAMES) return

    expect(targets.length).toBeGreaterThan(0)
  })

  it('승 + 패 = 그 리그에서 뛴 래더 경기 수 — 본문과 같은 모집단이다', () => {
    if (targets.length === 0) return
    for (const t of targets) {
      expect(t.detail.win + t.detail.lose).toBe(t.games)
    }
  })

  it('경기를 뛴 선수의 상세정보가 통째로 0이 아니다 — 집계 창에 갇히지 않는다', () => {
    if (targets.length === 0) return
    for (const t of targets) {
      expect(t.detail.win + t.detail.lose).toBeGreaterThanOrEqual(ENOUGH_GAMES)
    }
    /* 킬은 아는 경기가 하나도 없으면 `null` 이다 (모른다는 뜻).
       한 명이라도 아는 경기가 있으면 그 선수는 0이 아닌 킬을 가져야 한다 */
    const known = targets.filter((t) => t.detail.kill !== null)
    for (const t of known) {
      expect(t.detail.kill).toBeGreaterThan(0)
      expect(t.detail.kill_per_match).toBeGreaterThan(0)
    }
  })

  it('본문 최근매치는 상세정보 누적의 부분집합이다 — 더 많이 셀 수 없다', () => {
    if (targets.length === 0) return
    for (const t of targets) {
      expect(t.detail.match_summary.recent_count).toBeLessThanOrEqual(t.detail.win + t.detail.lose)
      expect(t.detail.match_summary.win).toBeLessThanOrEqual(t.detail.win)
      expect(t.detail.match_summary.lose).toBeLessThanOrEqual(t.detail.lose)
    }
  })

  it('MVP 는 실제 `mvp = true` 참가 기록 수와 같다 — `null` 을 "아니다"로 읽지 않는다', async () => {
    if (targets.length === 0) return
    const t = targets[0]!
    const mvp = await prisma.matchPlayerStat.count({
      where: {
        playerId: t.playerId,
        mvp: true,
        match: scoped({ leagueId: t.leagueId }),
      },
    })
    expect(t.detail.mvp_count).toBe(mvp)
  })

  it('무기별 K/D 는 통합과 **같은 정의**다 — `킬 / (킬 + 데스) × 100` (D-149)', () => {
    if (targets.length === 0) return
    const check = (kill: number | null, death: number | null, rate: number | null): void => {
      if (kill === null || death === null) {
        // 기록을 모르면 킬뎃도 모른다. 0% 로 채우지 않는다 (D-034 · D-106)
        expect(rate).toBeNull()
        return
      }
      const total = kill + death
      expect(rate).toBe(total === 0 ? 0 : Math.round((kill / total) * 1000) / 10)
    }
    for (const t of targets) {
      check(t.detail.kill, t.detail.death, t.detail.kd_rate)
      check(t.detail.sniper_kill, t.detail.sniper_death, t.detail.sniper_kd_rate)
      check(t.detail.rifle_kill, t.detail.rifle_death, t.detail.rifle_kd_rate)
    }
  })

  it('스나 + 라플 판수는 전체 판수를 넘지 않는다 — 무기를 모르는 경기가 있다 (D-034)', () => {
    if (targets.length === 0) return
    for (const t of targets) {
      const d = t.detail
      expect(d.sniper_games + d.rifle_games).toBeLessThanOrEqual(d.win + d.lose)
      expect(d.sniper_known_games).toBeLessThanOrEqual(d.sniper_games)
      expect(d.rifle_known_games).toBeLessThanOrEqual(d.rifle_games)
    }
  })

  it('그 무기로 뛴 적이 없으면 킬·데스·킬뎃이 `null` 이다 — 0으로 채우지 않는다', () => {
    if (targets.length === 0) return
    for (const t of targets) {
      const d = t.detail
      if (d.sniper_games === 0) {
        expect(d.sniper_kill).toBeNull()
        expect(d.sniper_death).toBeNull()
        expect(d.sniper_kd_rate).toBeNull()
      }
      if (d.rifle_games === 0) {
        expect(d.rifle_kill).toBeNull()
        expect(d.rifle_death).toBeNull()
        expect(d.rifle_kd_rate).toBeNull()
      }
    }
  })

  it('응답이 계약을 통과한다 — 화면이 읽는 형태다', () => {
    if (targets.length === 0) return
    for (const t of targets) {
      expect(LeaguePlayerDetail.safeParse(t.detail).success).toBe(true)
    }
  })
})
