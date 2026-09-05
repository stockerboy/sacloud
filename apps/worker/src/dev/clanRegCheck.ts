import { prisma } from '@sacloud/db'
const ids = ['cmtbb2z4f000gvl6gfj4ww2dp','cmtbmdbs12ahrvlxwb2i6537q','cmtbb30ne000zvl6gclagqg39']
const r = await prisma.$queryRawUnsafe(`
  SELECT c.name, c.slug, c.id, l.slug AS league, lc.status, lc."expelledAt", lc."joinedAt", lc.id AS lc
  FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c.id JOIN "League" l ON l.id=lc."leagueId"
  WHERE c.id = ANY($1::text[]) ORDER BY c.name, l.slug`, ids)
console.info(JSON.stringify(r, null, 1))
await prisma.$disconnect()
