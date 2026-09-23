import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const slugs = ['ferwfwfwfwf', 'fdd8', 'SDFSD123451', 'wonju1', 'asdf2as', 'Nineoneclan']
const cols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='BarracksListRequest' ORDER BY ordinal_position`
console.log('BarracksListRequest cols', cols.map((c) => c.column_name).join(','))
const req = await p.$queryRaw`SELECT "subject", COUNT(*)::int AS n, MAX("requestedAt") AS last, MIN("requestedAt") AS first FROM "BarracksListRequest" WHERE "subject" = ANY(${slugs}) GROUP BY "subject"`
console.log('list requests', JSON.stringify(req))
const lastReq = await p.$queryRaw`SELECT "subject", "requestedAt", "status", "errorCode" FROM "BarracksListRequest" WHERE "subject"='ferwfwfwfwf' ORDER BY "requestedAt" DESC LIMIT 5`.catch((e) => 'ERR ' + e.message.slice(0, 200))
console.log('deluxe last requests', JSON.stringify(lastReq))
/* deluxe 의 등록 — expelledAt 여부 */
const lcs = await p.$queryRaw`SELECT lc."id", l."slug" AS league, lc."expelledAt", lc."status", lc."win", lc."lose" FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId" JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."slug"='ferwfwfwfwf'`
console.log('deluxe LeagueClan rows', JSON.stringify(lcs))
/* 24 곳 전부 — expelledAt / 마지막 요청 */
const miss = ['SDFSD123451','wonju1','revivalcrew','alsrmsgmlwn12','Cherish20','4and','regg','lllllr8','FEXPERT','ipl-yoonsh1971','hhmk8299','ipl-backspace00','20210223','thefirst100','sologame','cutezzzz','topGiJang','yoonjae06','qwdklqhwkldq','solbi0723','asdf2as','ferwfwfwfwf','Nineoneclan','smilemiso']
const rows = await p.$queryRaw`
  SELECT c."slug", c."origin", bool_or(lc."expelledAt" IS NULL) AS any_active, string_agg(l."slug" || (CASE WHEN lc."expelledAt" IS NULL THEN '' ELSE '(x)' END), ',') AS leagues,
         (SELECT MAX(r."requestedAt") FROM "BarracksListRequest" r WHERE r."subject"=c."slug") AS last_req,
         (SELECT MAX(m."fetchedAt") FROM "BarracksClanMatchRaw" m WHERE m."subject"=c."slug") AS last_raw
  FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c."id" JOIN "League" l ON l."id"=lc."leagueId"
  WHERE c."slug" = ANY(${miss}) GROUP BY c."slug", c."origin" ORDER BY last_req NULLS FIRST`
for (const r of rows) console.log('  ', r.slug, r.origin, 'active', r.any_active, r.leagues, 'lastReq', r.last_req?.toISOString?.().slice(5,16) ?? '-', 'lastRaw', r.last_raw?.toISOString?.().slice(5,16) ?? '-')
await p.$disconnect()
