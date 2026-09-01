/**
 * 선수 한 명의 **래더 참가 기록을 한 번에** 읽는다 (2026-09-01 · D-239 후속).
 *
 * ── 왜 만들었나
 *   기록실(`/api/leagues/{slug}/players/{id}`)이 **DB 를 39번 왕복**했다.
 *   운영 `DATABASE_URL` 은 `connection_limit=1` 이라 (D-239) `Promise.all` 이
 *   병렬로 돌지 않는다 — 39번이 **줄줄이** 일어나고 그 합이 함수 제한시간을 넘으면
 *   500 이다. 통로를 5로 늘려 봤더니 Supabase 풀러가 고갈돼 되돌렸다.
 *   **남은 길은 왕복 자체를 줄이는 것뿐이다.**
 *
 *   그 39번 중 **15번**이 아래 여섯 조회였다.
 *
 *     playerLadderTotals    6   (누적 · 승수 · MVP · 무기별 · 어시/헤드샷)
 *     buildPlayerForm       3   (6개월 그래프 + 최근 40경기, 중첩 `match` 가 한 번 더)
 *     playerTodayTally      2   (오늘 집계 + 승수)
 *     playerRecentDays      2   (최근 3일, 중첩 `match` 가 한 번 더)
 *     playerTierBreakdown   2   (티어별 판수, 중첩 `match` 가 한 번 더)
 *
 *   여섯이 **전부 같은 모집단**을 읽고 있었다. 각 파일의 주석이 그걸 말한다 —
 *   「모집단은 화면의 다른 수치와 같다: `withLadderMatch()` + `seasonWindowWhere()`」.
 *   같은 행을 여섯 번 읽을 이유가 없다. **한 번 읽어 여섯이 나눠 쓴다.**
 *
 * ── 왜 이건 D-238 의 함정이 아닌가
 *   D-238 은 「요청마다 리그 전체를 읽어 접다가」 죽은 사고다. 여기서 읽는 것은
 *   **선수 한 명의 행**이다. 실측(2026-09-01 · 로컬 미러): 시즌0 창 안에서 가장 많이 뛴
 *   선수가 **927행**이고, 그 아래는 900·818·663… 으로 줄어든다.
 *   컬럼도 14칸(전부 정수·짧은 id)이라 한 선수분이 100KB 를 넘지 않는다.
 *   게다가 `playerTierBreakdown` 은 **이미 그 전량을 읽고 있었다**(`take` 없음) —
 *   바이트는 사실상 그대로이고 왕복만 줄어든다.
 *
 * ── 조건을 여기 베껴 적는 것에 대하여
 *   Prisma 로는 여섯 곳의 필요를 한 질의에 담을 수 없어 `$queryRaw` 를 쓴다.
 *   그래서 「래더 경기」(`ladderScope.ts`)와 「시즌0 창」(`season0Scope.ts`)의 조건이
 *   **SQL 로 한 번 더 적힌다.** 이미 `rankings.ts` 의 `getFormTop` 이 같은 이유로
 *   같은 일을 하고 있고, 거기 주석이 위험을 적어 뒀다 — 조건이 바뀌면 여기도 고쳐야 한다.
 *   그래서 **값은 절대 베끼지 않는다.** `SEASON0_FROM` · `SEASON0_TO` ·
 *   `SEASON0_ORIGINS` 를 그대로 바인드 파라미터로 넘긴다. 손으로 적는 것은
 *   「`redRatingUpdate` 가 있거나 origin 이 목록에 있다」는 **모양**뿐이다.
 *
 * ── 정렬
 *   `startAt DESC, matchId DESC` 다. `buildPlayerForm` 의 최근 40경기가 쓰던 정렬과
 *   **똑같고**, `playerRecentDays` 가 쓰던 정렬(`startAt DESC` 만)보다 **결정적**이다.
 *   그쪽은 동시각 경기가 있으면 실행마다 순서가 흔들릴 수 있었다.
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_ORIGINS, SEASON0_TO } from './season0Scope'

/**
 * 참가 기록 한 줄 + 그 경기의 최소 정보.
 *
 * 여섯 소비자가 필요로 하는 칸의 합집합이다. 여기에 칸을 더할 때는
 * **선수 한 명분이 몇 KB 늘어나는지** 생각하고 더한다.
 */
