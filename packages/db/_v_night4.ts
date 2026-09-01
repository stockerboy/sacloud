import { prisma } from '@sacloud/db'
async function main() {
  const l = await prisma.$queryRawUnsafe<any[]>(`SELECT "slug","name","official","origin" FROM "League"`)
  console.log('League:', l)
  const cols = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='Match' ORDER BY ordinal_position`)
  console.log('Match 칸:', cols.map(c=>c.column_name).join(' '))
  const ex = await prisma.$queryRawUnsafe<any[]>(
    `SELECT m."sourceMatchId", m."startAt", m."origin", m."formulaVersion", m."ratedAt" IS NOT NULL AS 래더반영,
            (SELECT c."name" FROM "LeagueClan" lc JOIN "Clan" c ON c.id=lc."clanId" WHERE lc.id=m."redLeagueClanId") AS red,
            (SELECT c."name" FROM "LeagueClan" lc JOIN "Clan" c ON c.id=lc."clanId" WHERE lc.id=m."blueLeagueClanId") AS blue
     FROM "Match" m LEFT JOIN LATERAL (SELECT COUNT(*)::int AS c FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) t ON true
     WHERE m."leagueId"=(SELECT id FROM "League" WHERE slug='nolink') AND t.c=0 LIMIT 5`).catch(async () => {
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT m."sourceMatchId", m."startAt", m."origin",
              (SELECT c."name" FROM "LeagueClan" lc JOIN "Clan" c ON c.id=lc."clanId" WHERE lc.id=m."redLeagueClanId") AS red,
              (SELECT c."name" FROM "LeagueClan" lc JOIN "Clan" c ON c.id=lc."clanId" WHERE lc.id=m."blueLeagueClanId") AS blue
       FROM "Match" m LEFT JOIN LATERAL (SELECT COUNT(*)::int AS c FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) t ON true
       WHERE m."leagueId"=(SELECT id FROM "League" WHERE slug='nolink') AND t.c=0 LIMIT 5`)
  })
  console.log('참가기록 0인 IPL 경기 예시:', ex)
  // 참가기록 있는 IPL 경기의 월별
  const w = await prisma.$queryRawUnsafe<any[]>(
    `SELECT to_char(m."startAt",'YYYY-MM') AS 월, COUNT(*)::int AS n
     FROM "Match" m JOIN LATERAL (SELECT COUNT(*)::int AS c FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) t ON true
     WHERE m."leagueId"=(SELECT id FROM "League" WHERE slug='nolink') AND t.c>0 GROUP BY 1 ORDER BY 1`)
  console.log('참가기록 있는 IPL 경기 월별:', w)
}
main().finally(() => prisma.$disconnect())
