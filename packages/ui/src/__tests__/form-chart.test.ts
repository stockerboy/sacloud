/**
 * `최근 폼` 그래프의 세로축과 문구 회귀 (D-167).
 *
 * 지키는 것
 *  - 값이 거의 같은 여섯 달을 급등락처럼 그리지 않는다 (최소 축 폭).
 *  - 킬뎃은 0~100 밖으로 나가지 않는다.
 *  - 판정 문구는 **사용자가 지정한 표현 그대로**다. 다듬지 않는다.
 */
import { describe, expect, it } from 'vitest'
import { formChartDomain, formChartSegments, formChartX, formChartY } from '../record/formChart'
import { FORM_TREND_TEXT, formMonthLabel } from '../record/formCopy'

describe('formChartDomain', () => {
  it('값이 하나도 없으면 축을 만들지 않는다 — 0 으로 채운 그래프를 그리지 않는다', () => {
    expect(formChartDomain([])).toBeNull()
  })

  it('차이가 아주 작아도 최소 폭(10%p)을 유지한다', () => {
    const domain = formChartDomain([50.1, 50.2, 50.3])!
    expect(domain.hi - domain.lo).toBeCloseTo(10, 5)
    expect(domain.lo).toBeLessThan(50.1)
    expect(domain.hi).toBeGreaterThan(50.3)
  })

  it('넓게 벌어진 값은 위아래 여유만 두고 담는다', () => {
    const domain = formChartDomain([30, 70])!
    expect(domain.lo).toBeLessThan(30)
    expect(domain.hi).toBeGreaterThan(70)
    expect(domain.lo).toBeGreaterThanOrEqual(0)
    expect(domain.hi).toBeLessThanOrEqual(100)
  })

  it('0 이나 100 을 넘지 않는다', () => {
    const low = formChartDomain([0, 1])!
    expect(low.lo).toBe(0)
    expect(low.hi).toBeLessThanOrEqual(100)

    const high = formChartDomain([99, 100])!
    expect(high.hi).toBe(100)
    expect(high.lo).toBeGreaterThanOrEqual(0)
  })

  it('한 달만 있어도 축이 생긴다', () => {
    const domain = formChartDomain([48.4])!
    expect(domain.hi - domain.lo).toBeCloseTo(10, 5)
  })
})

describe('formChartSegments', () => {
  /** `kd_rate` 만 쓰는 자리라 나머지는 형식만 맞춘다 */
  const month = (key: string, kd: number | null) => ({
    month: key,
    games: kd === null ? 0 : 10,
    kill: 0,
    death: 0,
    kd_rate: kd,
  })

  it('빈 달을 건너뛰어 잇지 않는다 — 선이 끊긴다', () => {
    const months = [
      month('2026-03', 47),
      month('2026-04', 47.6),
      month('2026-05', 50.9),
      month('2026-06', null),
      month('2026-07', 44.9),
      month('2026-08', 42.5),
    ]
    const segments = formChartSegments(months, formChartDomain([47, 47.6, 50.9, 44.9, 42.5])!)
    expect(segments).toHaveLength(2)
    expect(segments[0]!.points.split(' ')).toHaveLength(3)
    expect(segments[1]!.points.split(' ')).toHaveLength(2)
  })

  it('혼자 떨어진 달은 선을 만들지 않는다 (점만 찍힌다)', () => {
    const months = [
      month('2026-03', 50),
      month('2026-04', null),
      month('2026-05', 60),
      month('2026-06', null),
      month('2026-07', null),
      month('2026-08', null),
    ]
    expect(formChartSegments(months, formChartDomain([50, 60])!)).toHaveLength(0)
  })

  it('가로 위치는 첫 달과 마지막 달이 칸 안에 들어온다', () => {
    expect(formChartX(0, 6)).toBeGreaterThan(0)
    expect(formChartX(5, 6)).toBeLessThan(100)
    expect(formChartX(0, 6)).toBeLessThan(formChartX(5, 6))
  })

  it('킬뎃이 높을수록 위(=y 가 작다)에 그린다 — 축이 뒤집히면 그래프가 거짓말을 한다', () => {
    const domain = formChartDomain([40, 60])!
    expect(formChartY(60, domain)).toBeLessThan(formChartY(40, domain))
    expect(formChartY(60, domain)).toBeGreaterThan(0)
    expect(formChartY(40, domain)).toBeLessThan(100)
  })
})

describe('판정 문구', () => {
  it('사용자가 지정한 세 문구를 그대로 쓴다', () => {
    expect(FORM_TREND_TEXT.rising).toBe('최근 폼이 급상승중입니다')
    expect(FORM_TREND_TEXT.steady).toBe('최근 꾸준한 퍼포먼스를 보여줍니다')
    expect(FORM_TREND_TEXT.falling).toBe('최근 퍼포먼스가 하락중입니다')
  })

  it('경기가 부족한 선수는 셋 중 하나로 밀어 넣지 않는다', () => {
    expect(FORM_TREND_TEXT.unknown).toBe('최근 폼을 판정할 경기가 부족합니다')
  })
})

describe('formMonthLabel', () => {
  it('`2026-03` → `3월`', () => {
    expect(formMonthLabel('2026-03')).toBe('3월')
    expect(formMonthLabel('2025-12')).toBe('12월')
  })
})
