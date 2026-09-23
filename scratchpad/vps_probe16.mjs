import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
/* deluxe 라는 이름을 별칭으로 가진 subject 들 */
const al = await p.$queryRaw`SELECT a."subject", a."name", c."name" AS owner_now FROM "BarracksClanAlias" a LEFT JOIN "Clan" c ON c."slug"=a."subject" WHERE a."name" IN ('deluxe','amaryllis','QuasaR-','afterpray','CeIebrity','Asterisk') ORDER BY a."name"`
console.log('alias rows', JSON.stringify(al, null, 1))
/* 누락 deluxe 키 하나 — 어느 subject 가 긁었나 · 그 subject 의 클랜은 등록됐나 */
for (const k of ['260919211033124002','260919140127124001','260919045247124001']) {
  const r = await p.$queryRaw`SELECT r."subject", r."rawClanNo", r."redClanName", r."blueClanName", c."name" AS subj_clan, (SELECT COUNT(*)::int FROM "LeagueClan" lc WHERE lc."clanId"=c."id" AND lc."expelledAt" IS NULL) AS subj_active FROM "BarracksClanMatchRaw" r LEFT JOIN "Clan" c ON c."slug"=r."subject" WHERE r."matchKey"=${k}`
  console.log(k, JSON.stringify(r))
}
/* deluxe 클랜번호가 BarracksClanNumber 에 있고 원문 rawClanNo 에도 찍히나 */
const no = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM "BarracksClanMatchRaw" WHERE "rawClanNo"='150531000663' AND "matchKey" >= '260903'`
console.log('raw rows with deluxe clanNo since 9/3', JSON.stringify(no))
await p.$disconnect()
