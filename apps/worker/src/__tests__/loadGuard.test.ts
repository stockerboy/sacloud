/**
 * **부하 감시 — 무엇을 보고 물러나나** (O-051 · 2026-09-03).
 *
 * 지키려는 것 셋.
 * ```
 * ① ★`checks.db` 만 본다★     최상위 `status` 를 보면 수집이 자기 때문에 물러난다
 * ② ★첫 요청은 깨우는 시간★    그걸 부하로 읽으면 ★영원히 시작조차 못 한다★
 * ③ ★기준선은 숫자로 남긴다★   「괜찮았다」는 보고가 아니다
 * ```
 */
import { describe, expect, it } from 'vitest'
import { BASELINE_MS, PAUSE_MS, STOP_MS, guardLine, newGuardState } from '../jobs/loadGuard'

describe('기준값', () => {
  it('★O-017 이 잰 기준선 0.39초★ 를 그대로 쓴다', () => {
    expect(BASELINE_MS).toBe(390)
  })

  it('쉼(1.5초) 과 정지(3초) 는 O-017 조건 그대로다', () => {
    expect(PAUSE_MS).toBe(1500)
    expect(STOP_MS).toBe(3000)
    expect(PAUSE_MS).toBeLessThan(STOP_MS)
  })
})

describe('사람에게 보이는 한 줄', () => {
  it('★「괜찮았다」가 아니라 숫자와 기준선 대비 배수를 적는다★', () => {
    const s = newGuardState()
    s.lastMs = 312
    s.lastDbStatus = 'ok'
    const line = guardLine(s)
    expect(line).toContain('312ms')
    expect(line).toContain('390ms')
    expect(line).toContain('0.80배')
    expect(line).toContain('db=ok')
  })

  it('★못 잰 것과 안 잰 것을 갈라 적는다★', () => {
    const s = newGuardState()
    expect(guardLine(s)).toContain('못 쟀다')
    /* 「안 쟀다」로 읽히면 실패를 정상으로 넘긴다 */
    expect(guardLine(s)).toContain('안 잰 것과 다르다')
  })

  it('★★첫 요청이 느렸다는 것을 남긴다 — 콜드스타트였다는 증거★★', () => {
    const s = newGuardState()
    s.lastMs = 337
    s.lastDbStatus = 'ok'
    s.coldFirstMs = 3161
    const line = guardLine(s)
    expect(line).toContain('3161ms')
    expect(line).toContain('깨우는 시간이지 부하가 아니다')
  })

  it('연속으로 물러난 횟수를 적는다 — ★한 판만 보면 밤새 그러는 걸 모른다★', () => {
    const s = newGuardState()
    s.lastMs = 4000
    s.lastDbStatus = 'ok'
    s.retreatStreak = 2
    expect(guardLine(s)).toContain('연속 물러남 2회')
  })

  it('느릴수록 별이 는다 — 눈으로 먼저 걸린다', () => {
    const mk = (ms: number): string => {
      const s = newGuardState()
      s.lastMs = ms
      s.lastDbStatus = 'ok'
      return guardLine(s)
    }
    expect(mk(300).startsWith('★')).toBe(false)
    expect(mk(2000).startsWith('★')).toBe(true)
    expect(mk(4000).startsWith('★★')).toBe(true)
  })
})
