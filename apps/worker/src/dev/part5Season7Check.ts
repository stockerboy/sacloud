/** ★시즌7 적재 검증★ (2026-09-06 · Part 5 ②단계). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<
  Array<{ number: number; season: number | null; n: number; src: string | null }>
>(`
  SELECT s.number, p.season, COUNT(*)::int AS n, MAX(p.source) AS src
    FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id = p."seasonId"
   GROUP BY 1,2 ORDER BY 1 DESC`)
console.info('  내부번호  원본시즌   카드수   source')
for (const r of rows)
  console.info(`  ${String(r.number).padStart(7)} ${String(r.season).padStart(8)} ${String(r.n).padStart(8)}   ${(r.src ?? '-').slice(0, 56)}`)
console.info(`\n  합계 ${rows.reduce((a, b) => a + b.n, 0)}행`)
await prisma.$disconnect()
