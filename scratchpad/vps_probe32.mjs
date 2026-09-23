import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient(); const q = (s) => p.$queryRawUnsafe(s)
console.log('deluxe 원문 목록 최근 fetch:', JSON.stringify(await q(`SELECT COUNT(*)::int n, MAX("fetchedAt")::text last, MAX("matchKey") lastkey FROM "BarracksClanMatchRaw" WHERE "subject"='ferwfwfwfwf'`)))
console.log('deluxe 원문 최근 24h:', JSON.stringify(await q(`SELECT COUNT(*)::int n FROM "BarracksClanMatchRaw" WHERE "subject"='ferwfwfwfwf' AND "fetchedAt" > now() - interval '24 hours'`)))
console.log('deluxe Match 최근:', JSON.stringify(await q(`SELECT m."id", m."startAt"::text, m."origin" FROM "Match" m JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId") JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."slug"='ferwfwfwfwf' ORDER BY m."startAt" DESC LIMIT 3`)))
await p.$disconnect()
