/**
 * ★★「지금 시즌」은 `status` 가 아니다★★ (2026-09-07 · 사장님 결정)
 *
 * 여기서 못 박는 것
 *   1. `status` 는 ★「아직 종료되지 않았다」★ 다 — ★미래 시즌도 active★ 다
 *   2. 「지금 시즌」은 ★시각이 창 안★ 인 시즌이다 (시작 이상 · 종료 미만)
 *   3. 10/1 경계에서 Cloud 0 → Cloud 1 로 넘어간다
 *   4. 고르는 정렬은 ★번호가 아니라 시작 시각★ 이다
 *
 * DB 에 안 붙고도 깨지면 바로 알 수 있게, 조건 객체를 ★그대로 재현해서★ 판정한다.
 */
import { describe, expect, it } from 'vitest'
import { CURRENT_SEASON_ORDER, currentSeasonWhere } from '../season'

/** 운영 실측값 (2026-09-07 · 세 리그 모두 같다) */
const CLOUD_0 = {
  number: 0,
  status: 'active',
  startedAt: new Date('2026-09-03T07:00:00+09:00'),
  endedAt: new Date('2026-10-01T00:00:00+09:00'),
}
const CLOUD_1 = {
  number: 1,
  status: 'active',
  startedAt: new Date('2026-10-01T00:00:00+09:00'),
  endedAt: null as Date | null,
}
const BETA = {
  number: -1,
  status: 'closed',
  startedAt: new Date('2026-03-05T00:00:00+09:00'),
  endedAt: new Date('2026-09-03T07:00:00+09:00'),
}
const ROWS = [CLOUD_1, CLOUD_0, BETA]

/** `currentSeasonWhere` 가 만든 조건을 그대로 적용한다 — Prisma 없이 같은 판정 */
function matches(row: { startedAt: Date; endedAt: Date | null }, now: Date): boolean {
  const where = currentSeasonWhere(now)
  const startOk = row.startedAt.getTime() <= where.startedAt.lte.getTime()
  const endOk = where.OR.some((clause) =>
    'endedAt' in clause && clause.endedAt === null
      ? row.endedAt === null
      : row.endedAt !== null &&
        row.endedAt.getTime() > (clause.endedAt as { gt: Date }).gt.getTime(),
  )
  return startOk && endOk
}

/** 조건 + 정렬(시작 시각 내림차순)로 한 개를 고른다 */
function pick(now: Date) {
  const hit = ROWS.filter((row) => matches(row, now))
  hit.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  return hit[0] ?? null
}

describe('status 는 「지금」이 아니다', () => {
  it('★미래 시즌도 active 다★ — 그래서 status 로는 못 고른다', () => {
    expect(CLOUD_1.status).toBe('active')
    expect(CLOUD_0.status).toBe('active')
    /* 옛 방식: status='active' + number DESC → 아직 오지 않은 Cloud 1 이 이긴다 */
    const oldWay = ROWS.filter((r) => r.status === 'active').sort((a, b) => b.number - a.number)[0]
    expect(oldWay?.number).toBe(1)
  })

  it('정렬 기준은 ★번호가 아니라 시작 시각★ 이다', () => {
    expect(CURRENT_SEASON_ORDER).toEqual([{ startedAt: 'desc' }])
  })

  it('조건에 status 가 들어 있지 않다', () => {
    expect(JSON.stringify(currentSeasonWhere(new Date()))).not.toContain('status')
  })
})

describe('지금 시각으로 고른다', () => {
  it('2026-09-07 → ★Cloud 0★', () => {
    expect(pick(new Date('2026-09-07T12:00:00+09:00'))?.number).toBe(0)
  })

  it('★경계 직전★ 2026-09-30 23:59 KST → Cloud 0', () => {
    expect(pick(new Date('2026-09-30T23:59:59+09:00'))?.number).toBe(0)
  })

  it('★경계 정각★ 2026-10-01 00:00 KST → Cloud 1', () => {
    expect(pick(new Date('2026-10-01T00:00:00+09:00'))?.number).toBe(1)
  })

  it('경계 이후 2026-10-05 → Cloud 1', () => {
    expect(pick(new Date('2026-10-05T00:00:00+09:00'))?.number).toBe(1)
  })

  it('시즌0 시작 정각은 ★시즌0★ 이다 — 「이상」이다', () => {
    expect(pick(new Date('2026-09-03T07:00:00+09:00'))?.number).toBe(0)
  })

  it('시즌0 시작 1초 전은 베타다 — 창이 겹치지 않는다', () => {
    expect(pick(new Date('2026-09-03T06:59:59+09:00'))?.number).toBe(-1)
  })

  it('아무 창에도 안 들면 ★null★ — 지어내지 않는다', () => {
    expect(pick(new Date('2019-01-01T00:00:00+09:00'))).toBeNull()
  })
})

describe('규칙은 `seasonWindowAt` 과 같다', () => {
  it('시작은 「이상」, 종료는 「미만」', () => {
    const where = currentSeasonWhere(new Date('2026-10-01T00:00:00+09:00'))
    /* 종료가 경계와 같으면 그 시즌은 이미 끝났다 (`gt` 라서 걸리지 않는다) */
    expect(matches(CLOUD_0, new Date('2026-10-01T00:00:00+09:00'))).toBe(false)
    expect(where.startedAt.lte.toISOString()).toBe('2026-09-30T15:00:00.000Z')
  })
})
