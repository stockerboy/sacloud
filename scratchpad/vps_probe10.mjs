import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
/* 시즌 창(9/3~) 원문 경기키 중 Match 가 없는 것 — 리그 소속 클랜(활성/만료 무관)이 한쪽이라도 낀 것만 */
const gap = await p.$queryRaw`
  WITH keys AS (
    SELECT DISTINCT r."matchKey", MIN(r."redClanName") AS red, MIN(r."blueClanName") AS blue
    FROM "BarracksClanMatchRaw" r
    WHERE r."status"='ok' AND r."matchKey" >= '260903' AND r."matchKey" < '270000'
    GROUP BY r."matchKey")
  SELECT k."matchKey", k.red, k.blue
  FROM keys k LEFT JOIN "Match" m ON m."sourceMatchId" = k."matchKey"
  WHERE m."id" IS NULL
  ORDER BY k."matchKey" DESC`
console.log('raw keys since 9/3 with NO Match:', gap.length)
const byDay = {}
for (const g of gap) { const d = g.matchKey.slice(0, 6); byDay[d] = (byDay[d] ?? 0) + 1 }
console.log('by day', JSON.stringify(byDay))
const clanCount = {}
for (const g of gap) for (const n of [g.red, g.blue]) if (n) clanCount[n] = (clanCount[n] ?? 0) + 1
console.log('top clans in gap', JSON.stringify(Object.entries(clanCount).sort((a, b) => b[1] - a[1]).slice(0, 30)))
/* 그 클랜들이 우리 Clan 표에 있나 · LeagueClan 활성인가 */
const names = Object.keys(clanCount).slice(0, 60)
const known = await p.$queryRaw`SELECT c."name", c."slug", bool_or(lc."expelledAt" IS NULL) AS active, string_agg(DISTINCT l."slug", ',') AS leagues FROM "Clan" c LEFT JOIN "LeagueClan" lc ON lc."clanId"=c."id" LEFT JOIN "League" l ON l."id"=lc."leagueId" WHERE c."name" = ANY(${names}) GROUP BY c."name", c."slug"`
const km = new Map(known.map((k) => [k.name, k]))
console.log('gap clans → known?')
for (const [n, c] of Object.entries(clanCount).sort((a, b) => b[1] - a[1]).slice(0, 40)) { const k = km.get(n); console.log('  ', n, c, k ? `${k.slug} active=${k.active} ${k.leagues}` : '★Clan 표에 없음★') }
console.log('sample gap keys', gap.slice(0, 12).map((g) => `${g.matchKey} ${g.red} vs ${g.blue}`).join(' | '))
await p.$disconnect()
