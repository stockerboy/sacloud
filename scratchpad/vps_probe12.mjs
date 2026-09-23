import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
await p.$executeRaw`SET statement_timeout = '240s'`
/* 등록 클랜의 subject 로 들어온 원문만 (활성+만료 · 만료도 이름은 맞다) */
const subs = await p.$queryRaw`SELECT DISTINCT c."slug" FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c."id"`
const slugs = subs.map((s) => s.slug)
const rows = await p.$queryRaw`
  SELECT k."matchKey", k.red, k.blue, k.subjects
  FROM (
    SELECT r."matchKey", MIN(r."redClanName") AS red, MIN(r."blueClanName") AS blue, string_agg(DISTINCT r."subject", ',') AS subjects
    FROM "BarracksClanMatchRaw" r
    WHERE r."status"='ok' AND r."matchKey" >= '260903' AND r."matchKey" < '270000' AND r."subject" = ANY(${slugs})
    GROUP BY r."matchKey") k
  LEFT JOIN "Match" m ON m."sourceMatchId"=k."matchKey"
  WHERE m."id" IS NULL ORDER BY k."matchKey" DESC`
console.log('gap keys (registered subjects) since 9/3:', rows.length, 'named:', rows.filter((r) => r.red && r.blue).length)
const lcs = await p.$queryRaw`SELECT c."name", c."slug", bool_or(lc."expelledAt" IS NULL) AS active FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c."id" GROUP BY c."name", c."slug"`
const byName = new Map(lcs.map((x) => [x.name, x]))
const both = rows.filter((r) => r.red && r.blue && byName.has(r.red) && byName.has(r.blue))
const bothActive = both.filter((r) => byName.get(r.red).active && byName.get(r.blue).active)
console.log('both registered:', both.length, 'both ACTIVE:', bothActive.length)
const byDay = {}; for (const g of bothActive) { const d = g.matchKey.slice(0, 6); byDay[d] = (byDay[d] ?? 0) + 1 }
console.log('bothActive by day', JSON.stringify(byDay))
const cc = {}; for (const g of bothActive) for (const n of [g.red, g.blue]) cc[n] = (cc[n] ?? 0) + 1
console.log('top', JSON.stringify(Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 20)))
console.log('unnamed sample', rows.filter((r) => !r.red).slice(0, 5).map((r) => r.matchKey + ' [' + r.subjects + ']').join(' | '))
const sample = await p.$queryRaw`SELECT "payload" FROM "BarracksClanMatchRaw" WHERE "matchKey"='260919211033124002' LIMIT 1`
console.log('payload 260919211033124002', JSON.stringify(sample[0]?.payload).slice(0, 1500))
await p.$disconnect()
