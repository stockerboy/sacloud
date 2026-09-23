import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const r = await p.$queryRaw`SELECT * FROM "BarracksListRequest" WHERE "subject" IN ('ferwfwfwfwf','ipl-backspace00','ipl-yoonsh1971','fdd8') ORDER BY "subject"`
console.log(JSON.stringify(r, null, 1))
/* 만료(expelledAt) 처리된 등록 중 최근 7일 경기가 있는 클랜 — 몇 곳이고 언제 만료됐나 */
const ex = await p.$queryRaw`
  SELECT l."slug" AS league, COUNT(*)::int AS n, MIN(lc."expelledAt") AS first_exp, MAX(lc."expelledAt") AS last_exp
  FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId"
  WHERE lc."expelledAt" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "Match" m WHERE (m."redLeagueClanId"=lc."id" OR m."blueLeagueClanId"=lc."id") AND m."startAt" > now() - interval '7 days')
    AND NOT EXISTS (SELECT 1 FROM "LeagueClan" lc2 WHERE lc2."clanId"=lc."clanId" AND lc2."expelledAt" IS NULL)
  GROUP BY l."slug"`
console.log('expelled-but-active-by-league', JSON.stringify(ex))
/* deluxe 의 IPL 매치 원문 — 마지막 원문이 정확히 언제였나 */
const last = await p.$queryRaw`SELECT MAX("fetchedAt") AS last, COUNT(*)::int AS n FROM "BarracksClanMatchRaw" WHERE "subject"='ferwfwfwfwf'`
console.log('deluxe raw ever', JSON.stringify(last))
const anyKey = await p.$queryRaw`SELECT "subject", "matchKey", "fetchedAt" FROM "BarracksClanMatchRaw" WHERE "rawClanNo"='150531000663' ORDER BY "fetchedAt" DESC LIMIT 3`
console.log('deluxe by clanNo', JSON.stringify(anyKey))
await p.$disconnect()
