import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
await p.$executeRawUnsafe("SET statement_timeout='500s'")
const r = await p.$queryRaw`
WITH raw AS (
  SELECT DISTINCT ON ("matchKey") "matchKey",
         (payload->>'red_win_cnt')::int rw, (payload->>'blue_win_cnt')::int bw, payload->>'result_wdl' wdl
  FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260920' AND "matchKey" < '260924'
)
SELECT (rw = bw) AS tie, wdl, COUNT(*)::int n FROM raw GROUP BY 1,2 ORDER BY 1,2`
console.log('tie×wdl (9/20~9/23):', JSON.stringify(r))
const d = await p.$queryRaw`
SELECT DISTINCT ON ("matchKey") "matchKey", "subject", "redClanName" red, "blueClanName" blue,
       payload->>'red_win_cnt' rw, payload->>'blue_win_cnt' bw, payload->>'result_wdl' wdl
FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260922' AND "matchKey" < '260924' AND (payload->>'red_win_cnt') = (payload->>'blue_win_cnt') LIMIT 6`
for (const x of d) console.log(JSON.stringify(x))
const ex = await p.$queryRaw`SELECT "matchKey" FROM "Match" WHERE "matchKey" IN ('260919140127124001','260919211033124002','260919045247124001')`
console.log('deluxe keys now in Match:', JSON.stringify(ex))
const c = await p.$queryRaw`SELECT c."name", COUNT(*)::int n, MAX(m."matchKey") latest FROM "Match" m JOIN "Clan" c ON c."id" IN (m."redClanId", m."blueClanId") WHERE c."slug" IN ('ferwfwfwfwf','fdd8') GROUP BY 1`
console.log('deluxe/amaryllis Match count:', JSON.stringify(c))
await p.$disconnect()
