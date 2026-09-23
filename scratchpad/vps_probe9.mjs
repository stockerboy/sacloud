import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
/* deluxe 의 IPL 원문 경기 — 어느 subject 가 물어 와서 생겼나 (상대 클랜 쪽 원문) */
const r = await p.$queryRaw`SELECT "subject", "rawClanNo", "redClanName", "blueClanName", "matchKey", "fetchedAt" FROM "BarracksClanMatchRaw" WHERE ("redClanName"='deluxe' OR "blueClanName"='deluxe') ORDER BY "fetchedAt" DESC LIMIT 6`
console.log(JSON.stringify(r, null, 1))
/* 9/19 이후 deluxe 가 낀 원문 경기키 → Match 있나 */
const keys = await p.$queryRaw`SELECT DISTINCT "matchKey" FROM "BarracksClanMatchRaw" WHERE ("redClanName"='deluxe' OR "blueClanName"='deluxe') AND "matchKey" >= '260919' ORDER BY "matchKey" DESC`
const ks = keys.map((k) => k.matchKey)
const have = await p.match.findMany({ where: { sourceMatchId: { in: ks } }, select: { sourceMatchId: true } })
const hs = new Set(have.map((m) => m.sourceMatchId))
console.log('deluxe keys >= 9/19 (from opponents):', ks.length, 'have Match:', hs.size)
for (const k of ks) console.log('  ', k, hs.has(k) ? 'MATCH' : '★없음★')
await p.$disconnect()
