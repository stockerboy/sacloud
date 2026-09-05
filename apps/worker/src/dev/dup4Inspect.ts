import { prisma } from '@sacloud/db'
const keys = ['260904031631124001','260904033131124002','260904035142124001','260904041029124001']
const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
  SELECT m."sourceMatchId", l.slug, m.id,
         rc.id AS "redClanId", rc.name AS "redName", rc.slug AS "redSlug", rc.origin AS "redOrigin",
         bc.id AS "blueClanId", bc.name AS "blueName", bc.slug AS "blueSlug"
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
  JOIN "LeagueClan" rl ON rl.id=m."redLeagueClanId" JOIN "Clan" rc ON rc.id=rl."clanId"
  JOIN "LeagueClan" bl ON bl.id=m."blueLeagueClanId" JOIN "Clan" bc ON bc.id=bl."clanId"
  WHERE m."sourceMatchId" = ANY($1::text[]) ORDER BY m."sourceMatchId", l.slug`, keys)
for (const r of rows) {
  console.info(`${r['sourceMatchId']} ${String(r['slug']).padEnd(7)} ${r['redName']}(${r['redSlug']}) vs ${r['blueName']}(${r['blueSlug']})`)
  console.info(`    redClanId=${r['redClanId']} · blueClanId=${r['blueClanId']}`)
}
console.info('\n★nolink 경기 중 라인업이 채워진 비율★')
const fill = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS matches,
         SUM(CASE WHEN s.n > 0 THEN 1 ELSE 0 END)::int AS with_lineup
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
  LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) s ON true
  WHERE l.slug='nolink' AND m."startAt" >= TIMESTAMP '2026-09-02 22:00:00'`)
console.info(JSON.stringify(fill))
await prisma.$disconnect()
