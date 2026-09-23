import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const d = await p.$queryRaw`
SELECT "matchKey", "subject", "redClanName" red, "blueClanName" blue, payload->>'team_name' team, payload->>'red_win_cnt' rw, payload->>'blue_win_cnt' bw, payload->>'result_wdl' wdl, payload->>'match_table_last_round' mtl, payload->>'team_last_round' tlr, payload->>'match_table_first_round' mtf
FROM "BarracksClanMatchRaw" WHERE "matchKey" IN ('260919140127124001','260919211033124002','260919045247124001','260922000216124001','260922000358124001') ORDER BY "matchKey"`
const seen = new Set()
for (const x of d) { const k = x.matchKey + x.subject; if (seen.has(k)) continue; seen.add(k); console.log(JSON.stringify(x)) }
/* 같은 경기를 양쪽이 다 긁은 무승부 표본: 두 subject 의 wdl 이 서로 반대인가 */
const both = await p.$queryRaw`
SELECT "matchKey", array_agg(DISTINCT "subject" || ':' || (payload->>'team_name') || ':' || (payload->>'result_wdl')) sides
FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260922' AND "matchKey" < '260923' AND (payload->>'red_win_cnt') = (payload->>'blue_win_cnt')
GROUP BY 1 HAVING COUNT(DISTINCT "subject") > 1 LIMIT 6`
for (const x of both) console.log(JSON.stringify(x))
const c = await p.$queryRaw`SELECT c."name", COUNT(*)::int n, MAX(m."id") latest FROM "Match" m JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId") JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."slug" IN ('ferwfwfwfwf','fdd8') GROUP BY 1`
console.log('deluxe/amaryllis Match count:', JSON.stringify(c))
const before = await p.$queryRaw`SELECT l."slug", COUNT(*)::int n FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId" WHERE lc."expelledAt" >= '2026-09-22 00:15:55' AND lc."expelledAt" < '2026-09-22 00:15:57' GROUP BY 1`
console.log('expelled at 09-22 00:15:56 by league:', JSON.stringify(before))
const r = await p.$executeRaw`UPDATE "LeagueClan" lc SET "expelledAt" = NULL FROM "League" l WHERE l."id" = lc."leagueId" AND l."slug" IN ('nolink','sanply','supply') AND lc."expelledAt" >= '2026-09-22 00:15:55' AND lc."expelledAt" < '2026-09-22 00:15:57'`
console.log('restored rows:', r)
await p.$disconnect()
