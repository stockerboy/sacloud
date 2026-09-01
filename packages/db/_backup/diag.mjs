import { PrismaClient } from '../generated/client/index.js'
const p = new PrismaClient()
const q = (s) => p.$queryRawUnsafe(s)

console.log('--- placement 별로 나눠 본다 ---')
console.table(
  await q(`
SELECT l.slug, lp.placement,
  count(*)::int n,
  sum(lp.win)::int sum_win, sum(lp.lose)::int sum_lose,
  sum(lp.kill)::int sum_kill,
  sum(lp."placementPlayed")::int sum_played,
  count(*) FILTER (WHERE lp.win+lp.lose > 0)::int has_wl,
  min(lp.rating)::int min_r, max(lp.rating)::int max_r
FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1,2 ORDER BY 1,2`),
)

console.log('--- supply: 랭킹에 든 선수의 win+lose 와 placementPlayed 가 맞는가 ---')
console.table(
  await q(`
SELECT count(*)::int n,
  count(*) FILTER (WHERE lp.win + lp.lose = lp."placementPlayed")::int matches_played,
  count(*) FILTER (WHERE lp.win + lp.lose <> lp."placementPlayed")::int mismatch,
  sum(lp.win + lp.lose)::int total_games, sum(lp."placementPlayed")::int total_played
FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
WHERE l.slug='supply' AND lp.placement = false`),
)

console.log('--- supply: 어긋난 행 표본 ---')
console.table(
  await q(`
SELECT pl.name, lp.rating, lp."placementPlayed", lp.win, lp.lose, lp.kill, lp.death, lp."updatedAt"
FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId" JOIN "Player" pl ON pl.id=lp."playerId"
WHERE l.slug='supply' AND lp.placement = false AND lp.win + lp.lose <> lp."placementPlayed"
ORDER BY lp.win + lp.lose DESC LIMIT 8`),
)

console.log('--- 최근에 누가 이 표를 건드렸나 (updatedAt 분포) ---')
console.table(
  await q(`
SELECT l.slug, date_trunc('minute', lp."updatedAt") AS minute, count(*)::int n
FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
WHERE l.slug IN ('supply','sanply') AND lp."updatedAt" > now() - interval '90 minutes'
GROUP BY 1,2 ORDER BY 2 DESC LIMIT 20`),
)

await p.$disconnect()
