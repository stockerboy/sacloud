/** 아티팩트에 넣을 클랜 둘 — 경기 많이 한 곳으로 (2026-09-17) */
import { PrismaClient } from '/root/sacloud/packages/db/generated/client/index.js'
const p = new PrismaClient()
await p.$executeRawUnsafe(`SET statement_timeout='600s'`)
const rows = await p.$queryRawUnsafe(`
  SELECT c."name" clan, c."slug" cslug, l."slug" league, h."matches" g, h."tally" tally, h."axesMeasured" measured
    FROM "ClanHexV2Summary" h
    JOIN "LeagueClan" lc ON lc."id" = h."leagueClanId"
    JOIN "Clan" c ON c."id" = lc."clanId"
    JOIN "League" l ON l."id" = lc."leagueId"
   ORDER BY h."matches" DESC LIMIT 6`)
console.log(JSON.stringify({ clans: rows }, (k, v) => (typeof v === 'bigint' ? Number(v) : v)))
await p.$disconnect()
