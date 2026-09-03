import { describe, expect, it } from 'vitest'
import {
  SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS,
  SYNC_FRESHNESS_FALLBACK_ORIGINS,
  SYNC_FRESHNESS_ORIGINS,
  SYNC_FRESHNESS_REPORT_ONLY,
  formatSyncFreshness,
  type SyncFreshnessRow,
} from '../jobs/syncFreshness.js'

const row = (over: Partial<SyncFreshnessRow>): SyncFreshnessRow => ({
  league: 'supply',
  found: true,
  newestStartAt: new Date('2026-09-01T00:00:00.000Z'),
  newestIngestedAt: new Date('2026-09-01T00:10:00.000Z'),
  ageHours: 1,
  maxAgeHours: 24,
  pass: true,
  reportOnly: false,
  origins: ['3rd.supply'],
  ...over,
})

describe('리그별 origin', () => {
  it('IPL 은 병영수첩에서 온다 — 3rd.supply 가 아니다', () => {
    expect(SYNC_FRESHNESS_ORIGINS.nolink).toEqual(['nexon_barracks'])
  })

  it('미러로 들어오는 세 리그는 그대로다', () => {
    for (const slug of ['supply', 'sanply', 'daerule']) {
      expect(SYNC_FRESHNESS_ORIGINS[slug]).toEqual(['3rd.supply'])
    }
  })

  it('모르는 리그는 지금까지의 전제를 그대로 쓴다', () => {
    expect(SYNC_FRESHNESS_FALLBACK_ORIGINS).toEqual(['3rd.supply'])
    expect(SYNC_FRESHNESS_ORIGINS['처음보는리그']).toBeUndefined()
  })
})

describe('판정하지 않는 리그', () => {
  it('IPL 은 보여 주기만 한다 — 자동 수집이 없어 낡은 것이 정상이다', () => {
    expect(SYNC_FRESHNESS_REPORT_ONLY.has('nolink')).toBe(true)
  })

  it('수집이 도는 리그는 계속 판정한다', () => {
    /* 2026-09-03 (O-042) — 여기 `daerule` 이 있었다. 수집을 멈춰서 뺐다 (아래 검사 참조) */
    for (const slug of ['supply', 'sanply']) {
      expect(SYNC_FRESHNESS_REPORT_ONLY.has(slug)).toBe(false)
      expect(SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS[slug]).toBeGreaterThan(0)
    }
  })

  /**
   * ★대룰리그는 판정하지 않는다★ (O-042 · 2026-09-03 · 사장님 지시 2회).
   *
   * > «대룰리그는 없애 생각하지마 이거 못박아놔 저번에도 말해줬었는데 까먹네 자꾸»
   * > → «수집하지마라»
   *
   * ⚠ ★임계값(168)은 지우지 않는다.★ 지우면 기본값 48시간으로 떨어져 **더 자주 운다** —
   *   수집을 멈춘 리그는 반드시 낡으므로, 판정에서 빼는 것과 임계값을 지우는 것은 다르다.
   *   ★이 둘을 헷갈리면 `/api/health` 가 다시 노랑에 고정된다★ (오늘 아침에 고친 그 증상이다).
   */
  it('대룰리그는 보여 주기만 한다 — 수집을 멈췄으니 낡은 것이 정상이다', () => {
    expect(SYNC_FRESHNESS_REPORT_ONLY.has('daerule')).toBe(true)
    /* 값은 살아 있어야 한다 — 표시에 쓴다 */
    expect(SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS.daerule).toBe(168)
  })

  it('임계값을 추측해서 넣지 않았다 — IPL 은 기본 임계값 표에도 없다', () => {
    expect(SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS.nolink).toBeUndefined()
  })
})

describe('formatSyncFreshness', () => {
  it('판정하는 리그는 ok / 밀렸다 로 적는다', () => {
    expect(formatSyncFreshness([row({ pass: true })])).toContain('ok')
    expect(formatSyncFreshness([row({ pass: false, ageHours: 99 })])).toContain('밀렸다')
  })

  it('보여 주기만 하는 리그는 「표시만」이고 임계값 자리를 비운다', () => {
    const text = formatSyncFreshness([
      row({ league: 'nolink', reportOnly: true, maxAgeHours: 48, ageHours: 41.7 }),
    ])
    expect(text).toContain('표시만')
    /* 안 쓰는 숫자를 보여 주면 쓰는 줄 안다 */
    expect(text).not.toContain('48h')
    expect(text).toContain('41.7h')
  })

  it('리그를 못 찾으면 표시만이어도 그대로 알린다 — 오타로 조용해지면 안 된다', () => {
    const text = formatSyncFreshness([row({ league: 'ㅇㅅㅌ', found: false, reportOnly: true })])
    expect(text).toContain('리그를 찾지 못했다')
  })
})
