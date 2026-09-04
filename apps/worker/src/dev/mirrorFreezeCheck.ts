import { prisma } from '@sacloud/db'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'
const rows = await prisma.$queryRawUnsafe(`
  SELECT l.slug, m.origin, COUNT(*)::int AS n,
         MAX(m."startAt") AS last_match, MAX(m."ingestedAt") AS last_ingest
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  WHERE m."startAt" >= $1 GROUP BY 1,2 ORDER BY 1,2`, MIRROR_FREEZE_FROM)
console.info('★기준시각 이후 경기 (' + MIRROR_FREEZE_FROM.toISOString() + ' 이후)★')
console.info(JSON.stringify(rows, null, 1))
const total = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Match" WHERE origin = '3rd.supply' AND "startAt" >= $1`, MIRROR_FREEZE_FROM)
console.info('★3rd.supply 신규 경기 총계★ ' + JSON.stringify(total))
const past = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Match" WHERE origin = '3rd.supply' AND "startAt" < $1`, MIRROR_FREEZE_FROM)
console.info('★3rd.supply 과거 경기 (보존돼야 한다)★ ' + JSON.stringify(past))
await prisma.$disconnect()
