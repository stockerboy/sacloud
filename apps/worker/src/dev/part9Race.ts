/**
 * ★★집계 임대를 운영 DB 에서 실제로 겹쳐 본다★★ (2026-09-06 · Part 9 · 사장님 지시 5).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/part9Race.ts
 * ```
 *
 * ── 무엇을 보나
 *   ```
 *   A 여러 판이 동시에 임대를 잡으려 하면 ★한 판만 잡는다★
 *   B 더 오래된 판이 늦게 와도            ★새 결과를 못 덮는다★
 *   C 임대를 잃은 판은                    ★쓰기 허가를 못 받는다★
 *   D 로컬·Actions 가 같이 와도            ★같은 표 한 줄을 본다★
 *   ```
 *
 * ⚠ ★집계를 돌리지 않는다.★ 임대 표만 만졌다 지운다 — `LeaguePlayer` 는 한 줄도 안 건드린다.
 * ⚠ 끝나면 ★시험용 임대를 반납한다.★ 남겨 두면 진짜 집계가 못 돈다.
 */
import {
  acquireSeason0Lease,
  canWriteSeason0,
  describeVerdict,
  markSeason0Applied,
  releaseSeason0Lease,
  SEASON0_LEASE_NAME,
} from '@sacloud/db/ops'
import { prisma } from '@sacloud/db'

const line = (ok: boolean, label: string, detail: string) =>
  console.info(`  ${ok ? '✔' : '✘'} ${label.padEnd(46)} ${detail}`)

async function main(): Promise<void> {
  /* 진짜 집계가 돌고 있으면 시험하지 않는다 — 남의 임대를 뺏으면 안 된다 */
  const before = await prisma.$queryRaw<Array<{ ownerId: string; expiresAt: Date }>>`
    SELECT "ownerId", "expiresAt" FROM "CollectorLease" WHERE "name" = ${SEASON0_LEASE_NAME}
  `
  const live = before[0] && before[0].expiresAt.getTime() > Date.now()
  if (live) {
    console.info(`★지금 집계가 돌고 있다 — 시험을 하지 않는다★ (주인 ${before[0]?.ownerId})`)
    await prisma.$disconnect()
    return
  }

  console.info('══ A · 열 판이 동시에 임대를 잡으려 한다 ══\n')
  const tries = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      acquireSeason0Lease({ command: `race-${i}` }).then((r) => ({ i, r })),
    ),
  )
  const won = tries.filter((t) => t.r.ok)
  line(won.length === 1, '임대를 잡은 판', `${won.length}판 (나머지 ${tries.length - won.length}판은 거절)`)
  const winner = won[0]
  if (!winner || !winner.r.ok) {
    console.info('★아무도 못 잡았다 — 여기서 멈춘다★')
    await prisma.$disconnect()
    return
  }
  const ownerId = winner.r.ownerId
  const startedAt = new Date()

  console.info('\n══ C · 임대를 못 잡은 판은 쓰기 허가를 못 받는다 ══\n')
  const loser = await canWriteSeason0({ ownerId: 'race-loser', startedAt })
  line(!loser.ok, '못 잡은 판의 쓰기 허가', describeVerdict(loser))

  console.info('\n══ 임대를 잡은 판은 쓸 수 있다 ══\n')
  const okNow = await canWriteSeason0({ ownerId, startedAt })
  line(okNow.ok, '잡은 판의 쓰기 허가', describeVerdict(okNow))

  console.info('\n══ B · 옛 판이 새 결과를 덮으려 한다 ══\n')
  /* 새 판이 먼저 썼다고 적는다 */
  const newer = new Date(startedAt.getTime() + 60_000)
  const marked = await markSeason0Applied({ ownerId, startedAt: newer })
  line(marked, '새 판이 「썼다」고 적었다', newer.toISOString())

  /* 그보다 오래된 판이 이제 와서 쓰려 한다 */
  const older = new Date(startedAt.getTime() - 60_000)
  const stale = await canWriteSeason0({ ownerId, startedAt: older })
  line(
    !stale.ok && stale.reason === 'stale_run',
    '★옛 판의 쓰기 허가★',
    describeVerdict(stale),
  )

  console.info('\n══ D · 로컬과 Actions 는 같은 표 한 줄을 본다 ══\n')
  const row = await prisma.$queryRaw<
    Array<{ name: string; ownerId: string; host: string; command: string | null; lastAppliedStartedAt: Date | null }>
  >`
    SELECT "name", "ownerId", "host", "command", "lastAppliedStartedAt"
      FROM "CollectorLease" WHERE "name" = ${SEASON0_LEASE_NAME}
  `
  const r = row[0]
  line(
    r !== undefined,
    '임대 행이 하나뿐이다 (이름이 기본키)',
    r ? `${r.name} · 주인 ${r.ownerId} · ${r.host} · ${r.command ?? '-'}` : '없다',
  )
  console.info(
    '     ★어디서 돌든 이 한 줄을 본다★ — 로컬 예약작업도, GitHub Actions 도 같은 DB 다',
  )

  /* ── 뒷정리 — 시험용 자국을 지운다 ─────────────────────────────────── */
  await prisma.$executeRaw`
    UPDATE "CollectorLease" SET "lastAppliedStartedAt" = NULL
     WHERE "name" = ${SEASON0_LEASE_NAME} AND "ownerId" = ${ownerId}
  `
  await releaseSeason0Lease({ ownerId })
  const after = await prisma.$queryRaw<Array<{ releasedAt: Date | null; lastAppliedStartedAt: Date | null }>>`
    SELECT "releasedAt", "lastAppliedStartedAt" FROM "CollectorLease" WHERE "name" = ${SEASON0_LEASE_NAME}
  `
  console.info('\n══ 뒷정리 ══\n')
  line(
    after[0]?.releasedAt !== null && after[0]?.lastAppliedStartedAt === null,
    '시험용 임대를 반납하고 자국을 지웠다',
    `반납 ${after[0]?.releasedAt?.toISOString() ?? '-'} · 마지막쓴판 ${after[0]?.lastAppliedStartedAt ?? 'null'}`,
  )
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
