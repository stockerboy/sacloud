/** ★부분 유니크 인덱스가 실제로 막는가★ — 로컬에서 만들고 넣어 보고 ★전부 되돌린다★ */
import { prisma } from '@sacloud/db'
const url = process.env['DATABASE_URL'] ?? ''
if (!/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('★로컬에서만★')

const IDX = 'Match_new_sourceMatchId_key_TRIAL'
const CUT = '2026-09-02 22:00:00'
const KEY = '269999999999999001'
const past = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
  `SELECT * FROM "Match" WHERE "sourceMatchId" IS NOT NULL LIMIT 1`,
)
const row = past[0] as Record<string, unknown>

const ins = (id: string, at: string, key: string, origin = 'trial') =>
  prisma.$executeRawUnsafe(
    `INSERT INTO "Match" (id,"leagueId","mapId","playerCount","startAt","winnerSide",
       "redLeagueClanId","blueLeagueClanId","redDivisionAtMatch","blueDivisionAtMatch",
       origin,"sourceMatchId","updatedAt")
     VALUES ($1,$2,$3,10,TIMESTAMP '${at}','red',$4,$5,1,1,$6,$7, now())`,
    id, row['leagueId'], row['mapId'], row['redLeagueClanId'], row['blueLeagueClanId'], origin, key,
  )

try {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${IDX}"`)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "${IDX}" ON "Match" ("sourceMatchId")
     WHERE "startAt" >= TIMESTAMP '${CUT}' AND "sourceMatchId" IS NOT NULL`)
  console.info('① 인덱스 만듦')

  await ins('TRIAL-A', '2026-09-10 01:00:00', KEY)
  console.info('② 신규 구간 경기 하나 넣음 (성공해야 정상)')

  try {
    await ins('TRIAL-B', '2026-09-10 01:00:00', KEY)
    console.info('③ ★★같은 경기번호가 또 들어갔다 — 못 막았다★★')
  } catch (e) {
    const m = (e as Error).message
    console.info('③ ★막았다★ — ' + (m.includes(IDX) || m.toLowerCase().includes('unique') ? '유니크 위반' : m.slice(0, 90)))
  }

  try {
    /* ★기존 제약(leagueId,origin,sourceMatchId)에 안 걸리게 origin 을 달리한다★ —
       그래야 ★부분 인덱스만★ 재는 시험이 된다 (2026-09-05 · 처음엔 이걸 놓쳐 오판했다) */
    await ins('TRIAL-C', '2024-06-01 01:00:00', KEY, 'trial2')
    console.info('④ ★과거 구간에는 같은 번호가 들어간다★ — 과거를 안 건드린다는 뜻이다')
  } catch (e) {
    console.info('④ ★★과거까지 막혔다 — 이러면 못 쓴다★★ ' + (e as Error).message.slice(0, 90))
  }
} finally {
  await prisma.$executeRawUnsafe(`DELETE FROM "Match" WHERE id IN ('TRIAL-A','TRIAL-B','TRIAL-C')`)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${IDX}"`)
  const left = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Match" WHERE origin IN ('trial','trial2')`)
  console.info('⑤ 되돌림 — 남은 시험행 ' + JSON.stringify(left))
  await prisma.$disconnect()
}
