/**
 * ★부분 유니크 인덱스가 과거를 안 건드리고 신규만 막는가★ — ★로컬 DB 에서만★ 시험한다.
 *
 * ⚠ 운영에는 안 만든다. ★만들 수 있는지, 과거가 걸리는지★ 를 먼저 안다.
 */
import { prisma } from '@sacloud/db'

const url = process.env['DATABASE_URL'] ?? ''
if (!/(127\.0\.0\.1|localhost)/.test(url)) {
  throw new Error('★로컬 DB 에서만 돌린다★ — 운영에는 안 만든다')
}

const IDX = 'Match_new_sourceMatchId_key_TRIAL'
const CUT = '2026-09-02 22:00:00'

const show = async (l: string, sql: string) =>
  console.info('\n### ' + l + '\n' + JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))

await show('시험 전 — 기준시각 이후 중복', `
  SELECT COUNT(*)::int AS dup FROM (
    SELECT "sourceMatchId" FROM "Match"
    WHERE "startAt" >= TIMESTAMP '${CUT}' AND "sourceMatchId" IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1) t`)
await show('시험 전 — 과거 중복 (걸리면 안 된다)', `
  SELECT COUNT(*)::int AS dup FROM (
    SELECT "sourceMatchId" FROM "Match"
    WHERE "startAt" < TIMESTAMP '${CUT}' AND "sourceMatchId" IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1) t`)

console.info('\n### 부분 유니크 인덱스를 만들어 본다')
try {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${IDX}"`)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "${IDX}" ON "Match" ("sourceMatchId")
     WHERE "startAt" >= TIMESTAMP '${CUT}' AND "sourceMatchId" IS NOT NULL`,
  )
  console.info('  ★만들어졌다★ — 과거 중복이 있어도 신규 구간만 보므로 걸리지 않는다')
} catch (e) {
  console.info('  ★실패★ ' + (e as Error).message)
}

console.info('\n### 실제로 막는지 — 같은 경기번호로 두 번 넣어 본다')
const one = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
  `SELECT * FROM "Match" WHERE "startAt" >= TIMESTAMP '${CUT}' LIMIT 1`,
)
if (one.length === 0) {
  console.info('  로컬에 기준시각 이후 경기가 없어 시험 못 함 [미확인]')
} else {
  const row = one[0] as Record<string, unknown>
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Match" (id, "leagueId", "mapId", "playerCount", "startAt", "winnerSide",
         "redLeagueClanId", "blueLeagueClanId", "redDivisionAtMatch", "blueDivisionAtMatch",
         origin, "sourceMatchId", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())`,
      'TRIAL-DUP-1', row['leagueId'], row['mapId'], 10, row['startAt'], 'red',
      row['redLeagueClanId'], row['blueLeagueClanId'], 1, 1, 'trial', row['sourceMatchId'],
    )
    console.info('  ★★막지 못했다 — 중복이 들어갔다★★')
    await prisma.$executeRawUnsafe(`DELETE FROM "Match" WHERE id = 'TRIAL-DUP-1'`)
  } catch (e) {
    const m = (e as Error).message
    console.info('  ★막았다★ — ' + (m.includes(IDX) ? '부분 유니크 인덱스가 걸렸다' : m.slice(0, 120)))
  }
}

console.info('\n### 시험 인덱스를 지운다')
await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${IDX}"`)
console.info('  지웠다')
await prisma.$disconnect()
