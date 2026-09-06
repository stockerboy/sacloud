/**
 * ★★집계 임대 — 겹침과 「옛 판이 새 결과를 덮는 것」을 막는다★★
 * (2026-09-06 · Part 9 · 사장님 지시 5 A~D).
 *
 * ── 무엇을 잠그나
 *   ```
 *   A 두 판이 겹치려 하면          ★한 판만 쓴다★
 *   B 더 오래된 판이 늦게 끝나도     ★새 결과를 못 덮는다★
 *   C 임대를 잃은 판은             ★한 줄도 안 쓴다★
 *   D 로컬·Actions 가 같이 와도     ★같은 보호가 걸린다★ (둘 다 같은 DB 임대를 본다)
 *   ```
 *
 * ── ★DB 없이 판정 부분만 잠근다★
 *   `canWriteSeason0` 는 ★임대 행 한 줄을 읽어 판정★ 한다. 그 판정을 여기서 굳힌다.
 *   실제 DB 를 쓰는 겹침 시험은 `dev/part9Race.ts` 가 운영에서 따로 돌린다.
 */
import { describe, expect, it } from 'vitest'
import { canWriteSeason0, describeVerdict, SEASON0_LEASE_NAME } from '@sacloud/db/ops'

/** 임대 행 한 줄을 흉내 내는 가짜 클라이언트 */
function fakeClient(row: {
  ownerId: string
  expiresAt: Date
  lastAppliedStartedAt: Date | null
} | null | Error) {
  return {
    $queryRaw: async () => {
      if (row instanceof Error) throw row
      return row ? [row] : []
    },
  } as never
}

const NOW = new Date('2026-09-06T12:00:00.000Z')
const soon = new Date('2026-09-06T12:30:00.000Z')
const past = new Date('2026-09-06T11:59:00.000Z')

describe('이름이 수집기와 다르다', () => {
  it('★집계 임대는 season0-apply 다★', () => {
    expect(SEASON0_LEASE_NAME).toBe('season0-apply')
    expect(SEASON0_LEASE_NAME).not.toBe('barracks-collect')
  })
})

describe('C · 임대를 잃으면 안 쓴다', () => {
  it('임대 행이 아예 없다', async () => {
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: NOW, now: NOW, client: fakeClient(null),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('lease_lost')
  })

  it('★주인이 바뀌었다★', async () => {
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: NOW, now: NOW,
      client: fakeClient({ ownerId: '남', expiresAt: soon, lastAppliedStartedAt: null }),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toBe('lease_lost')
      expect(v.detail).toContain('남')
    }
  })

  it('★임대가 만료됐다★ — 시간이 지났으면 남이 가져갈 수 있다', async () => {
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: NOW, now: NOW,
      client: fakeClient({ ownerId: 'me', expiresAt: past, lastAppliedStartedAt: null }),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('lease_lost')
  })
})

describe('B · 옛 판이 새 결과를 못 덮는다', () => {
  it('★나보다 새 판이 이미 썼으면 안 쓴다★', async () => {
    const 나 = new Date('2026-09-06T11:50:00.000Z')
    const 새판 = new Date('2026-09-06T11:55:00.000Z')
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: 나, now: NOW,
      client: fakeClient({ ownerId: 'me', expiresAt: soon, lastAppliedStartedAt: 새판 }),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toBe('stale_run')
      expect(describeVerdict(v)).toContain('옛 결과로 안 덮는다')
    }
  })

  it('내가 더 새 판이면 쓴다', async () => {
    const 나 = new Date('2026-09-06T11:58:00.000Z')
    const 옛판 = new Date('2026-09-06T11:50:00.000Z')
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: 나, now: NOW,
      client: fakeClient({ ownerId: 'me', expiresAt: soon, lastAppliedStartedAt: 옛판 }),
    })
    expect(v.ok).toBe(true)
  })

  it('아무도 안 썼으면 쓴다', async () => {
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: NOW, now: NOW,
      client: fakeClient({ ownerId: 'me', expiresAt: soon, lastAppliedStartedAt: null }),
    })
    expect(v.ok).toBe(true)
  })

  it('★같은 시각이면 쓴다★ — 나 자신이 다시 부른 것이다 (멱등)', async () => {
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: NOW, now: NOW,
      client: fakeClient({ ownerId: 'me', expiresAt: soon, lastAppliedStartedAt: NOW }),
    })
    expect(v.ok).toBe(true)
  })
})

describe('모르면 안 쓴다', () => {
  it('★DB 에 못 닿으면 쓰지 않는다★ (O-055 에서 배운 것)', async () => {
    const v = await canWriteSeason0({
      ownerId: 'me', startedAt: NOW, now: NOW,
      client: fakeClient(new Error('연결이 끊겼다')),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toBe('unreachable')
      expect(describeVerdict(v)).toContain('모르면 안 쓴다')
    }
  })
})
