/**
 * `오늘 퍼포먼스` — 오늘(KST) 뛴 래더 경기를 그 자리에서 센다
 * (`docs/PLAYER_TRAITS_SPEC.md` 10절 · D-182).
 *
 * 판정 규칙·경계·문구는 전부 `packages/contract/src/todayPerformance.ts` 에 있다.
 * 여기는 **DB 에서 재료만 꺼내 온다.** `playerTotals.ts` 와 같은 역할 분담이다.
 *
 * ── 모집단은 `playerLadderTotals` 와 **똑같다**
 *   `withLadderMatch` + `seasonWindowWhere()` 에 **오늘 하루**를 더한 것뿐이다 (D-164 · D-178).
 *   상세정보와 다른 모집단을 세면 같은 카드 안에서 숫자가 어긋난다 —
 *   D-176 이 고친 사고가 정확히 그것이었다.
 *
 * ── 시즌 평균은 **다시 세지 않는다**
 *   `playerLadderTotals` 가 이미 계산한 `kdRate` 를 받아 쓴다. 같은 값을 두 곳에서 세면
 *   언젠가 갈라진다.
 *
 * ── 하루의 경계는 KST 다
 *   UTC 로 자르면 매일 00:00~09:00 KST 경기가 "어제" 로 새어 나간다.
 *   클랜전이 가장 많이 열리는 시간대가 통째로 빠진다. `kstDayStart()` 가 그 경계다.
 */
import { prisma, type Prisma } from '@sacloud/db'
import { kstDayStart, type TodayTally } from '@sacloud/contract'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'

/**
 * 그 리그에서 이 선수가 **오늘** 뛴 것을 센다.
 *
 * 시즌 평균과 견주는 일은 여기서 하지 않는다 — `buildTodayPerformance()` 가 한다.
 * 그래야 이 조회가 시즌 누적 조회를 **기다리지 않고 같이** 나갈 수 있다.
 */
export async function playerTodayTally(
  leagueId: string,
  playerId: string,
  now: Date = new Date(),
): Promise<TodayTally> {
  const statWhere: Prisma.MatchPlayerStatWhereInput = {
    playerId,
    match: withLadderMatch({
      leagueId,
      ...seasonWindowWhere(),
      startAt: { gte: kstDayStart(now) },
    }),
  }

  const [agg, win] = await Promise.all([
    prisma.matchPlayerStat.aggregate({
      where: statWhere,
      _sum: { kill: true, death: true },
      /* `_count.kill` 은 **`null` 이 아닌 행**만 센다 — 그게 `knownGames` 다 (D-148) */
      _count: { _all: true, kill: true },
    }),
    /* 내가 뛴 진영이 승리 진영과 같은 경기.
       현재 소속으로 판정하지 않는다 — 이적·용병이면 어긋난다 (D-131 · D-135) */
    prisma.matchPlayerStat.count({
      where: {
        ...statWhere,
        OR: [
          { side: 'red', match: { winnerSide: 'red' } },
          { side: 'blue', match: { winnerSide: 'blue' } },
        ],
      },
    }),
  ])

  const games = agg._count._all
  return {
    games,
    knownGames: agg._count.kill,
    win,
    /* `Match.winnerSide` 는 red 아니면 blue 다 (무승부가 없다).
       그래서 남는 경기는 전부 패배다 — `playerTotals.ts` 와 같은 근거다 */
    lose: games - win,
    kill: agg._sum.kill ?? 0,
    death: agg._sum.death ?? 0,
  }
}
