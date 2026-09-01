import { PrismaClient } from '../generated/client/index.js'
const p = new PrismaClient()
const q = (s) => p.$queryRawUnsafe(s)

console.log('--- LeaguePlayer 상태 ---')
console.table(
  await q(`
SELECT l.slug, count(*)::int players,
  count(*) FILTER (WHERE lp.placement)::int in_placement,
  count(*) FILTER (WHERE NOT lp.placement)::int ranked,
  count(*) FILTER (WHERE lp."placementPlayed" > 0)::int played_gt0,
  min(lp.rating)::int min_r, max(lp.rating)::int max_r,
  sum(lp.win)::int sum_win, sum(lp.lose)::int sum_lose, sum(lp.kill)::int sum_kill
FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)

console.log('--- LeagueClan 상태 ---')
console.table(
  await q(`
SELECT l.slug, count(*)::int clans,
  count(*) FILTER (WHERE NOT lc.placement)::int ranked,
  min(lc.rating)::int min_r, max(lc.rating)::int max_r
FROM "LeagueClan" lc JOIN "League" l ON l.id=lc."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)

console.log('--- LeaguePlayerWeaponStat (sanply 는 지워졌다가 다시 써지는 중일 수 있다) ---')
console.table(
  await q(`
SELECT l.slug, ws.weapon, count(*)::int rows, sum(ws.games)::int games
FROM "LeaguePlayerWeaponStat" ws
JOIN "LeaguePlayer" lp ON lp.id=ws."leaguePlayerId"
JOIN "League" l ON l.id=lp."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1,2 ORDER BY 1,2`),
)

console.log('--- 원본이 안 건드려졌는지 (개수는 수집 때문에 늘 수만 있다) ---')
console.table(
  await q(`
SELECT l.slug, count(*)::int matches,
  count(m."redSourceRatingUpdate")::int red_src, count(m."blueSourceRatingUpdate")::int blue_src,
  count(*) FILTER (WHERE m."redSourceRatingUpdate" IS NOT NULL OR m."blueSourceRatingUpdate" IS NOT NULL)::int either_src
FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)
console.table(
  await q(`
SELECT l.slug, count(*)::int stats, count(s."sourceRatingDelta")::int src_delta
FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId" JOIN "League" l ON l.id=m."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)

await p.$disconnect()
