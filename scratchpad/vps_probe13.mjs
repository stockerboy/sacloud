import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
await p.$executeRaw`SET statement_timeout = '200s'`
/* 누락 7건(deluxe 9/19)이 원문에 ★언제★ 들어왔나 vs 그때 이미 만들어진 가장 큰 키 — 「2시간 무름」 밖이었나 */
const keys = ['260919211033124002','260919140127124001','260919045247124001','260919014915124001','260919002231124001','260919000343124001']
for (const k of keys) {
  const r = await p.$queryRaw`SELECT "subject", "fetchedAt", "rawClanNo", "redClanName", "blueClanName" FROM "BarracksClanMatchRaw" WHERE "matchKey"=${k} ORDER BY "fetchedAt"`
  const t = r[0]?.fetchedAt
  /* 그 시각에 이미 만들어져 있던 unified 경기의 최대 키 */
  const newest = t ? await p.$queryRaw`SELECT MAX("sourceMatchId") AS k FROM "Match" WHERE "origin"='nexon_barracks' AND "createdAt" <= ${t}` : [{ k: null }]
  console.log(k, 'raw first', t?.toISOString().slice(5,16), 'subjects', r.map((x) => x.subject).join(','), 'clanNo', [...new Set(r.map((x) => x.rawClanNo))].join(','), '| newest projected at that time', newest[0]?.k)
}
/* 전체: 시즌 창 원문 중 「원문 fetchedAt 이 경기시각+2h 보다 늦은」 비율 — 늦게 오는 원문이 얼마나 되나 */
const late = await p.$queryRaw`
  SELECT COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE "fetchedAt" > (to_timestamp("matchKey", 'YYMMDDHH24MISS') AT TIME ZONE 'Asia/Seoul') + interval '3 hours')::int AS late3h,
         COUNT(*) FILTER (WHERE "fetchedAt" > (to_timestamp("matchKey", 'YYMMDDHH24MISS') AT TIME ZONE 'Asia/Seoul') + interval '26 hours')::int AS late26h
  FROM (SELECT "matchKey", MIN("fetchedAt") AS "fetchedAt" FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260903' AND "matchKey" < '270000' GROUP BY "matchKey") x`
console.log('raw keys since 9/3', JSON.stringify(late))
await p.$disconnect()
