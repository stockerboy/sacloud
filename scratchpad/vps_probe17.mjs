import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const r = await p.$queryRaw`SELECT "subject","rawClanNo","redClanName","blueClanName","payload" FROM "BarracksClanMatchRaw" WHERE "matchKey"='260919140127124001' LIMIT 1`
const pl = r[0].payload
console.log('keys', Object.keys(pl))
console.log(JSON.stringify(Object.fromEntries(Object.entries(pl).filter(([k,v]) => typeof v !== 'object'))))
const stats = await p.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "BarracksClanAlias") AS alias_rows, (SELECT COUNT(DISTINCT "subject")::int FROM "BarracksClanAlias") AS subjects, (SELECT COUNT(*)::int FROM "Clan") AS clans, (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" WHERE "rawClanNo" IS NULL AND "status"='ok') AS unfilled`
console.log(JSON.stringify(stats))
await p.$disconnect()
