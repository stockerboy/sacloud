/**
 * 주간 순위 스냅샷 읽기 — **초안** (지시 #19 · 2026-09-02).
 *
 * ⚠ 아직 아무도 부르지 않는다. `WeeklyRankSnapshot` 표가 `schema.prisma` 에 들어가고
 *   (총괄이 넣는다) 스냅샷이 쌓이기 시작해야 뜻이 있다. 표가 없는 상태에서 부르면
 *   런타임 오류다 — 그래서 화면에 연결하지 않았다.
 *
 * ── 왜 `$queryRaw` 인가
 *   Prisma 모델이 아직 없어서 `prisma.weeklyRankSnapshot` 은 타입이 안 잡힌다.
 *   표가 생기면 `findMany` 로 바꿔도 되고, 이대로 둬도 된다 — 열 이름은 설계서 블록과 같다.
 *
 * ── 왕복은 **한 번**이다. `Promise.all` 로 다른 질의와 묶지 않는다
 *   운영은 `connection_limit=1` 이라 병렬이 아니라 10초 풀 타임아웃이다 (D-239 · HANDOFF 6-4).
 *   선수 프로필은 이미 `playerLadderRows()` 한 번 + `playerRankOf()` 한 번을 던지고 있으니
 *   이것이 세 번째 왕복이 된다. 그 비용을 알고 붙인다.
 *
 * ── 쓰는 법 (선수)
 *   ```ts
 *   const trend = buildPlayerWeekly(rows, now)                  // 순위 없음
 *   const snaps = await playerWeeklyRanks(leagueId, playerId, new Date(trend.points[0].start))
 *   const withRank = attachWeeklyRank(trend, snaps, rank.rank)  // 마지막 점은 지금 순위
 *   ```
 *   `attachWeeklyRank` 는 계약(`@sacloud/contract`)에 있다. Mock 도 같은 함수를 부른다.
 */
import { prisma } from '@sacloud/db'
import { WEEK_BOUNDARY, type WeeklyRankRow } from '@sacloud/contract'

interface RawRow {
  weekStartAt: Date
  rank: number
}

/**
 * 한 선수의 주간 순위 — `from` 이후 경계의 스냅샷을 오래된 것부터.
 *
 * `from` 은 그래프 첫 점의 `start` 를 주면 된다. 그 이전 스냅샷은 화면에 안 쓰인다.
 * 경계 규칙은 언제나 `WEEK_BOUNDARY.current` — 옛 규칙 행은 대조용으로만 남는다.
 */
export async function playerWeeklyRanks(
  leagueId: string,
  playerId: string,
  from: Date,
): Promise<WeeklyRankRow[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT s."weekStartAt", s."rank"
      FROM "WeeklyRankSnapshot" s
     WHERE s."leagueId" = ${leagueId}
       AND s."kind" = 'player'
       AND s."subjectId" = ${playerId}
       AND s."boundary" = ${WEEK_BOUNDARY.current}
       AND s."weekStartAt" >= ${from}
     ORDER BY s."weekStartAt" ASC
  `
  return rows.map((r) => ({ weekStartAt: new Date(r.weekStartAt), rank: r.rank }))
}

/** 클랜 — 같은 표, `kind='clan'`, `subjectId = LeagueClan.id` */
export async function clanWeeklyRanks(
  leagueId: string,
  leagueClanId: string,
  from: Date,
): Promise<WeeklyRankRow[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT s."weekStartAt", s."rank"
      FROM "WeeklyRankSnapshot" s
     WHERE s."leagueId" = ${leagueId}
       AND s."kind" = 'clan'
       AND s."subjectId" = ${leagueClanId}
       AND s."boundary" = ${WEEK_BOUNDARY.current}
       AND s."weekStartAt" >= ${from}
     ORDER BY s."weekStartAt" ASC
  `
  return rows.map((r) => ({ weekStartAt: new Date(r.weekStartAt), rank: r.rank }))
}
