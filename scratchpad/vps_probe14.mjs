import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
await p.$executeRaw`SET statement_timeout = '200s'`
const keys = ['260919211033124002','260919140127124001','260919045247124001','260919014915124001','260919002231124001','260919000343124001']
for (const k of keys) {
  const r = await p.$queryRaw`SELECT "subject", "fetchedAt" FROM "BarracksClanMatchRaw" WHERE "matchKey"=${k} ORDER BY "fetchedAt"`
  const first = r[0]?.fetchedAt
  /* 그 시각까지 만들어진 unified 경기의 최대 키 (Match.id 는 시간순 내부키 · ingestedAt 로 잰다) */
  const newest = first ? await p.$queryRaw`SELECT MAX("sourceMatchId") AS k FROM "Match" WHERE "origin"='nexon_barracks' AND "ingestedAt" <= ${first}` : [{ k: null }]
  const nk = newest[0]?.k ?? ''
  const gapMin = nk ? (Date.UTC(2000+ +nk.slice(0,2), +nk.slice(2,4)-1, +nk.slice(4,6), +nk.slice(6,8), +nk.slice(8,10), +nk.slice(10,12)) - Date.UTC(2000+ +k.slice(0,2), +k.slice(2,4)-1, +k.slice(4,6), +k.slice(6,8), +k.slice(8,10), +k.slice(10,12))) / 60000 : null
  console.log(k, '| 원문 첫 도착', first?.toISOString().slice(5,16), '| 그때 이미 만든 최대 키', nk, '| 경기시각보다', gapMin === null ? '-' : Math.round(gapMin) + '분 뒤', gapMin !== null && gapMin > 120 ? '★2시간 창 밖★' : '')
}
await p.$disconnect()
