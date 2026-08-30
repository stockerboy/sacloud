/**
 * 클랜페이지 지표 — 티어별 승률 · 승률 추이 · 화력 · 최다연승
 * (`docs/SITE_SPEC_V2.md` 5-3 · 5-4 · 5-5).
 *
 * **세는 규칙은 여기 없다.** 전부 `@sacloud/contract` 의 `clanMetrics` 에 있고
 * Mock(`packages/mock/src/store.ts`)도 **같은 함수**를 부른다. 이 파일이 하는 일은
 * DB 에서 재료를 읽어 계약이 원하는 모양(`ClanMatchRow`)으로 맞춰 주는 것뿐이다.
 *
 * ── 모집단은 화면의 다른 수치와 **같다**
 *   `withLadderMatch()`(D-164 · D-178) + `seasonWindowWhere()`(D-175 · D-178).
 *   상세정보·최근매치 요약과 다른 경기를 세면 같은 화면 안에서 숫자가 어긋난다 —
 *   D-176 이 실제로 그 사고였다.
 *
 * ── 클린시트(반코트)는 **만들지 않았다**
 *   라운드별 진영과 라운드 승패가 있어야 하는데 `Match` 에 라운드 점수 칸이 없다.
 *   자세한 것은 `packages/contract/src/clanMetrics.ts` 머리말.
 */
import { prisma, type Prisma } from '@sacloud/db'
import {
  buildClanMetrics,
  clanBestWinStreak,
  type ClanMatchRow,
  type ClanMetrics,
  type ClanStreakMember,
} from '@sacloud/contract'
import { DROPOUT_DAMAGE_ZERO } from './dropoutScope'
import { withLadderMatch } from './ladderScope'
import { SEASON0_FROM, seasonWindowWhere } from './season0Scope'
import { toKstIso } from '../format'
import { PLAYER_SUMMARY_SELECT } from '../mappers'

/**
 * 한 클랜의 시즌 경기를 몇 건까지 훑을까.
 *
 * 실측(2026-08-30 · 로컬): supply 리그 최다 클랜 `afterpray` 가 시즌0 창 안에서 2,523건이다.
 * 4,000 이면 그 두 배 가까이를 덮는다. 셀렉트가 여섯 칸뿐이라 이 정도는 한 번에 읽는다.
 *
 * > `[미확인]` 사양에 상한이 없다. 우리가 고른 값이다.
 */
const SCAN_LIMIT = 4000

/** 추이·집계에 필요한 최소 컬럼 */
const METRIC_MATCH_SELECT = {
  id: true,
  startAt: true,
  winnerSide: true,
  redLeagueClanId: true,
  redDivisionAtMatch: true,
  blueDivisionAtMatch: true,
} satisfies Prisma.MatchSelect

/**
 * 클랜 지표.
 *
 * 재료가 될 경기가 하나도 없으면 `null` 이다 — 0 으로 채운 빈 카드를 그리지 않는다 (D-106).
 */
export async function leagueClanMetrics(
  leagueId: string,
  leagueClanId: string,
  divisionCount: number,
): Promise<ClanMetrics | null> {
  const where = withLadderMatch({
    AND: [
      { OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }] },
      seasonWindowWhere(),
    ],
  })

  /**
   * 추이의 **끝**은 리그의 마지막 경기다. `new Date()` 를 쓰지 않는다 —
   * 요청마다 칸 수가 달라지면 같은 DB 에서도 화면이 흔들린다 (`season0Scope.ts` 와 같은 이유).
   * 이 클랜의 마지막 경기로 자르지 않는 것은, 쉰 구간도 **빈 칸으로 보여야** 하기 때문이다.
   */
  const [matches, leagueLast] = await Promise.all([
    /* **최근 것부터** 자른다. 오름차순으로 자르면 상한에 걸렸을 때
       최근 경기가 통째로 빠져 추이 끝이 빈 칸이 된다 (교차검증 [중간 4]).
       아래에서 다시 오름차순으로 돌려 놓는다 — 연승 계산이 시간 순서를 요구한다 */
    prisma.match.findMany({
      where,
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      take: SCAN_LIMIT + 1,
      select: METRIC_MATCH_SELECT,
    }),
    prisma.match.findFirst({
      where: withLadderMatch({ AND: [{ leagueId }, seasonWindowWhere()] }),
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      select: { startAt: true },
    }),
  ])
  if (matches.length === 0) return null

  /* 상한보다 한 건 더 요청했다. 그 한 건이 왔다면 잘린 것이다 */
  const truncated = matches.length > SCAN_LIMIT
  if (truncated) matches.length = SCAN_LIMIT
  matches.reverse()

  /** 그 경기에서 우리가 뛴 진영 — 상대 부리그와 딜량 합을 고르는 데 둘 다 쓴다 */
  const sideOf = new Map<string, 'red' | 'blue'>()
  for (const match of matches) {
    sideOf.set(match.id, match.redLeagueClanId === leagueClanId ? 'red' : 'blue')
  }

  const wonIds: string[] = []
  for (const match of matches) {
    if (match.winnerSide === sideOf.get(match.id)) wonIds.push(match.id)
  }

  const teamDamage = await teamDamageOf(wonIds, sideOf)

  const rows: ClanMatchRow[] = matches.map((match) => {
    const side = sideOf.get(match.id) as 'red' | 'blue'
    return {
      id: match.id,
      startAt: match.startAt,
      won: match.winnerSide === side,
      /* **경기 당시** 상대 부리그 스냅샷 (3-B 4번). 지금 부리그를 쓰면 승강 후 과거가 오염된다 */
      opponentDivision: side === 'red' ? match.blueDivisionAtMatch : match.redDivisionAtMatch,
      teamDamage: teamDamage.get(match.id) ?? null,
    }
  })

  const streak = clanBestWinStreak(rows)
  const streakMembers = await streakMembersOf(streak.matchIds, sideOf)

  return buildClanMetrics({
    rows,
    divisionCount,
    windowFrom: SEASON0_FROM,
    /* 리그에 경기가 있으니 `leagueLast` 는 있다. 없으면 이 클랜의 마지막 경기로 대신한다 */
    windowUntil: leagueLast?.startAt ?? (rows[rows.length - 1] as ClanMatchRow).startAt,
    streakMembers,
    toIso: toKstIso,
    truncated,
  })
}

