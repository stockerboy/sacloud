/** ★sanply + supply 에 동시에 있는 클랜 표★ — 사장님이 직접 분류하신다 (2026-09-05). 읽기만 한다 */
import { prisma } from '@sacloud/db'

const rows = await prisma.$queryRawUnsafe<
  Array<{
    clanName: string
    clanSlug: string
    clanId: string
    sourceClanId: string | null
    supLcId: string
    supStatus: number
    supDivision: number
    supJoined: Date
    supExpelled: Date | null
    sanLcId: string
    sanStatus: number
    sanDivision: number
    sanJoined: Date
    sanExpelled: Date | null
    supLast: Date | null
    supCount: number
    sanLast: Date | null
    sanCount: number
  }>
>(`
WITH pair AS (
  SELECT c.id AS "clanId", c.name AS "clanName", c.slug AS "clanSlug", c."sourceClanId",
         sup.id AS "supLcId", sup.status AS "supStatus", sup.division AS "supDivision",
         sup."joinedAt" AS "supJoined", sup."expelledAt" AS "supExpelled",
         san.id AS "sanLcId", san.status AS "sanStatus", san.division AS "sanDivision",
         san."joinedAt" AS "sanJoined", san."expelledAt" AS "sanExpelled"
  FROM "Clan" c
  JOIN "LeagueClan" sup ON sup."clanId" = c.id
    AND sup."leagueId" = (SELECT id FROM "League" WHERE slug = 'supply')
    AND sup."expelledAt" IS NULL
  JOIN "LeagueClan" san ON san."clanId" = c.id
    AND san."leagueId" = (SELECT id FROM "League" WHERE slug = 'sanply')
    AND san."expelledAt" IS NULL
)
SELECT p.*,
  (SELECT MAX(m."startAt") FROM "Match" m
     WHERE m."redLeagueClanId" = p."supLcId" OR m."blueLeagueClanId" = p."supLcId") AS "supLast",
  (SELECT COUNT(*)::int FROM "Match" m
     WHERE m."redLeagueClanId" = p."supLcId" OR m."blueLeagueClanId" = p."supLcId") AS "supCount",
  (SELECT MAX(m."startAt") FROM "Match" m
     WHERE m."redLeagueClanId" = p."sanLcId" OR m."blueLeagueClanId" = p."sanLcId") AS "sanLast",
  (SELECT COUNT(*)::int FROM "Match" m
     WHERE m."redLeagueClanId" = p."sanLcId" OR m."blueLeagueClanId" = p."sanLcId") AS "sanCount"
FROM pair p
ORDER BY p."clanName"`)

const d = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : '없음')
const n = (v: number) => String(v).padStart(6)

console.info(`총 ${rows.length}곳\n`)
console.info(
  '번호 | 클랜명                  | SPL 경기 | SPL 마지막  | 열산 경기 | 열산 마지막 | 비고',
)
console.info('-----|-------------------------|----------|-------------|-----------|-------------|------')
rows.forEach((r, i) => {
  const notes: string[] = []
  if (r.supCount === 0) notes.push('SPL 경기 0')
  if (r.sanCount === 0) notes.push('열산 경기 0')
  if (r.supLast && r.sanLast) {
    notes.push(r.supLast > r.sanLast ? 'SPL 이 더 최근' : '열산이 더 최근')
  }
  if (r.supStatus !== 1) notes.push(`SPL status=${r.supStatus}`)
  if (r.sanStatus !== 1) notes.push(`열산 status=${r.sanStatus}`)
  console.info(
    `${String(i + 1).padStart(4)} | ${r.clanName.padEnd(23).slice(0, 23)} | ${n(r.supCount)}   | ${d(r.supLast)}  | ${n(r.sanCount)}    | ${d(r.sanLast)}  | ${notes.join(' · ')}`,
  )
})

console.info('\n\n══ 식별자 (분류 뒤 적용할 때 쓴다) ══')
rows.forEach((r, i) => {
  console.info(
    `${String(i + 1).padStart(4)} ${r.clanName}` +
      `\n      clan.slug=${r.clanSlug} · clan.id=${r.clanId} · sourceClanId=${r.sourceClanId ?? '없음'}` +
      `\n      SPL  LeagueClan=${r.supLcId} (div ${r.supDivision} · 가입 ${d(r.supJoined)})` +
      `\n      열산 LeagueClan=${r.sanLcId} (div ${r.sanDivision} · 가입 ${d(r.sanJoined)})`,
  )
})
await prisma.$disconnect()
