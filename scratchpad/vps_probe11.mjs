import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
/* 원문 페이로드에서 두 클랜 이름을 꺼내(redClanName/blueClanName 이 null 인 줄이 많다) → 둘 다 등록 클랜(LeagueClan 有)인데 Match 없는 것 */
const rows = await p.$queryRaw`
  WITH raw AS (
    SELECT r."matchKey",
           COALESCE(r."redClanName",  r."payload"->>'red_clan_name',  r."payload"->'match'->>'red_clan_name')  AS red,
           COALESCE(r."blueClanName", r."payload"->>'blue_clan_name', r."payload"->'match'->>'blue_clan_name') AS blue,
           r."subject"
    FROM "BarracksClanMatchRaw" r
    WHERE r."status"='ok' AND r."matchKey" >= '260903' AND r."matchKey" < '270000'),
  k AS (SELECT "matchKey", MIN(red) AS red, MIN(blue) AS blue, string_agg(DISTINCT "subject", ',') AS subjects FROM raw GROUP BY "matchKey")
  SELECT k."matchKey", k.red, k.blue, k.subjects
  FROM k LEFT JOIN "Match" m ON m."sourceMatchId"=k."matchKey"
  WHERE m."id" IS NULL
  ORDER BY k."matchKey" DESC`
console.log('total gap keys', rows.length, 'with names', rows.filter((r) => r.red && r.blue).length)
/* 등록 클랜 이름 집합 (활성 · 만료 따로) */
const lcs = await p.$queryRaw`SELECT c."name", c."slug", bool_or(lc."expelledAt" IS NULL) AS active FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c."id" GROUP BY c."name", c."slug"`
const byName = new Map(lcs.map((x) => [x.name, x]))
const both = rows.filter((r) => r.red && r.blue && byName.has(r.red) && byName.has(r.blue))
const bothActive = both.filter((r) => byName.get(r.red).active && byName.get(r.blue).active)
console.log('gap with BOTH registered clans:', both.length, ' both ACTIVE:', bothActive.length)
const byDay = {}; for (const g of bothActive) { const d = g.matchKey.slice(0, 6); byDay[d] = (byDay[d] ?? 0) + 1 }
console.log('bothActive by day', JSON.stringify(byDay))
const cc = {}; for (const g of bothActive) for (const n of [g.red, g.blue]) cc[n] = (cc[n] ?? 0) + 1
console.log('bothActive top clans', JSON.stringify(Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 25)))
console.log('sample', bothActive.slice(0, 15).map((g) => `${g.matchKey} ${g.red} vs ${g.blue} [${g.subjects}]`).join('\n  '))
/* 예시 한 건의 payload 모양 */
const one = bothActive[0]
if (one) { const pl = await p.$queryRaw`SELECT "payload" FROM "BarracksClanMatchRaw" WHERE "matchKey"=${one.matchKey} LIMIT 1`; console.log('payload sample', JSON.stringify(pl[0]?.payload).slice(0, 1200)) }
await p.$disconnect()
