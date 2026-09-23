/* ★두 갈래 규모★ — 3rd.supply 출신(SUP-) 선수와 병영(BRK-) 선수가 같은 이름 · 같은 리그 클랜인 쌍 */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const rows = await p.$queryRawUnsafe(`
  WITH sup AS (SELECT pl."id", pl."name", lp."leagueId", lp."clanId" FROM "Player" pl JOIN "LeaguePlayer" lp ON lp."playerId"=pl."id" WHERE pl."origin"='3rd.supply'),
       brk AS (SELECT pl."id", pl."name", lp."leagueId", lp."clanId", pl."clanId" AS pclan FROM "Player" pl JOIN "LeaguePlayer" lp ON lp."playerId"=pl."id" WHERE pl."origin"='nexon_barracks')
  SELECT s."name", s."id" sup_id, b."id" brk_id, l."slug" league, c."name" clan, b.pclan brk_player_clan,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" x WHERE x."playerId"=s."id") sup_stats,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" x WHERE x."playerId"=b."id") brk_stats,
         (SELECT MAX(m."startAt") FROM "MatchPlayerStat" x JOIN "Match" m ON m."id"=x."matchId" WHERE x."playerId"=b."id") brk_last
  FROM sup s JOIN brk b ON b."name"=s."name" AND b."leagueId"=s."leagueId" AND b."clanId" IS NOT DISTINCT FROM s."clanId"
  JOIN "League" l ON l."id"=s."leagueId" LEFT JOIN "Clan" c ON c."id"=s."clanId"
  ORDER BY brk_last DESC NULLS LAST`)
console.log(`같은 이름·같은 리그클랜 쌍: ${rows.length}`)
for (const r of rows.slice(0, 40)) console.log(JSON.stringify(r))
const sameNameOnly = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int n FROM (SELECT DISTINCT a."id", b."id" bid FROM "Player" a JOIN "Player" b ON a."name"=b."name" AND a."origin"='3rd.supply' AND b."origin"='nexon_barracks') t`)
console.log('이름만 같은 쌍(리그클랜 무관):', JSON.stringify(sameNameOnly))
const brkNoClan = await p.$queryRawUnsafe(`SELECT COUNT(*)::int n FROM "Player" pl WHERE pl."origin"='nexon_barracks' AND pl."clanId" IS NULL AND EXISTS (SELECT 1 FROM "LeaguePlayer" lp WHERE lp."playerId"=pl."id" AND lp."clanId" IS NOT NULL)`)
console.log('BRK 선수인데 Player.clanId 는 비고 LeaguePlayer 엔 클랜 있는 수:', JSON.stringify(brkNoClan))
await p.$disconnect()
