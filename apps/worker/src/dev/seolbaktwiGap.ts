/**
 * ★우리가 놓치는 경기 — 지금 당장 채울 수 있는 게 몇 건인가★ (2026-09-04 · 읽기 전용).
 */
import { prisma } from '@sacloud/db'
const pc = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)
async function main() {
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH lst AS (
      SELECT "matchKey" AS k, max("payload"->>'red_clan_name') AS rn,
             max("payload"->>'blue_clan_name') AS bn
        FROM "BarracksClanMatchRaw" WHERE "status" = 'ok' GROUP BY 1
    ),
    ours AS (
      SELECT lst.* FROM lst
       WHERE EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = lst.rn)
         AND EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = lst.bn)
    ),
    bl AS (SELECT DISTINCT "matchKey" AS k FROM "BarracksBattleLogRaw" WHERE "status" = 'ok')
    SELECT '양 팀 다 우리 클랜인 목록 경기' AS label, count(*) AS n FROM ours
    UNION ALL SELECT '  우리 Match 에 있음', count(*) FROM ours
      WHERE EXISTS (SELECT 1 FROM "Match" m WHERE m."sourceMatchId" = ours.k)
    UNION ALL SELECT '★  우리 Match 에 없음 = 새는 양★', count(*) FROM ours
      WHERE NOT EXISTS (SELECT 1 FROM "Match" m WHERE m."sourceMatchId" = ours.k)
    UNION ALL SELECT '★★    그중 배틀로그까지 이미 받아 둔 것★★', count(*) FROM ours
      WHERE NOT EXISTS (SELECT 1 FROM "Match" m WHERE m."sourceMatchId" = ours.k)
        AND EXISTS (SELECT 1 FROM bl WHERE bl.k = ours.k)
  `)
  const d = Number(a[0]!.n)
  for (const x of a) console.info(`  ${x.label.padEnd(40)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 라인업 0명인 경기 ══\n')
  const b = await prisma.$queryRawUnsafe<{ league: string; n: bigint; empty: bigint; bl: bigint }[]>(`
    SELECT l."slug" AS league, count(*) AS n,
           count(*) FILTER (WHERE s.cnt = 0) AS empty,
           count(*) FILTER (WHERE s.cnt = 0 AND EXISTS (
             SELECT 1 FROM "BarracksBattleLogRaw" r
              WHERE r."matchKey" = m."sourceMatchId" AND r."status" = 'ok')) AS bl
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
      LEFT JOIN LATERAL (SELECT count(*) AS cnt FROM "MatchPlayerStat" ss WHERE ss."matchId" = m."id") s ON true
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of b) {
    const n = Number(x.n)
    console.info(`  ${x.league.padEnd(10)} 경기 ${n.toLocaleString().padStart(7)}  ★라인업0명 ${Number(x.empty).toLocaleString().padStart(6)} (${pc(Number(x.empty), n)})★  그중 배틀로그 있음 ${Number(x.bl).toLocaleString().padStart(6)}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
