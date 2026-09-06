/** ★세 리그가 다시 들어오고 있나★ (2026-09-06 · Part 4 완료조건). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<Array<{ league: string; clans: number; rows: number }>>(`
  SELECT l.slug AS league,
         COUNT(DISTINCT r."subject")::int AS clans,
         COUNT(*)::int AS rows
    FROM "BarracksClanMatchRaw" r
    JOIN "Clan" c ON c.slug = r."subject"
    JOIN "LeagueClan" lc ON lc."clanId" = c.id AND lc."expelledAt" IS NULL
    JOIN "League" l ON l.id = lc."leagueId"
   WHERE r."fetchedAt" > NOW() - INTERVAL '20 minutes'
     AND l.slug IN ('nolink','supply','sanply')
   GROUP BY 1 ORDER BY 1`)
console.info('  ── 최근 20분 안에 받은 매치목록 원문 (리그별) ──')
if (rows.length === 0) console.info('  ★한 줄도 없다★')
for (const r of rows)
  console.info(`  ${r.league.padEnd(8)} 클랜 ${String(r.clans).padStart(4)}곳 · ${String(r.rows).padStart(6)}줄`)
const [tot] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
  `SELECT COUNT(*)::int AS n FROM "BarracksClanMatchRaw" WHERE "fetchedAt" > NOW() - INTERVAL '20 minutes'`)
console.info(`\n  최근 20분 전체 ${tot?.n ?? 0}줄 (리그에 안 묶인 상대 클랜 포함)`)
await prisma.$disconnect()