/**
 * 이긴 경기마다 **우리 팀 다섯 명 딜량의 합**.
 *
 * 다섯이 아니거나 한 명이라도 딜량이 결측이면 그 경기는 `null` 이다 — 합이 거짓이 되기
 * 때문이다 (D-034 · D-148). 계약이 그 경기를 화력에서 빼고 `excluded` 로 센다.
 *
 * 참가 기록을 한 줄씩 읽지 않고 `groupBy` 로 DB 에 합계를 시킨다. 최다 클랜이면
 * 이긴 경기가 1,300건이라 줄 수로는 6,500행이 넘는다.
 *
 * ── 결측이 두 모양이다 (D-209)
 *   `_count.damage` 는 **null 이 아닌 칸의 수**라, `_all` 과 같아야 `null` 결측이 없다는 뜻이다.
 *   그런데 결측의 대부분은 `null` 이 아니라 **`0`** 이다 — 탈주한 사람의 딜량이 0으로
 *   박혀 있다 (`dropoutScope.ts`). 다섯 중 하나가 0이면 팀 합계가 그만큼 모자란 거짓이므로
 *   `_min.damage` 로 잡아 그 경기를 통째로 뺀다. 화면은 이미 `딜량 결측 N판 제외` 라고 적는다.
 *
 *   실측(2026-08-31 · `supply` 리그): 이긴 팀 5인 묶음 129,596개 중
 *   **2,715개(2.1%)** 가 이렇게 빠진다. `null` 결측으로 이미 빠지던 것은 4개뿐이었다.
 *
 * ── 왜 `dropoutScope.ts` 의 조건 함수를 쓰지 않는가
 *   저 둘은 **행 단위** 조건이다. 여기는 행이 아니라 **팀 5명 묶음**을 통째로 넣거나 뺀다 —
 *   한 명만 걸러 내면 남은 넷의 합이 "팀 전체 딜량" 인 척하게 된다. 그래서 `where` 로
 *   거르지 않고 묶음을 다 읽은 뒤 `_count` · `_min` 으로 판정한다.
 *   같은 이유로 `_count._all !== TEAM_SIZE` 검사도 살아 있어야 한다.
 */
const TEAM_SIZE = 5

async function teamDamageOf(
  wonIds: readonly string[],
  sideOf: ReadonlyMap<string, 'red' | 'blue'>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (wonIds.length === 0) return out

  const grouped = await prisma.matchPlayerStat.groupBy({
    by: ['matchId', 'side'],
    where: { matchId: { in: [...wonIds] } },
    _sum: { damage: true },
    _min: { damage: true },
    _count: { _all: true, damage: true },
  })

  for (const row of grouped) {
    if (row.side !== sideOf.get(row.matchId)) continue
    if (row._count._all !== TEAM_SIZE) continue
    /* `null` 결측 */
    if (row._count.damage !== row._count._all) continue
    /* `0` 결측 — 한 명이라도 탈주했으면 팀 합계가 거짓이다 (D-209).
       `_min` 은 `null` 을 무시하므로 위의 `null` 검사와 따로 봐야 한다 */
    if ((row._min.damage ?? DROPOUT_DAMAGE_ZERO) <= DROPOUT_DAMAGE_ZERO) continue
    const sum = row._sum.damage
    if (sum === null) continue
    out.set(row.matchId, sum)
  }
  return out
}

/**
 * 최다연승 구간에 뛴 선수 — 많이 뛴 순, 같으면 이름 순.
 *
 * 구간은 보통 열몇 경기라 참가 기록을 그대로 읽는다. 연승이 없으면 질의도 하지 않는다.
 */
async function streakMembersOf(
  matchIds: readonly string[],
  sideOf: ReadonlyMap<string, 'red' | 'blue'>,
): Promise<ClanStreakMember[]> {
  if (matchIds.length === 0) return []

  const stats = await prisma.matchPlayerStat.findMany({
    where: { matchId: { in: [...matchIds] } },
    select: { matchId: true, side: true, player: { select: PLAYER_SUMMARY_SELECT } },
  })

  const tally = new Map<string, { name: string; games: number }>()
  for (const stat of stats) {
    /* 우리 쪽에서 뛴 선수만. 상대 라인업을 우리 멤버로 세면 안 된다 */
    if (stat.side !== sideOf.get(stat.matchId)) continue
    const entry = tally.get(stat.player.id) ?? { name: stat.player.name, games: 0 }
    entry.games += 1
    tally.set(stat.player.id, entry)
  }

  return [...tally.entries()]
    .map(([id, entry]) => ({ player: { id, name: entry.name }, games: entry.games }))
    .sort((a, b) => b.games - a.games || a.player.name.localeCompare(b.player.name))
}
