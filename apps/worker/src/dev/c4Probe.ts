import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
  WITH ev AS (
    SELECT r."matchKey",
           bool_or(e->>'event_text' = 'C4 설치')  AS planted,
           bool_or(e->>'event_text' = 'C4 해체')  AS defused
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok'
     GROUP BY 1
  )
  SELECT CASE
           WHEN planted AND defused     THEN '설치 + 해체'
           WHEN planted AND NOT defused THEN '★설치만 (해체 없음)★'
           ELSE '설치 없음'
         END AS label,
         count(*) AS n
    FROM ev GROUP BY 1 ORDER BY 2 DESC
`
console.info('병영수첩 배틀로그 원문에서 C4 이벤트')
for (const r of rows) console.info('  %s  %s건', r.label.padEnd(22), Number(r.n).toLocaleString())
await prisma.$disconnect()
