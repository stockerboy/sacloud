/** ★원문이 시간대별로 얼마나 늘어 왔나★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<Array<{ t: string; n: number }>>(`
  SELECT to_char("fetchedAt" AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS t, COUNT(*)::int AS n
    FROM "BarracksClanMatchRaw"
   WHERE "fetchedAt" > NOW() - INTERVAL '6 hours'
   GROUP BY 1 ORDER BY 1 DESC LIMIT 20`)
console.info('  ── 매치목록 원문이 새로 들어온 시각 (KST · 분 단위) ──')
for (const r of rows) console.info(`  ${r.t}  ${r.n}줄`)
const [gap] = await prisma.$queryRawUnsafe<Array<{ last: string; ago: number }>>(`
  SELECT to_char(MAX("fetchedAt") AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI:SS') AS last,
         EXTRACT(EPOCH FROM (NOW() - MAX("fetchedAt")))::int AS ago
    FROM "BarracksClanMatchRaw"`)
console.info(`\n  마지막 ${gap?.last} · ★${gap?.ago}초 전★`)
await prisma.$disconnect()
