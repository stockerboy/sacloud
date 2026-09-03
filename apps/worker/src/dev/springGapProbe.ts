/**
 * **4·5월 배틀로그 원문 607건이 왜 라인업이 안 되나** (2026-09-04 · ★읽기 전용★).
 *
 * ```
 * 4월  경기 100건 · 배틀로그 원문 431건 · ★라인업 0★
 * 5월  경기 420건 · 배틀로그 원문 176건 · ★라인업 0★
 * ```
 * ★원문도 있고 경기도 생겼는데 라인업이 0이면 둘이 안 이어진 것★ 이다.
 * ★아침 전에 알아야 한다★ — 안 이어지면 4·5월은 영영 빈다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { ym: string; raws: bigint; in_match: bigint; in_ipl: bigint; with_lineup: bigint }[]
  >`
    WITH b AS (
      SELECT DISTINCT "matchKey" AS k
        FROM "BarracksBattleLogRaw"
       WHERE "matchKey" ~ '^[0-9]{12}' AND substr("matchKey", 1, 4) IN ('2604', '2605', '2603', '2606')
    )
    SELECT '20' || substr(k, 1, 2) || '-' || substr(k, 3, 2) AS ym,
           count(*) AS raws,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Match" m WHERE m."sourceMatchId" = b.k)) AS in_match,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Match" m
               JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
              WHERE m."sourceMatchId" = b.k)) AS in_ipl,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Match" m
               JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
              WHERE m."sourceMatchId" = b.k
                AND EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id"))) AS with_lineup
      FROM b GROUP BY 1 ORDER BY 1
  `
  console.info('══ ★봄철(3~6월) 배틀로그가 어디까지 갔나★ ══')
  console.info('')
  console.info('  달        원문경기   우리Match 에 있음   ★IPL 경기로 있음★   라인업까지')
  console.info('  ' + '─'.repeat(72))
  for (const r of rows) {
    console.info(
      `  ${r.ym}  ${String(Number(r.raws)).padStart(8)}   ${String(Number(r.in_match)).padStart(12)}   ` +
        `${String(Number(r.in_ipl)).padStart(14)}   ${String(Number(r.with_lineup)).padStart(9)}`,
    )
  }
  console.info('')
  console.info('  ★읽는 법★')
  console.info('  ★「우리 Match 에 있음」이 0★ 이면 그 경기를 아직 안 만든 것이다 — 목록을 더 받아야 한다.')
  console.info('  ★「IPL 경기로 있음」만 0★ 이면 다른 리그로 갔거나 IPL 쌍이 아니다.')
  console.info('  ★「라인업까지」만 0★ 이면 투영만 더 돌리면 된다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
