import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const ex = await p.$queryRaw`SELECT "id" FROM "Match" WHERE "id" IN ('260919140127124001','260919211033124002','260919045247124001')`
console.log('deluxe keys now in Match:', JSON.stringify(ex))
const c = await p.$queryRaw`SELECT c."name", COUNT(*)::int n, MAX(m."id") latest FROM "Match" m JOIN "Clan" c ON c."id" IN (m."redClanId", m."blueClanId") WHERE c."slug" IN ('ferwfwfwfwf','fdd8') GROUP BY 1`
console.log('deluxe/amaryllis Match count:', JSON.stringify(c))
/* 만료 21곳 복구 — cpl 리그는 건드리지 않는다 */
const before = await p.$queryRaw`SELECT l."slug", COUNT(*)::int n FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId" WHERE lc."expelledAt" >= '2026-09-22 00:15:55' AND lc."expelledAt" < '2026-09-22 00:15:57' GROUP BY 1`
console.log('expelled at 09-22 00:15:56 by league:', JSON.stringify(before))
const r = await p.$executeRaw`UPDATE "LeagueClan" lc SET "expelledAt" = NULL FROM "League" l WHERE l."id" = lc."leagueId" AND l."slug" IN ('nolink','sanply','supply') AND lc."expelledAt" >= '2026-09-22 00:15:55' AND lc."expelledAt" < '2026-09-22 00:15:57'`
console.log('restored rows:', r)
await p.$disconnect()
