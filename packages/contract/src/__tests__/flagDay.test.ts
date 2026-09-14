import { describe, expect, it } from 'vitest'
import {
  FLAG_DAY_LIVE_HOURS,
  flagDayFromKey,
  flagDayIsLive,
  flagDayLabel,
  flagDayOf,
  flagDayProgress,
} from '../flagDay'

/**
 * ★깃발 하루★ (2026-09-15 사장님: «새벽3시에 마감치고 다음날 오후 5시에 초기화»).
 *
 * 경계는 틀려도 화면이 안 죽는다 — ★조용히 하루가 어긋난다.★
 * 그래서 사장님이 말씀하신 시각을 그대로 시험으로 박아 둔다.
 */

/** KST 시각을 적으면 UTC `Date` 를 준다 — 시험을 읽기 쉬우라고 */
const kst = (iso: string) => new Date(`${iso}+09:00`)

describe('flagDayOf — 17시에 열고 다음날 03시에 닫는다', () => {
  it('17:00 을 넘기면 ★내일 마감★ 칸이 방금 열린 것이다', () => {
    const day = flagDayOf(kst('2026-09-14T17:00:00'))
    expect(day.key).toBe('2026-09-15')
    expect(day.opensAt.toISOString()).toBe(kst('2026-09-14T17:00:00').toISOString())
    expect(day.closesAt.toISOString()).toBe(kst('2026-09-15T03:00:00').toISOString())
  })

  it('16:59 는 ★아직 어제 칸★ 이다 — 잠긴 구간', () => {
    expect(flagDayOf(kst('2026-09-14T16:59:59')).key).toBe('2026-09-14')
  })

  it('02:59 는 아직 열려 있는 칸', () => {
    expect(flagDayOf(kst('2026-09-15T02:59:59')).key).toBe('2026-09-15')
  })

  it('★03:00 에 마감한다★ — 칸은 그대로 두고 닫기만 한다', () => {
    const at = kst('2026-09-15T03:00:00')
    expect(flagDayOf(at).key).toBe('2026-09-15')
    expect(flagDayIsLive(at)).toBe(false)
  })

  it('03:00~17:00 사이에는 ★방금 닫힌 칸★ 을 계속 보여 준다', () => {
    /* 새 칸을 미리 열면 «아무도 안 뛴 텅 빈 산» 이 14시간 서 있게 된다 */
    expect(flagDayOf(kst('2026-09-15T03:01:00')).key).toBe('2026-09-15')
    expect(flagDayOf(kst('2026-09-15T12:00:00')).key).toBe('2026-09-15')
    expect(flagDayOf(kst('2026-09-15T16:59:59')).key).toBe('2026-09-15')
  })

  it('17:00 이 되면 ★다음 칸★ 으로 넘어간다 (초기화)', () => {
    expect(flagDayOf(kst('2026-09-15T17:00:00')).key).toBe('2026-09-16')
  })

  it('달을 넘어가도 맞는다', () => {
    expect(flagDayOf(kst('2026-09-30T18:00:00')).key).toBe('2026-10-01')
    expect(flagDayOf(kst('2026-10-01T02:00:00')).key).toBe('2026-10-01')
  })

  it('해를 넘어가도 맞는다', () => {
    expect(flagDayOf(kst('2026-12-31T20:00:00')).key).toBe('2027-01-01')
  })

  it('경쟁 시간은 10시간이다', () => {
    expect(FLAG_DAY_LIVE_HOURS).toBe(10)
    const day = flagDayOf(kst('2026-09-14T18:00:00'))
    const hours = (day.closesAt.getTime() - day.opensAt.getTime()) / 3_600_000
    expect(hours).toBe(10)
  })
})

describe('flagDayIsLive — 열려 있나', () => {
  it('17:00 부터 02:59 까지 열려 있다', () => {
    expect(flagDayIsLive(kst('2026-09-14T17:00:00'))).toBe(true)
    expect(flagDayIsLive(kst('2026-09-14T23:30:00'))).toBe(true)
    expect(flagDayIsLive(kst('2026-09-15T02:59:59'))).toBe(true)
  })

  it('03:00 부터 16:59 까지 닫혀 있다', () => {
    expect(flagDayIsLive(kst('2026-09-15T03:00:00'))).toBe(false)
    expect(flagDayIsLive(kst('2026-09-15T16:59:59'))).toBe(false)
  })
})

describe('flagDayProgress — 산에서 어디쯤인가', () => {
  it('열자마자 0 · 한가운데 0.5 · 닫히면 1', () => {
    expect(flagDayProgress(kst('2026-09-14T17:00:00'))).toBe(0)
    expect(flagDayProgress(kst('2026-09-14T22:00:00'))).toBeCloseTo(0.5, 6)
    expect(flagDayProgress(kst('2026-09-15T03:00:00'))).toBe(1)
  })

  it('닫힌 뒤에도 1 이다 — 정상이다', () => {
    expect(flagDayProgress(kst('2026-09-15T12:00:00'))).toBe(1)
  })
})

describe('flagDayFromKey — 저장된 깃발을 되읽는다', () => {
  it('키를 주면 같은 칸이 나온다', () => {
    const made = flagDayOf(kst('2026-09-14T20:00:00'))
    const back = flagDayFromKey(made.key)
    expect(back).not.toBeNull()
    expect(back?.opensAt.toISOString()).toBe(made.opensAt.toISOString())
    expect(back?.closesAt.toISOString()).toBe(made.closesAt.toISOString())
  })

  it('★달력에 없는 날은 지어내지 않는다★', () => {
    expect(flagDayFromKey('2026-02-30')).toBeNull()
    expect(flagDayFromKey('2026-13-01')).toBeNull()
    expect(flagDayFromKey('말이 안 되는 값')).toBeNull()
  })
})

describe('flagDayLabel', () => {
  it('«9/15 마감» 으로 적는다', () => {
    expect(flagDayLabel(flagDayOf(kst('2026-09-14T20:00:00')))).toBe('9/15 마감')
  })
})
