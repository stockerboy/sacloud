/**
 * 적응형 폴링 정책 회귀 테스트 (Phase 8.1 E 요구사항).
 *
 * 여기서 검증하는 것은 **판단 규칙**이다. DB·네트워크 없이 전부 돌아간다.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POLLING_CONFIG,
  comparePollTargets,
  decideDetailFetch,
  effectivePriority,
  nextPollState,
  readPollingConfig,
  selectPollTargets,
  tierForEmptyPolls,
  type PollState,
} from '../lib/pollingPolicy.js'

const NOW = new Date('2026-08-21T00:00:00Z')
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

function state(overrides: Partial<PollState> = {}): PollState {
  return {
    ouid: 'OU-1',
    tier: 'hot',
    priorityClass: 'general',
    intervalMinutes: DEFAULT_POLLING_CONFIG.intervalMinutes.hot,
    nextPollAt: NOW,
    lastPolledAt: null,
    lastNewMatchAt: null,
    consecutiveEmptyPolls: 0,
    recentNewMatchCount: 0,
    manualRefreshRequestedAt: null,
    lastPollStatus: null,
    ...overrides,
  }
}

describe('폴링 주기 조절', () => {
  it('신규 경기를 발견하면 주기가 짧아지고 hot으로 올라간다', () => {
    const cold = state({ tier: 'cold', intervalMinutes: 1440, consecutiveEmptyPolls: 7 })
    const patch = nextPollState(cold, { newMatches: 3, success: true }, NOW)

    expect(patch.tier).toBe('hot')
    expect(patch.intervalMinutes).toBeLessThan(cold.intervalMinutes)
    expect(patch.consecutiveEmptyPolls).toBe(0)
    expect(patch.recentNewMatchCount).toBe(3)
    expect(patch.lastNewMatchAt).toEqual(NOW)
    expect(patch.nextPollAt.getTime()).toBe(
      NOW.getTime() + DEFAULT_POLLING_CONFIG.intervalMinutes.hot * MINUTE,
    )
  })

  it('연속으로 새 경기가 없으면 주기가 길어진다 (hot → warm → cold → dormant)', () => {
    let current = state()
    const seen: string[] = []
    for (let round = 0; round < 10; round += 1) {
      const patch = nextPollState(current, { newMatches: 0, success: true }, NOW)
      seen.push(patch.tier)
      current = { ...current, ...patch, manualRefreshRequestedAt: null }
    }

    expect(seen[0]).toBe('hot')
    expect(seen).toContain('warm')
    expect(seen).toContain('cold')
    expect(seen.at(-1)).toBe('dormant')
    expect(current.intervalMinutes).toBe(DEFAULT_POLLING_CONFIG.intervalMinutes.dormant)
  })

  it('오래 조용하면 연속 횟수와 무관하게 dormant로 본다', () => {
    const quiet = state({
      lastNewMatchAt: new Date(NOW.getTime() - 40 * DAY),
      consecutiveEmptyPolls: 0,
    })
    const patch = nextPollState(quiet, { newMatches: 0, success: true }, NOW)
    expect(patch.tier).toBe('dormant')
  })

  it('실패는 활동량이 아니다 — 티어를 내리지 않고 다음 조회만 미룬다', () => {
    const hot = state({ tier: 'hot', intervalMinutes: 30, consecutiveEmptyPolls: 0 })
    const patch = nextPollState(hot, { newMatches: 0, success: false }, NOW)

    expect(patch.tier).toBe('hot')
    expect(patch.lastPollStatus).toBe('failed')
    expect(patch.consecutiveEmptyPolls).toBe(0)
    expect(patch.intervalMinutes).toBe(30 * DEFAULT_POLLING_CONFIG.failureBackoffFactor)
  })

  it('차단(403/429)은 blocked로 구분해 기록한다', () => {
    const patch = nextPollState(state(), { newMatches: 0, success: false, blocked: true }, NOW)
    expect(patch.lastPollStatus).toBe('blocked')
  })

  it('강등 기준은 설정값이다 (코드에 고정하지 않는다)', () => {
    const config = readPollingConfig({
      NEXON_POLL_HOT_MINUTES: '5',
      NEXON_POLL_EMPTY_TO_WARM: '1',
    })
    expect(config.intervalMinutes.hot).toBe(5)
    expect(tierForEmptyPolls(1, config)).toBe('warm')
    expect(tierForEmptyPolls(1, DEFAULT_POLLING_CONFIG)).toBe('hot')
  })
})

describe('우선순위 큐', () => {
  it('사용자 수동 갱신이 최우선이다', () => {
    const manual = state({ tier: 'dormant', manualRefreshRequestedAt: NOW })
    const hot = state({ ouid: 'OU-2', tier: 'hot' })

    expect(effectivePriority(manual, NOW)).toBe(0)
    expect(effectivePriority(hot, NOW)).toBe(1)
    expect(comparePollTargets(manual, hot, NOW)).toBeLessThan(0)
  })

  it('티어 순서대로 뽑는다 (hot → warm → cold → dormant)', () => {
    const targets = [
      state({ ouid: 'dormant', tier: 'dormant' }),
      state({ ouid: 'warm', tier: 'warm' }),
      state({ ouid: 'hot', tier: 'hot' }),
      state({ ouid: 'cold', tier: 'cold' }),
    ]
    const picked = selectPollTargets(targets, NOW, 4).map((target) => target.ouid)
    expect(picked).toEqual(['hot', 'warm', 'cold', 'dormant'])
  })

  it('예정 시각이 지나지 않은 대상은 뽑지 않는다', () => {
    const future = state({ nextPollAt: new Date(NOW.getTime() + 10 * MINUTE) })
    expect(selectPollTargets([future], NOW, 5)).toHaveLength(0)
  })

  it('오래 밀린 대상은 굶지 않는다 (starvation 방지)', () => {
    const starving = state({
      ouid: 'starving',
      tier: 'dormant',
      nextPollAt: new Date(NOW.getTime() - 5 * DAY),
    })
    const fresh = state({ ouid: 'fresh', tier: 'hot', nextPollAt: NOW })

    // 티어만 보면 dormant가 뒤로 밀리지만, 크게 밀린 대상은 hot과 같은 우선순위로 올라온다
    expect(effectivePriority(starving, NOW)).toBe(1)
    const picked = selectPollTargets([fresh, starving], NOW, 1).map((target) => target.ouid)
    expect(picked).toEqual(['starving'])
  })

  it('같은 우선순위면 오래 기다린 쪽이 먼저다', () => {
    const older = state({ ouid: 'older', nextPollAt: new Date(NOW.getTime() - 60 * MINUTE) })
    const newer = state({ ouid: 'newer', nextPollAt: new Date(NOW.getTime() - 10 * MINUTE) })
    expect(selectPollTargets([newer, older], NOW, 2).map((t) => t.ouid)).toEqual(['older', 'newer'])
  })
})

describe('상세 재조회 판단', () => {
  it('이미 저장한 경기는 상세를 다시 부르지 않는다', () => {
    expect(
      decideDetailFetch({ hasDetail: true, refreshDueAt: new Date(NOW.getTime() + DAY), now: NOW }),
    ).toEqual({ fetch: false, reason: 'already_have' })
  })

  it('처음 보는 경기는 상세를 받는다', () => {
    expect(decideDetailFetch({ hasDetail: false, refreshDueAt: null, now: NOW })).toEqual({
      fetch: true,
      reason: 'new',
    })
  })

  it('신선도 기한이 지난 경기는 기존 경기라도 다시 검증한다 (30일 정책)', () => {
    expect(
      decideDetailFetch({
        hasDetail: true,
        refreshDueAt: new Date(NOW.getTime() - MINUTE),
        now: NOW,
      }),
    ).toEqual({ fetch: true, reason: 'refresh_due' })
  })

  it('강제 재조회는 명시적으로만 된다', () => {
    expect(
      decideDetailFetch({ hasDetail: true, refreshDueAt: null, now: NOW, force: true }).reason,
    ).toBe('forced')
  })
})
