/** ★43곳 새 분류가 실제로 반영됐나★ (2026-09-05). 읽기만 한다 */
import { prisma } from '@sacloud/db'
const SAN = ['flying-', 'immortals', '매너', '사신', '야부리！', '어린이']

const rows = await prisma.$queryRawUnsafe<
  Array<{ name: string; supN: number; sanN: number }>
>(`
WITH pair AS (
  SELECT c.id, c.name,
    (SELECT id FROM "LeagueClan" WHERE "clanId"=c.id AND "leagueId"=(SELECT id FROM "League" WHERE slug='supply') AND "expelledAt" IS NULL) AS sup,
    (SELECT id FROM "LeagueClan" WHERE "clanId"=c.id AND "leagueId"=(SELECT id FROM "League" WHERE slug='sanply') AND "expelledAt" IS NULL) AS san
  FROM "Clan" c)
SELECT p.name,
  (SELECT COUNT(*)::int FROM "Match" m WHERE m."redLeagueClanId"=p.sup OR m."blueLeagueClanId"=p.sup) AS "supN",
  (SELECT COUNT(*)::int FROM "Match" m WHERE m."redLeagueClanId"=p.san OR m."blueLeagueClanId"=p.san) AS "sanN"
FROM pair p WHERE p.sup IS NOT NULL AND p.san IS NOT NULL ORDER BY p.name`)

console.info('★두 리그에 다 등록된 클랜의 경기 수★ (분류대로면 한쪽이 확 줄어야 한다)\n')
let ok = 0
let odd = 0
for (const r of rows) {
  const want = SAN.includes(r.name) ? '열산' : 'SPL'
  const bigger = r.supN >= r.sanN ? 'SPL' : '열산'
  const mark = want === bigger ? ' ' : '⚠'
  if (want === bigger) ok += 1
  else odd += 1
  console.info(`${mark} ${r.name.padEnd(14).slice(0, 14)} SPL ${String(r.supN).padStart(6)} · 열산 ${String(r.sanN).padStart(6)}  → 정한 곳 ${want}`)
}
console.info(`\n정한 쪽이 더 많은 곳 ${ok} · 그렇지 않은 곳 ${odd}`)
console.info('  ⚠ 「그렇지 않은 곳」이 있어도 사고가 아니다 — 과거 경기는 그대로 두기 때문이다')

const both = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Match" m
  JOIN "LeagueClan" r ON r.id=m."redLeagueClanId"
  JOIN "LeagueClan" b ON b.id=m."blueLeagueClanId"
  JOIN "League" l ON l.id=m."leagueId"
  WHERE l.slug='sanply'
    AND r."clanId" IN (SELECT "clanId" FROM "LeagueClan" WHERE "leagueId"=(SELECT id FROM "League" WHERE slug='supply') AND "expelledAt" IS NULL)
    AND b."clanId" IN (SELECT "clanId" FROM "LeagueClan" WHERE "leagueId"=(SELECT id FROM "League" WHERE slug='supply') AND "expelledAt" IS NULL)
    AND r."clanId" NOT IN (SELECT id FROM "Clan" WHERE name = ANY($1::text[]))
    AND b."clanId" NOT IN (SELECT id FROM "Clan" WHERE name = ANY($1::text[]))`, SAN)
console.info('\n★SPL 로 정한 클랜끼리의 경기가 아직 열산에 남아 있나★ ' + JSON.stringify(both))
await prisma.$disconnect()
