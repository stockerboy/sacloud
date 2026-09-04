/** ★적재 전/후 대조자★ — 같은 질문을 두 번 물어 차이를 본다 (2026-09-04 · Part 1) */
import { prisma } from '@sacloud/db'
const q = async (label: string, sql: string) => {
  const r = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql)
  console.info(`\n### ${label}`)
  console.info(JSON.stringify(r, null, 1))
}
await q('LeaguePlayerSeason 행수 (전체 · 리그별)', `
  SELECT l.slug, COUNT(*)::int AS rows FROM "LeaguePlayerSeason" s
  JOIN "LeaguePlayer" lp ON lp.id=s."leaguePlayerId"
  JOIN "League" l ON l.id=lp."leagueId" GROUP BY 1 ORDER BY 1`)
await q('supply 시즌 행 (번호·종류)', `
  SELECT s.number, s."seasonType", s.status, s.frozen FROM "Season" s
  JOIN "League" l ON l.id=s."leagueId" WHERE l.slug='supply' ORDER BY s.number`)
await q('시즌0·시즌1 에 붙은 카드 (0이어야 한다)', `
  SELECT s.number, COUNT(*)::int AS rows FROM "LeaguePlayerSeason" ps
  JOIN "Season" s ON s.id=ps."seasonId" JOIN "League" l ON l.id=s."leagueId"
  WHERE l.slug='supply' AND s.number IN (0,1) GROUP BY 1`)
await q('Match / MatchPlayerStat (건드리면 안 되는 것)', `
  SELECT (SELECT COUNT(*)::int FROM "Match") AS matches,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat") AS stats,
         (SELECT COUNT(*)::int FROM "LeagueClan") AS league_clans`)
await q('LeaguePlayer.sourceLeaguePlayerId 채워진 수 (supply)', `
  SELECT COUNT(*)::int AS filled FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND lp."sourceLeaguePlayerId" IS NOT NULL`)
await prisma.$disconnect()
