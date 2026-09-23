import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
await p.$executeRawUnsafe("SET statement_timeout='240s'")
/* 라운드 승수 같은데 승/패가 갈린 경기 — 9/3 이후, 양쪽 다 활성 클랜 */
const r = await p.$queryRaw`
WITH raw AS (
  SELECT DISTINCT ON ("matchKey") "matchKey", "subject", "redClanName" red, "blueClanName" blue,
         (payload->>'red_win_cnt')::int rw, (payload->>'blue_win_cnt')::int bw, payload->>'result_wdl' wdl
  FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260903' AND "matchKey" < '260924'
)
SELECT (rw = bw) AS tie, wdl, COUNT(*)::int n FROM raw GROUP BY 1,2 ORDER BY 1,2`
console.log(JSON.stringify(r))
const d = await p.$queryRaw`
SELECT DISTINCT ON ("matchKey") "matchKey", "subject", "redClanName" red, "blueClanName" blue,
       payload->>'red_win_cnt' rw, payload->>'blue_win_cnt' bw, payload->>'result_wdl' wdl, payload->>'match_time_date' t
FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260920' AND (payload->>'red_win_cnt') = (payload->>'blue_win_cnt') AND payload->>'result_wdl' <> '무' LIMIT 8`
for (const x of d) console.log(JSON.stringify(x))
const ex = await p.$queryRaw`SELECT "matchKey", "result", "redRoundWins", "blueRoundWins" FROM "Match" WHERE "matchKey" IN ('260919140127124001','260919211033124002','260919045247124001')`
console.log('Match rows now:', JSON.stringify(ex))
await p.$disconnect()
