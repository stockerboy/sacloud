/**
 * **설박튀 후보가 몇 건인가** — 조건 셋을 겹쳐서 센다 (2026-09-03 · 읽기 전용 · 콜 0개).
 *
 * ══ 사장님이 크기를 주셨다 ══
 *
 * > «10판정도는 나온다 **10판중 한번정도** 나오고 이걸 하면 비매너이다»
 *
 * ★**10% 언저리가 나와야 조건이 맞는 것이다.**★ 훨씬 크거나 작으면 조건이 틀렸다.
 *
 * ⚠ 그리고 사장님이 44%를 ★정정하셨다★ —
 * > «너가 잰 44퍼센트는 **블루팀이 폭탄해체를 완료한 후 레드팀이 나간거** + IPL경기»
 *
 * ★즉 「한 팀 전원 탈주 171,857건」은 설박튀가 아니다.★ 그냥 진 팀이 끝나고 나간 것이다.
 *
 * ══ 조건 셋 ══
 *
 * ```
 * ① ★C4 설치는 있는데 해체가 없다★   `BarracksBattleLogRaw` 의 이벤트
 * ② 한 팀이 ★전원 나감★              `MatchPlayerStat.dropout`
 * ③ 경기가 ★짧게 끝남★
 * ```
 * ⚠ ★**①과 ②는 출처가 다르다.**★ ①은 병영수첩 배틀로그, ②는 3rd.supply 미러다.
 *   ★두 자료가 겹치는 경기가 없으면 겹쳐 셀 수가 없다.★ 그것부터 본다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 0 · ★두 자료가 겹치기는 하는가★ ══\n')
  const overlap = await prisma.$queryRaw<
    { raw_matches: bigint; matched: bigint; with_stats: bigint }[]
  >`
    WITH keys AS (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw" WHERE "status" = 'ok')
    SELECT (SELECT count(*) FROM keys) AS raw_matches,
           count(DISTINCT m."id") AS matched,
           count(DISTINCT m."id") FILTER (WHERE s."id" IS NOT NULL) AS with_stats
      FROM keys k
      JOIN "Match" m ON m."sourceMatchId" = k."matchKey"
      LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
  `
  const o = overlap[0]!
  console.info(`  배틀로그 원문이 있는 경기      ${Number(o.raw_matches).toLocaleString()}건`)
  console.info(`  그중 Match 로 이어진 것        ${Number(o.matched).toLocaleString()}건`)
  console.info(`  ★그중 라인업(dropout)이 있는 것 ${Number(o.with_stats).toLocaleString()}건★`)
  if (Number(o.with_stats) === 0) {
    console.info('\n  ★★두 자료가 안 겹친다 — 조건 ①과 ②를 겹쳐서 셀 수 없다★★')
  }

  console.info('\n══ 1 · ★①만으로★ — C4 설치는 있고 해체가 없는 경기 ══\n')
  const c4 = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH ev AS (
      SELECT r."matchKey",
             bool_or(e->>'event_text' = 'C4 설치') AS planted,
             bool_or(e->>'event_text' = 'C4 해체') AS defused
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok'
       GROUP BY 1
    )
    SELECT CASE WHEN planted AND NOT defused THEN '설치만 (해체 없음)'
                WHEN planted AND defused THEN '설치 + 해체'
                ELSE '설치 없음' END AS label,
           count(*) AS n
      FROM ev GROUP BY 1 ORDER BY 2 DESC
  `
  let total = 0
  for (const r of c4) total += Number(r.n)
  for (const r of c4) {
    console.info(
      `  ${r.label.padEnd(20)} ${Number(r.n).toLocaleString().padStart(7)}건 (${((Number(r.n) / total) * 100).toFixed(1)}%)`,
    )
  }

  console.info('\n══ 2 · ★②③만으로★ — 미러 쪽 (한 팀 전원 탈주 + 짧은 경기) ══\n')
  /*
   * 사장님이 「10판에 1판」이라 하셨다. 조건을 좁혀 가며 몇 %가 되는지 본다.
   * ★한 팀 전원 탈주★ 만으로는 44% 였고 그건 설박튀가 아니라고 정정해 주셨다.
   * 그래서 ★짧은 경기★ 를 겹쳐 본다.
   */
  const rows = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH side_drop AS (
      SELECT s."matchId", s."side", count(*) AS n, count(*) FILTER (WHERE s."dropout" IS TRUE) AS d
        FROM "MatchPlayerStat" s GROUP BY 1, 2
    ),
    whole AS (SELECT DISTINCT "matchId" FROM side_drop WHERE n > 0 AND n = d),
    m2 AS (
      SELECT m."id",
             (w."matchId" IS NOT NULL) AS whole_quit,
             EXTRACT(EPOCH FROM (m."endAt" - m."startAt")) AS secs
        FROM "Match" m
        LEFT JOIN whole w ON w."matchId" = m."id"
       WHERE m."endAt" IS NOT NULL
    )
    SELECT '전체(endAt 있는 것)' AS label, count(*) AS n FROM m2
    UNION ALL SELECT '한 팀 전원 탈주', count(*) FROM m2 WHERE whole_quit
    UNION ALL SELECT '  + 10분 미만', count(*) FROM m2 WHERE whole_quit AND secs < 600
    UNION ALL SELECT '  + 8분 미만', count(*) FROM m2 WHERE whole_quit AND secs < 480
    UNION ALL SELECT '  + 6분 미만', count(*) FROM m2 WHERE whole_quit AND secs < 360
  `
  const base = Number(rows.find((r) => r.label.startsWith('전체'))!.n)
  for (const r of rows) {
    console.info(
      `  ${r.label.padEnd(22)} ${Number(r.n).toLocaleString().padStart(8)}건  ${((Number(r.n) / base) * 100).toFixed(1)}%`,
    )
  }
  console.info('\n  ⚠ 사장님 기준은 ★10판에 1판(10%)★ 이다. 어느 줄이 그 언저리인지 본다')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