export interface PlayerLadderRow {
  matchId: string
  startAt: Date
  /** `"red"` | `"blue"` — 무승부가 없다 */
  winnerSide: string
  redLeagueClanId: string
  blueLeagueClanId: string
  /** 이 선수가 뛴 진영 */
  side: string
  /** `0 = 라이플` / `1 = 스나이퍼` / `null = 모름` (D-034) */
  weapon: number | null
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  /** `0` 은 결측의 표식이다 — 「딜을 0 넣었다」가 아니다 (D-209 · `dropoutScope.ts`) */
  damage: number | null
  /** 모르면 `null`. `false` 는 「MVP 가 아니었다」는 실제 정보다 (D-034) */
  mvp: boolean | null
  /** **경기 당시** 상대 부리그 스냅샷 (`CLAUDE.md` 3-B 4번) */
  opponentDivisionAtMatch: number
}

/**
 * 그 리그에서 이 선수의 **현재 시즌 창 안 래더 참가 기록 전부**.
 *
 * Prisma 로 쓰면 이렇다 — 값이 같아야 하는 기준은 언제나 이쪽이다.
 *
 * ```ts
 * prisma.matchPlayerStat.findMany({
 *   where: { playerId, match: withLadderMatch({ leagueId, ...seasonWindowWhere() }) },
 *   orderBy: [{ match: { startAt: 'desc' } }, { matchId: 'desc' }],
 * })
 * ```
 */
/**
 * **`Date` 를 그대로 바인드하면 어긋난다.** 반드시 이걸 거쳐라 (2026-09-01 실측).
 *
 * `Match.startAt` 은 `timestamp without time zone` 이고 값은 UTC 로 들어 있다.
 * 그런데 Prisma 는 JS `Date` 를 **`timestamptz`** 로 보내므로, 비교하는 순간
 * PostgreSQL 이 **세션 TimeZone 으로** 바꿔 버린다. 이 컴퓨터의 세션은 `Asia/Seoul` 이라
 * 경계가 통째로 9시간 밀렸다 — 실측으로 `startAt >= 시즌0시작` 이 34,926건에서
 * 34,794건으로 **132건 줄었다.** 화면 숫자가 조용히 작아진다.
 *
 * 그래서 시간대 표시를 뗀 문자열로 넘기고 `::timestamp` 로 못 박는다.
 * 이렇게 하면 세션 TimeZone 이 무엇이든 값이 같다.
 *
 * ⚠ 같은 함정이 `rankings.ts` 의 `getFormTop` 에도 있다 (`$queryRaw` 에 `Date` 를 그대로
 *   바인드한다). 그쪽은 이 작업의 범위가 아니라 손대지 않았다 — **고칠 때 값이 바뀐다.**
 */
/**
 * ⚠ **정정 (2026-09-01 저녁) — `Prisma.sql` 을 돌려주지 않는다**
 *
 * 원래 이 함수는 ``Prisma.sql`${…}::timestamp` `` 를 돌려주고, 아래 큰 질의의
 * `${}` 안에 그것을 **끼워 넣었다**. `tsx` 로 직접 부르면 잘 돌았다. 그런데
 * **Next 개발/빌드 번들 안에서는 운영이 500 이었다.**
 *
 * ```
 * Raw query failed. Code: 42601. Message: ERROR: syntax error at or near "$4"
 *   at getLeaguePlayerDetail (lib/server/queries/records.ts:687)
 * ```
 *
 * ── 왜 번들에서만 깨지나
 *   Prisma 는 끼워 넣은 값이 `Sql` 인지 **`instanceof` 로** 판별해, 맞으면 문장으로 펴고
 *   아니면 **바인딩 파라미터로** 넘긴다. 번들러가 Prisma 런타임 사본을 두 벌 만들면
 *   `instanceof` 가 어긋나고, 그 순간 `…::timestamp` 조각이 통째로 **값 하나**가 되어
 *   SQL 이 부서진다. 그래서 뒤에 오는 `$4` 자리에서 문법 오류가 난다.
 *   `tsx` 는 사본이 한 벌이라 이 함정을 못 본다 — **로컬에서 재현이 안 되던 이유다.**
 *
 * ── 그래서 이제 **문자열만** 돌려준다
 *   `::timestamp` 캐스트는 질의문 쪽에 리터럴로 적는다. 끼워 넣는 것은 늘 «값 하나»뿐이라
 *   런타임이 몇 벌이든 결과가 같다.
 *
 * 시간대를 떼는 이유는 아래 원래 주석 그대로다.
 */
