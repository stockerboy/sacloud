/**
 * ★★수집기 임대 — 두 판이 못 돌게 막는 자물쇠★★ (2026-09-04 · Pre-Part 0).
 *
 * ── ★여기서 고정하는 것★
 * ```
 * 1 ★동시에 열 판이 달려들면 정확히 하나만 이긴다★   ← 이 파일의 이유
 * 2 남의 임대는 갱신·반납할 수 없다
 * 3 만료된 임대는 다음 판이 가져간다 (죽은 판이 영영 막지 못한다)
 * 4 반납된 임대는 만료를 안 기다리고 바로 넘어간다
 * 5 갱신하면 만료가 밀린다 — ★도는 동안은 남이 못 가져간다★
 * 6 임대를 잃은 판이 갱신하면 ★거짓★ 이 온다 (그때 멈춰야 한다)
 * 7 막힌 횟수가 세어진다 — ★막았다는 증거가 남는다★
 * ```
 *
 * ── ★1번이 왜 제일 중요한가★
 *   옛 자물쇠는 「돌고 있는 프로세스가 있나」를 ★보고 나서★ 잡았다.
 *   ★보는 것과 잡는 것 사이에 틈이 있었고, 그 틈으로 세 번 뚫렸다.★
 *   임대는 ★한 문장★ 이라 틈이 없다. 그것을 ★실제로 동시에 달려들어★ 확인한다.
 *
 * ── DB 를 실제로 쓴다. 로컬 DB(5433)가 없으면 조용히 건너뛴다.
 *   ⚠ ★트랜잭션으로 못 감싼다★ — 동시 경쟁을 재는 시험이라 ★각자 따로 붙어야★ 한다.
 *     대신 ★실행마다 다른 임대 이름★ 을 쓰고 끝에 지운다. 실제 자물쇠를 안 건드린다.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/index'
import {
  DEFAULT_LEASE_MS,
  acquireCollectorLease,
  leaseIsLive,
  readLease,
  releaseCollectorLease,
  renewCollectorLease,
} from '../collectorLease'

const dbUp = await prisma
  .$queryRawUnsafe('select 1')
  .then(() => true)
  .catch(() => false)

const RUN = Date.now() % 1000000
/** ★실제 자물쇠(`barracks-collect`)를 절대 건드리지 않는다★ */
const nameFor = (what: string) => `test-${RUN}-${what}`
const made: string[] = []
const lease = (what: string) => {
  const n = nameFor(what)
  made.push(n)
  return n
}

afterAll(async () => {
  if (!dbUp || made.length === 0) return
  await prisma.$executeRawUnsafe(
    `DELETE FROM "CollectorLease" WHERE "name" = ANY($1::text[])`,
    made,
  )
})

describe('시각이 왕복해도 안 변한다', () => {
  it('★넣은 값과 읽은 값이 같아야 한다★ — 여기가 한 번 틀렸던 자리다', async () => {
    if (!dbUp) return
    const name = lease('roundtrip')
    /* ⚠ ★2026-09-04 실측★ — 이 저장소의 다른 표(`TIMESTAMP`)에 Date 를 넣고 다시 읽으면
       ★정확히 9시간 어긋난다★ (03:04:05Z 를 넣으면 12:04:05Z 가 나온다).
       그래서 「지금 살아 있나」를 JS 가 판정하면 ★죽은 임대를 살았다고 읽는다.★
       실제로 이 테스트를 쓰다가 그 버그를 잡았다. `CollectorLease` 만 `TIMESTAMPTZ` 다 */
    const at = new Date('2026-01-02T03:04:05.000Z')
    const got = await acquireCollectorLease({ name, pid: 1, now: at, leaseMs: 60_000 })
    expect(got.ok).toBe(true)
    const back = await readLease(name)
    expect(back?.acquiredAt.toISOString()).toBe(at.toISOString())
    expect(back?.expiresAt.toISOString()).toBe(new Date(at.getTime() + 60_000).toISOString())
  })
})

describe('기본값', () => {
  it('임대 기간이 한 사이클(15분)보다 넉넉하다', () => {
    /* ★짧으면 살아 있는 판의 임대를 남이 뺏는다 — 그게 곧 두 판이다★ */
    expect(DEFAULT_LEASE_MS).toBeGreaterThan(15 * 60 * 1000)
  })
})

