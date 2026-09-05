/** ★자물쇠가 진짜 막는가★ — 운영에서 넣어 보고 ★반드시 되돌린다★ (2026-09-05) */
import { prisma } from '@sacloud/db'
const IDX = 'Match_new_sourceMatchId_key'

const idx = await prisma.$queryRawUnsafe(
  `SELECT indexname FROM pg_indexes WHERE tablename='Match' AND indexname=$1`, IDX)
console.info('① 자물쇠가 있나 ' + JSON.stringify(idx))

const src = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
  `SELECT * FROM "Match" WHERE "startAt" >= TIMESTAMP '2026-09-02 22:00:00'
     AND "supersededAt" IS NULL LIMIT 1`)
const row = src[0] as Record<string, unknown>
console.info(`② 살아 있는 신규 경기 하나: ${row['sourceMatchId']}`)

const ins = (id: string, at: string, key: string, origin: string) =>
  prisma.$executeRawUnsafe(
    `INSERT INTO "Match" (id,"leagueId","mapId","playerCount","startAt","winnerSide",
       "redLeagueClanId","blueLeagueClanId","redDivisionAtMatch","blueDivisionAtMatch",
       origin,"sourceMatchId","updatedAt")
     VALUES ($1,$2,$3,10,TIMESTAMP '${at}','red',$4,$5,1,1,$6,$7, now())`,
    id, row['leagueId'], row['mapId'], row['redLeagueClanId'], row['blueLeagueClanId'], origin, key)

try {
  try {
    await ins('TRIAL-NEW-DUP', '2026-09-10 01:00:00', String(row['sourceMatchId']), 'trial')
    console.info('③ ★★막지 못했다 — 같은 경기번호가 또 들어갔다★★')
  } catch (e) {
    const m = (e as Error).message
    console.info('③ ★막았다★ ' + (m.includes(IDX) ? `(${IDX} 위반)` : m.slice(0, 100)))
  }

  try {
    await ins('TRIAL-OLD-DUP', '2024-06-01 01:00:00', '240601010101999999', 'trial2')
    console.info('④ ★과거 구간에는 들어간다★ — 과거를 안 건드린다는 뜻이다')
  } catch (e) {
    console.info('④ ★★과거까지 막혔다★★ ' + (e as Error).message.slice(0, 90))
  }
} finally {
  const del = await prisma.$executeRawUnsafe(
    `DELETE FROM "Match" WHERE id IN ('TRIAL-NEW-DUP','TRIAL-OLD-DUP')`)
  console.info(`⑤ 시험행 지움 ${del}줄`)
  const left = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "Match" WHERE origin IN ('trial','trial2')`)
  console.info('   남은 시험행 ' + JSON.stringify(left))
  await prisma.$disconnect()
}
