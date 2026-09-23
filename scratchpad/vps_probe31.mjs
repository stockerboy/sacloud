/* clan-find-missing 이 만든 클랜(2026-09-21 16:3x UTC) — 지금 등록 상태와 경기 수 (읽기만) */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const rows = await p.$queryRawUnsafe(`
  SELECT c."name", c."slug", c."createdAt"::text created, l."slug" league, lc."expelledAt"::text expelled,
    (SELECT COUNT(*)::int FROM "Match" m WHERE lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId")) matches,
    (SELECT MAX(m."startAt")::text FROM "Match" m WHERE lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId")) last_match
  FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c."id" JOIN "League" l ON l."id"=lc."leagueId"
  WHERE c."createdAt" >= '2026-09-21 16:00' AND c."createdAt" < '2026-09-21 18:00'
  ORDER BY c."createdAt"`)
console.log(`줄 ${rows.length}`)
for (const r of rows) console.log(JSON.stringify(r))
const tot = rows.reduce((a, r) => a + r.matches, 0)
console.log('경기 합', tot, '· 지금 활성', rows.filter((r) => r.expelled === null).length)
await p.$disconnect()
