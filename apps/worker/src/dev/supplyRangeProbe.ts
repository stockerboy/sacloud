/** SPL(서플라이) 기록을 어디까지 갖고 있나 (2026-09-04 · ★읽기 전용★) */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<{ ym: string; n: bigint; filled: bigint }[]>`
  SELECT to_char(m."startAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS ym,
         count(*) AS n,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")) AS filled
    FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'supply'
   GROUP BY 1 ORDER BY 1
`
console.info('══ ★SPL 경기 — 달마다★ ══')
console.info('')
let tot = 0, tf = 0
for (const r of rows) {
  const n = Number(r.n), f = Number(r.filled); tot += n; tf += f
  console.info(`  ${r.ym}  ${String(n).padStart(7)}  기록 ${String(f).padStart(7)} (${n?((100*f)/n).toFixed(0):0}%)`)
}
console.info('')
console.info(`  ★합계 ${tot.toLocaleString()}경기 · 기록 있는 것 ${tf.toLocaleString()} (${((100*tf)/tot).toFixed(0)}%)★`)
console.info(`  ★가장 오래된 달 ${rows[0]?.ym} · 가장 최근 ${rows[rows.length-1]?.ym}★`)
await prisma.$disconnect()
