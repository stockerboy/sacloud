import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
/* 대상이 되려면 무엇이 필요한가 — 클랜 표의 병영 관련 칸 */
const cols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Clan' ORDER BY ordinal_position`
console.log('Clan cols', cols.map((c) => c.column_name).join(','))
const c = await p.clan.findMany({ where: { slug: { in: ['ferwfwfwfwf', 'fdd8', 'ckdals2457'] } } })
for (const x of c) console.log(JSON.stringify(x))
const bn = await p.barracksClanNumber.findMany({ where: { clanId: { in: c.map((x) => x.id) } } })
console.log('BarracksClanNumber', JSON.stringify(bn))
/* 최근 24시간 원문 subject 수 vs 시즌 창 안 활동 클랜 수 */
const subj = await p.$queryRaw`SELECT COUNT(DISTINCT "subject")::int AS n FROM "BarracksClanMatchRaw" WHERE "fetchedAt" > now() - interval '24 hours'`
console.log('subjects collected 24h', subj[0].n)
/* 활동 클랜(9/19 이후 경기 있음)인데 24시간 안에 원문이 하나도 안 온 클랜 */
const active = await p.$queryRaw`
  SELECT c."slug", c."name", MAX(m."startAt") AS last_match, MAX(r."fetchedAt") AS last_raw
  FROM "Clan" c
  JOIN "LeagueClan" lc ON lc."clanId" = c."id"
  JOIN "Match" m ON (m."redLeagueClanId" = lc."id" OR m."blueLeagueClanId" = lc."id")
  LEFT JOIN "BarracksClanMatchRaw" r ON r."subject" = c."slug" AND r."fetchedAt" > now() - interval '24 hours'
  WHERE m."startAt" > now() - interval '7 days'
  GROUP BY c."slug", c."name"
  HAVING MAX(r."fetchedAt") IS NULL
  ORDER BY last_match DESC LIMIT 80`
console.log('active clans (7d) with NO raw in 24h:', active.length)
for (const a of active) console.log('  ', a.slug, a.name, a.last_match?.toISOString?.().slice(5, 16))
await p.$disconnect()