function pgTimestampText(value: Date): string {
  return value.toISOString().replace('Z', '')
}

export async function playerLadderRows(
  leagueId: string,
  playerId: string,
): Promise<PlayerLadderRow[]> {
  /* 창의 끝은 열려 있을 수 있다 (`SEASON0_TO === null`). 그때는 조건을 아예 붙이지 않는다 —
     `new Date()` 로 메우면 요청마다 값이 달라진다 (`season0Scope.ts` 와 같은 이유) */
  /* ⚠ `Prisma.sql` 조각을 만들어 끼워 넣지 않는다 (위 `pgTimestampText` 주석).
     상한이 없으면 `null` 을 넣고 질의문에서 `IS NULL` 로 걸러 낸다 —
     조건 한 줄을 통째로 끼워 넣던 것을 **값 하나**로 바꾼 것이다. */
  const upperBound = SEASON0_TO ? pgTimestampText(SEASON0_TO) : null

  return prisma.$queryRaw<PlayerLadderRow[]>`
    SELECT s."matchId"                  AS "matchId",
           m."startAt"                  AS "startAt",
           m."winnerSide"               AS "winnerSide",
           m."redLeagueClanId"          AS "redLeagueClanId",
           m."blueLeagueClanId"         AS "blueLeagueClanId",
           s."side"                     AS "side",
           s."weapon"                   AS "weapon",
           s."kill"                     AS "kill",
           s."death"                    AS "death",
           s."assist"                   AS "assist",
           s."headshot"                 AS "headshot",
           s."damage"                   AS "damage",
           s."mvp"                      AS "mvp",
           s."opponentDivisionAtMatch"  AS "opponentDivisionAtMatch"
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
     WHERE s."playerId" = ${playerId}
       AND m."leagueId" = ${leagueId}
       AND m."startAt" >= ${pgTimestampText(SEASON0_FROM)}::timestamp
       AND (${upperBound}::timestamp IS NULL OR m."startAt" < ${upperBound}::timestamp)
       AND (m."redRatingUpdate" IS NOT NULL OR m."origin" = ANY(${[...SEASON0_ORIGINS]}::text[]))
     ORDER BY m."startAt" DESC, s."matchId" DESC
  `
}

/* -------------------------------------------------------------------------- */
/* 여러 곳이 똑같이 쓰는 셈                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 이 경기를 이겼나 — **내가 뛴 진영**이 승리 진영과 같은가.
 *
 * 현재 소속으로 판정하지 않는다. 이적·용병이면 어긋난다 (D-131 · D-135).
 * Prisma 조건(`playerTotals.ts` · `todayPerformance.ts`)이 `red`/`blue` 를 하나씩
 * 적어 두었으므로 **그 모양 그대로** 옮긴다.
 */
export function isWin(row: Pick<PlayerLadderRow, 'side' | 'winnerSide'>): boolean {
  return (
    (row.side === 'red' && row.winnerSide === 'red') ||
    (row.side === 'blue' && row.winnerSide === 'blue')
  )
}

/**
 * 딜량이 **탈주로 0 이 박힌 기록이 아닌가** — 어시·헤드샷을 더할 수 있는 행인가.
 *
 * `dropoutScope.ts` 의 `notZeroedWhere()` 와 **같은 판정**이다.
 * `null`(딜량을 아예 모름)은 남긴다 — 그 행의 어시는 진짜 값일 수 있다.
 */
export function isNotZeroed(row: Pick<PlayerLadderRow, 'damage'>): boolean {
  return row.damage === null || row.damage > 0
}

/**
 * Prisma `_sum` 과 **같은 뜻의 합**.
 *
 * 행이 하나도 없거나 값이 전부 `null` 이면 `null` 이다 — 0 이 아니다.
 * 0 으로 접으면 「0어시를 했다」는 없는 사실이 된다 (D-034 · D-106).
 */
export function sumOrNull(values: readonly (number | null)[]): number | null {
  let total: number | null = null
  for (const value of values) {
    if (value === null) continue
    total = (total ?? 0) + value
  }
  return total
}
