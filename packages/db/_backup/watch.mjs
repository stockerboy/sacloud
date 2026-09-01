/** 다른 프로세스가 지금도 쓰고 있는지 본다. 읽기 전용. */
import { PrismaClient } from '../generated/client/index.js'
const p = new PrismaClient()
const q = (s) => p.$queryRawUnsafe(s)

for (let i = 0; i < 3; i += 1) {
  const rows = await q(`
    SELECT l.slug,
      to_char(max(lp."updatedAt"),'HH24:MI:SS.MS') AS last_write,
      count(*) FILTER (WHERE lp."updatedAt" > now() - interval '60 seconds')::int AS last_60s
    FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
    WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`)
  const clan = await q(`
    SELECT l.slug, to_char(max(lc."updatedAt"),'HH24:MI:SS.MS') AS last_clan_write
    FROM "LeagueClan" lc JOIN "League" l ON l.id=lc."leagueId"
    WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`)
  const now = await q(`SELECT to_char(now(),'HH24:MI:SS') AS now`)
  console.log('[' + now[0].now + '] ' + JSON.stringify(rows) + ' | ' + JSON.stringify(clan))
  if (i < 2) await new Promise((r) => setTimeout(r, 15000))
}
await p.$disconnect()
