import { describe, expect, it } from 'vitest'
import {
  WATCHDOG_DEFAULT_THRESHOLDS,
  evaluateWatch,
  formatWatchMessage,
  parseStaleMin,
  transitionWatch,
  type WatchNumbers,
} from '../jobs/collectWatchdog.js'

/** 2026-09-02 14:00 KST 를 「지금」으로 둔다 */
const NOW = new Date('2026-09-02T05:00:00.000Z')
const minutesAgo = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString()

function numbers(over: Partial<WatchNumbers> = {}): WatchNumbers {
  return {
    now: NOW.toISOString(),
    leagues: [
      { slug: 'supply', found: true, newestStartAt: minutesAgo(12), newestIngestedAt: minutesAgo(9) },
      { slug: 'sanply', found: true, newestStartAt: minutesAgo(25), newestIngestedAt: minutesAgo(20) },
      { slug: 'nolink', found: true, newestStartAt: minutesAgo(3 * 24 * 60), newestIngestedAt: minutesAgo(3 * 24 * 60) },
    ],
    /*
     * ★2026-09-03 · 창구가 도는 세상으로 바꿨다★
     *
     * 그전에는 3일 전 값이었다 — ★자동 수집이 없어서 그게 「정상」이었기 때문이다.★
     * O-051 이 15분마다 도는 수집을 만들었고 (`barracks-collect.yml`),
     * ★이제 3일 전은 정상이 아니라 고장이다.★ 그래서 픽스처가 먼저 바뀐다.
     */
    ingest: { rows: 7229, newestFetchedAt: minutesAgo(5) },
    workflows: [
      { file: 'supply-incremental.yml', runs: [{ conclusion: 'success', createdAt: minutesAgo(15), updatedAt: minutesAgo(5) }] },
      { file: 'season0-apply.yml', runs: [{ conclusion: 'success', createdAt: minutesAgo(70), updatedAt: minutesAgo(50) }] },
      { file: 'supply-rollup-full.yml', runs: [{ conclusion: 'cancelled', createdAt: minutesAgo(600), updatedAt: minutesAgo(600) }] },
    ],
    ...over,
  }
}

describe('collect-watchdog 판정', () => {
  it('기본 임계(60분)에서 정상 · IPL 은 표시만 · ★창구는 이제 판정한다★', () => {
    const checks = evaluateWatch(numbers(), WATCHDOG_DEFAULT_THRESHOLDS)
    const by = Object.fromEntries(checks.map((c) => [c.id, c]))
    expect(by['league:supply']?.level).toBe('ok')
    expect(by['league:sanply']?.level).toBe('ok')
    expect(by['league:nolink']?.level).toBe('watch')
    /* ★「표시만(watch)」이 아니라 「정상(ok)」이다★ — 판정하지 않으면 멈춰도 조용하다 */
    expect(by['ingest:barracks']?.level).toBe('ok')
    expect(by['apply:success']?.level).toBe('ok')
    expect(by['workflow:supply-rollup-full']?.level).toBe('watch') // 취소만 있으면 셀 것이 없다
    expect(checks.filter((c) => c.level === 'alert')).toHaveLength(0)
  })

  it('★★창구가 30분 넘게 안 늘면 경보다★★ — 「조용히 멈춤」을 끝내려는 것이다', () => {
    /*
     * ★자동 수집이 생겼다★ (O-051 · `barracks-collect.yml` 15분 체인).
     * 그전에는 `ingestAlert: false` 라 낡아도 ★표시만★ 했다 —
     * ★사람이 손으로 긁던 시절에는 낡은 게 정상이었기 때문이다.★
     *
     * ⚠ ★알림을 먼저 켜고 체인을 켰다.★ 반대로 하면 ★안전장치 없이 밤을 넘긴다.★
     */
    const checks = evaluateWatch(
      numbers({ ingest: { rows: 7229, newestFetchedAt: minutesAgo(45) } }),
      WATCHDOG_DEFAULT_THRESHOLDS,
    )
    const ingest = checks.find((c) => c.id === 'ingest:barracks')
    expect(ingest?.level).toBe('alert')
    /* ★문구에 숫자가 있어야 한다★ — 「이상함」은 보고가 아니다 */
    expect(ingest?.line).toContain('45분 전')
    expect(ingest?.line).toContain('임계 30분')
    /* ★「표시만」이라는 말이 더 이상 붙지 않는다★ */
    expect(ingest?.line).not.toContain('표시만')
  })

  it('★기본값이 켜져 있다★ — 이걸 끄면 멈춰도 조용해진다', () => {
    expect(WATCHDOG_DEFAULT_THRESHOLDS.ingestAlert).toBe(true)
  })

  it('일부러 실패 — 임계를 1분으로 내리면 SPL·10mountain 이 경보가 되고 문구에 숫자가 있다', () => {
    const checks = evaluateWatch(numbers(), { ...WATCHDOG_DEFAULT_THRESHOLDS, leagueStaleMin: { supply: 1, sanply: 1 } })
    const spl = checks.find((c) => c.id === 'league:supply')
    expect(spl?.level).toBe('alert')
    expect(spl?.line).toBe('SPL 마지막 경기 09-02 13:48 KST · 12분 전 (임계 1분) · 마지막 적재 09-02 13:51 KST')
    const mt = checks.find((c) => c.id === 'league:sanply')
    expect(mt?.level).toBe('alert')
    expect(mt?.line).toContain('10mountain 마지막 경기 09-02 13:35 KST · 25분 전 (임계 1분)')
  })

  it('사흘 멈춤 (2026-08-31 사례) — IPL 을 감시로 올리면 「3.0일」 단위가 아니라 시간으로 적힌다', () => {
    const checks = evaluateWatch(numbers(), { ...WATCHDOG_DEFAULT_THRESHOLDS, watchLeagues: [] })
    const ipl = checks.find((c) => c.id === 'league:nolink')
    expect(ipl?.level).toBe('alert')
    expect(ipl?.line).toContain('IPL 마지막 경기 08-30 14:00 KST · 72.0시간 전 (임계 60분)')
  })

  it('season0-apply 성공이 3시간 넘게 없으면 경보 · 연속 실패 3회면 경보 (취소는 세지 않는다)', () => {
    const checks = evaluateWatch(
      numbers({
        workflows: [
          {
            file: 'supply-incremental.yml',
            runs: [
              { conclusion: 'failure', createdAt: minutesAgo(5), updatedAt: minutesAgo(4) },
              { conclusion: 'cancelled', createdAt: minutesAgo(15), updatedAt: minutesAgo(15) },
              { conclusion: 'failure', createdAt: minutesAgo(25), updatedAt: minutesAgo(24) },
              { conclusion: 'timed_out', createdAt: minutesAgo(45), updatedAt: minutesAgo(44) },
              { conclusion: 'success', createdAt: minutesAgo(65), updatedAt: minutesAgo(64) },
            ],
          },
          { file: 'season0-apply.yml', runs: [{ conclusion: 'success', createdAt: minutesAgo(200), updatedAt: minutesAgo(190) }] },
          { file: 'supply-rollup-full.yml', runs: [] },
        ],
      }),
      WATCHDOG_DEFAULT_THRESHOLDS,
    )
    const inc = checks.find((c) => c.id === 'workflow:supply-incremental')
    expect(inc?.level).toBe('alert')
    expect(inc?.line).toContain('supply-incremental 연속 실패 3회 (임계 3회) · 최근 실패 09-02 13:55 KST')
    const apply = checks.find((c) => c.id === 'apply:success')
    expect(apply?.level).toBe('alert')
    expect(apply?.line).toBe('season0-apply 마지막 성공 09-02 10:50 KST · 3.2시간 전 (임계 3시간)')
  })

  it('숫자를 못 읽으면 확인불가(경보 취급)', () => {
    const checks = evaluateWatch(
      numbers({ ingest: { rows: null, newestFetchedAt: null, error: 'connect ETIMEDOUT' }, leagues: [{ slug: 'supply', found: true, newestStartAt: null, newestIngestedAt: null, error: 'Timed out fetching a new connection' }] }),
      WATCHDOG_DEFAULT_THRESHOLDS,
    )
    expect(checks.find((c) => c.id === 'ingest:barracks')?.level).toBe('unknown')
    expect(checks.find((c) => c.id === 'league:supply')?.line).toContain('SPL 마지막 경기를 못 읽었다 — Timed out')
  })
})

