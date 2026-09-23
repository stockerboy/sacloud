/* arcenciel — 등록 안 됐다는데 왜 경기가 뜨나 (읽기만) */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const q = (sql) => p.$queryRawUnsafe(sql)
const name = process.argv[2] ?? 'arcenciel'
console.log('== Clan 줄', JSON.stringify(await q(`SELECT c."id", c."name", c."slug", c."createdAt"::text FROM "Clan" c WHERE c."name" ILIKE '${name}' OR c."slug" ILIKE '%${name}%'`)))
console.log('== LeagueClan (등록)', JSON.stringify(await q(`SELECT l."slug" league, lc."id" lcid, lc."division", lc."expelledAt"::text expelled FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId" JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."name" ILIKE '${name}'`)))
console.log('== 경기 수 (리그·출처별)', JSON.stringify(await q(`SELECT l."slug" league, m."origin", COUNT(*)::int n, MIN(m."startAt")::text a, MAX(m."startAt")::text b FROM "Match" m JOIN "League" l ON l."id"=m."leagueId" JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId") JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."name" ILIKE '${name}' GROUP BY 1,2 ORDER BY 3 DESC`)))
console.log('== 최근 경기 5', JSON.stringify(await q(`SELECT m."id", l."slug" league, m."origin", m."startAt"::text, m."sourceMatchId", cr."name" red, cb."name" blue FROM "Match" m JOIN "League" l ON l."id"=m."leagueId" JOIN "LeagueClan" lr ON lr."id"=m."redLeagueClanId" JOIN "Clan" cr ON cr."id"=lr."clanId" JOIN "LeagueClan" lb ON lb."id"=m."blueLeagueClanId" JOIN "Clan" cb ON cb."id"=lb."clanId" WHERE cr."name" ILIKE '${name}' OR cb."name" ILIKE '${name}' ORDER BY m."startAt" DESC LIMIT 5`)))
console.log('== 등록 이력(명부/이름표)', JSON.stringify(await q(`SELECT 'alias' k, a."alias", a."createdAt"::text FROM "BarracksClanAlias" a JOIN "Clan" c ON c."id"=a."clanId" WHERE c."name" ILIKE '${name}' LIMIT 5`).catch(()=>'(alias 표 없음)')))
await p.$disconnect()
