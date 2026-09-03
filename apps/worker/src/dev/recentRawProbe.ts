/** 방금 받은 배틀로그가 어느 달인가 (2026-09-04 · ★읽기 전용★) — 기간 필터가 먹었는지 본다 */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<{ ym: string; n: bigint }[]>`
  SELECT '20' || substr("matchKey", 1, 2) || '-' || substr("matchKey", 3, 2) AS ym, count(*) AS n
    FROM "BarracksBattleLogRaw"
   WHERE "fetchedAt" > now() - interval '40 minutes' AND "matchKey" ~ '^[0-9]{12}'
   GROUP BY 1 ORDER BY 2 DESC
`
console.info('══ ★최근 40분에 받은 배틀로그★ ══')
console.info('')
for (const r of rows) console.info(`  ${r.ym}  ★${Number(r.n).toLocaleString()}건★`)
if (rows.length === 0) console.info('  (없다)')
console.info('')
console.info('  ★3~6월만 나와야 맞다★ — 8~9월이 섞여 있으면 기간 필터가 안 먹은 것이다')
await prisma.$disconnect()
