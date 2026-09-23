import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const cols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='BarracksClanMatchRaw' ORDER BY ordinal_position`
console.log('cols', cols.map((c) => c.column_name).join(','))
/* 최근 24시간 수집된 subject 별 건수 */
const bySubj = await p.$queryRaw`SELECT "subject", COUNT(*)::int AS n, MAX("fetchedAt") AS last FROM "BarracksClanMatchRaw" WHERE "fetchedAt" > now() - interval '24 hours' GROUP BY "subject" ORDER BY last DESC LIMIT 60`
console.log('subjects last 24h:', bySubj.length)
for (const r of bySubj) console.log('  ', r.subject, r.n, r.last?.toISOString?.().slice(5, 16))
/* deluxe(slug ferwfwfwfwf) 의 원문 — 상태별 · 마지막 시각 */
const del = await p.$queryRaw`SELECT "status", COUNT(*)::int AS n, MAX("fetchedAt") AS last, MIN("fetchedAt") AS first FROM "BarracksClanMatchRaw" WHERE "subject"='ferwfwfwfwf' GROUP BY "status"`
console.log('deluxe raw by status', JSON.stringify(del))
/* deluxe 원문 중 9/19 이후 경기키 → Match 존재 여부 */
const keys = await p.$queryRaw`SELECT DISTINCT "matchKey" FROM "BarracksClanMatchRaw" WHERE "subject"='ferwfwfwfwf' AND "status"='ok' AND "matchKey" >= '260919' ORDER BY "matchKey" DESC LIMIT 60`
console.log('deluxe keys >= 9/19:', keys.length)
const ks = keys.map((k) => k.matchKey)
const have = await p.match.findMany({ where: { sourceMatchId: { in: ks } }, select: { sourceMatchId: true, leagueId: true } })
const haveSet = new Map(have.map((m) => [m.sourceMatchId, m.leagueId]))
for (const k of ks) console.log('  ', k, haveSet.has(k) ? 'MATCH ' + haveSet.get(k) : '★없음★')
/* amaryllis(fdd8) 도 */
const am = await p.$queryRaw`SELECT "status", COUNT(*)::int AS n, MAX("fetchedAt") AS last FROM "BarracksClanMatchRaw" WHERE "subject"='fdd8' GROUP BY "status"`
console.log('amaryllis raw by status', JSON.stringify(am))
await p.$disconnect()