describe.skipIf(!dbUp)('임대 (DB)', () => {
  it('빈자리는 잡힌다', async () => {
    const name = lease('empty')
    const got = await acquireCollectorLease({ name, pid: 111, command: 'test' })
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.tookOverFrom).toBeNull()
    expect(leaseIsLive(await readLease(name))).toBe(true)
  })

  it('★이미 쥔 임대는 남이 못 잡는다★', async () => {
    const name = lease('held')
    const first = await acquireCollectorLease({ name, pid: 111 })
    expect(first.ok).toBe(true)

    const second = await acquireCollectorLease({ name, pid: 222 })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.heldBy.pid).toBe(111)
  })

  it('★★동시에 열 판이 달려들어도 정확히 하나만 이긴다★★', async () => {
    const name = lease('race')
    /* ★순서대로가 아니라 한꺼번에 보낸다★ — 그래야 틈이 있는지 알 수 있다 */
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => acquireCollectorLease({ name, pid: 1000 + i })),
    )
    const won = results.filter((r) => r.ok)
    expect(won).toHaveLength(1)

    /* ★막힌 아홉 판은 전부 「이긴 그 판」을 가리킨다★ */
    const winner = won[0]
    expect(winner?.ok && winner.ownerId).toBeTruthy()
    const holder = await readLease(name)
    expect(holder?.ownerId).toBe(winner?.ok ? winner.ownerId : null)

    /* ★막은 횟수가 남는다★ — 자물쇠가 일했다는 증거다 */
    expect(holder?.blockedCount).toBe(9)
  })

  it('남의 임대는 갱신할 수 없다', async () => {
    const name = lease('renew-other')
    await acquireCollectorLease({ name, pid: 111 })
    const out = await renewCollectorLease({ name, ownerId: 'ID가-아닌-값' })
    /* ★DB 는 답했고 0행이다 → 진짜 상실★ (연결 실패와 구별된다 · O-055-1) */
    expect(out.outcome).toBe('lost')
  })

  it('남의 임대는 반납할 수 없다', async () => {
    const name = lease('release-other')
    await acquireCollectorLease({ name, pid: 111 })
    const out = await releaseCollectorLease({ name, ownerId: 'ID가-아닌-값' })
    expect(out.ok).toBe(false)
    expect(leaseIsLive(await readLease(name))).toBe(true)
  })

  it('★갱신하면 만료가 밀린다★ — 도는 동안은 남이 못 가져간다', async () => {
    const name = lease('renew')
    const got = await acquireCollectorLease({ name, pid: 111, leaseMs: 60_000 })
    expect(got.ok).toBe(true)
    if (!got.ok) return

    const before = (await readLease(name))?.expiresAt.getTime() ?? 0
    const out = await renewCollectorLease({ name, ownerId: got.ownerId, leaseMs: 600_000 })
    expect(out.outcome).toBe('renewed')
    const after = (await readLease(name))?.expiresAt.getTime() ?? 0
    expect(after).toBeGreaterThan(before)
    expect((await readLease(name))?.renewCount).toBe(1)
  })

  it('★만료된 임대는 다음 판이 가져간다★ — 죽은 판이 영영 막지 못한다', async () => {
    const name = lease('expired')
    /* ★시각을 밖에서 넣어 「한 시간 전에 잡힌 임대」를 만든다★ — 기다리지 않는다 */
    const past = new Date(Date.now() - 60 * 60 * 1000)
    const first = await acquireCollectorLease({ name, pid: 111, now: past, leaseMs: 1000 })
    expect(first.ok).toBe(true)
    expect(leaseIsLive(await readLease(name))).toBe(false)

    const second = await acquireCollectorLease({ name, pid: 222 })
    expect(second.ok).toBe(true)
    /* ★조용히 뺏지 않는다★ — 누구 것을 치웠는지 돌려준다 */
    if (second.ok) expect(second.tookOverFrom?.pid).toBe(111)
  })

  it('★반납된 임대는 만료를 안 기다린다★', async () => {
    const name = lease('released')
    const first = await acquireCollectorLease({ name, pid: 111, leaseMs: 600_000 })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    /* 반납 전에는 못 잡는다 */
    expect((await acquireCollectorLease({ name, pid: 222 })).ok).toBe(false)

    await releaseCollectorLease({ name, ownerId: first.ownerId })
    const second = await acquireCollectorLease({ name, pid: 333 })
    expect(second.ok).toBe(true)
  })

  it('★임대를 잃은 판이 갱신하면 거짓이 온다★ — 그때 멈춰야 한다', async () => {
    const name = lease('lost')
    const past = new Date(Date.now() - 60 * 60 * 1000)
    const dying = await acquireCollectorLease({ name, pid: 111, now: past, leaseMs: 1000 })
    expect(dying.ok).toBe(true)
    if (!dying.ok) return

    /* 남이 가져간다 */
    const taken = await acquireCollectorLease({ name, pid: 222 })
    expect(taken.ok).toBe(true)

    /* ★죽은 줄 모르고 계속 돌던 판이 갱신을 시도한다★ */
    const out = await renewCollectorLease({ name, ownerId: dying.ownerId })
    expect(out.outcome).toBe('lost')
  })

  it('같은 주인이 다시 잡는 것은 허용한다 (멱등)', async () => {
    const name = lease('same-owner')
    const first = await acquireCollectorLease({ name, pid: 111 })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const again = await acquireCollectorLease({ name, pid: 111, ownerId: first.ownerId })
    expect(again.ok).toBe(true)
  })
})