describe('collect-watchdog 전이 — 바뀔 때만 알린다', () => {
  const tight = { ...WATCHDOG_DEFAULT_THRESHOLDS, leagueStaleMin: { supply: 1, sanply: 1 } }

  it('정상→경보 한 번 · 같은 경보는 다시 안 보냄 · 복구되면 [복구] 와 지속 시간', () => {
    const healthy = evaluateWatch(numbers(), WATCHDOG_DEFAULT_THRESHOLDS)
    const s0 = transitionWatch(null, healthy, NOW)
    expect(s0.events).toHaveLength(0) // 첫 실행에 정상인 것은 알리지 않는다
    expect(formatWatchMessage(s0.events, healthy, NOW)).toBeNull()

    const broken = evaluateWatch(numbers(), tight)
    const t1 = new Date(NOW.getTime() + 10 * 60_000)
    const s1 = transitionWatch(s0.next, broken, t1)
    expect(s1.events.map((e) => `${e.kind}:${e.check.id}`)).toEqual(['alert:league:supply', 'alert:league:sanply'])
    const msg1 = formatWatchMessage(s1.events, broken, t1)
    expect(msg1).toContain('[경보] SACLOUD 수집 감시 · 09-02 14:10 KST')
    expect(msg1).toContain('- 경보: SPL 마지막 경기 09-02 13:48 KST · 12분 전 (임계 1분)')
    expect(msg1).not.toContain('오류')

    const t2 = new Date(NOW.getTime() + 20 * 60_000)
    const s2 = transitionWatch(s1.next, broken, t2)
    expect(s2.events).toHaveLength(0) // 같은 경보 반복 없음
    expect(s2.next.checks['league:supply']?.since).toBe(s1.next.checks['league:supply']?.since) // 언제부터 = 처음 경보 시각

    const t3 = new Date(NOW.getTime() + 55 * 60_000)
    const s3 = transitionWatch(s2.next, healthy, t3)
    expect(s3.events.map((e) => e.kind)).toEqual(['recover', 'recover'])
    const msg3 = formatWatchMessage(s3.events, healthy, t3)
    expect(msg3).toContain('[복구] SACLOUD 수집 감시')
    expect(msg3).toContain('- 복구: SPL 마지막 경기 09-02 13:48 KST · 12분 전 (임계 60분) · 마지막 적재 09-02 13:51 KST · 경보 45분 만에')
  })

  it('첫 실행부터 경보면 그 자리에서 알린다', () => {
    const broken = evaluateWatch(numbers(), tight)
    const s = transitionWatch(null, broken, NOW)
    expect(s.events).toHaveLength(2)
  })

  it('--stale-min 파싱', () => {
    expect(parseStaleMin('supply=60, sanply=30')).toEqual({ supply: 60, sanply: 30 })
    expect(() => parseStaleMin('supply')).toThrow()
    expect(parseStaleMin(null)).toEqual({})
  })
})
