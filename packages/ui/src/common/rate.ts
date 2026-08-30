/**
 * 승률 · 킬뎃 색 등급.
 *
 * 원본 실측 (2026-08-20, 서플라이공식리그 클랜랭킹 20행 + 개인랭킹 20행의 40개 셀 표본)
 *
 * | 구간 | 원본 클래스 | 색 | 표본에서 관측된 범위 |
 * |---|---|---|---|
 * | ~50 미만 | `rate-simple` | #374151 (기본 글자색) | 41.7 ~ 49.7 |
 * | 50 이상 55 미만 | `rate-high-1` | #02ab18 | 50.0 ~ 54.4 |
 * | 55 이상 60 미만 | `rate-high-2` | #f2711c | 55.0 ~ 59.8 |
 * | 60 이상 65 미만 | `rate-high-3` | #2185d0 | 60.1 ~ 64.8 |
 * | 65 이상 | `rate-high-4-light` | #ff3d3d | 65.1, 65.2 |
 *
 * 경계값(정확히 50 / 55 / 60 / 65)은 `rate-high-1`의 최솟값 50.0 만 직접 관측했다.
 * 나머지 경계는 표본 분포에서 유도한 것이라 **`[미확인]`** 이다.
 *
 * 원본에는 `rate-low`(#ff3d3d)와 `rate-high-4`(노랑 #ffe30b)도 정의되어 있으나
 * 밝은 배경의 랭킹 표에서는 관측되지 않았다. `rate-high-4`는 어두운 배경용으로 보인다 `[미확인]`.
 */

export type RateTone = 'base' | 'r1' | 'r2' | 'r3' | 'r4'

/** 등급 경계 (원본 미확인 — 표본에서 유도) */
export const RATE_THRESHOLDS = [50, 55, 60, 65] as const

export function rateTone(value: number | null | undefined): RateTone {
  if (value === null || value === undefined || Number.isNaN(value)) return 'base'
  if (value >= 65) return 'r4'
  if (value >= 60) return 'r3'
  if (value >= 55) return 'r2'
  if (value >= 50) return 'r1'
  return 'base'
}

const TONE_CLASS: Record<RateTone, string> = {
  base: '',
  r1: 'text-rate-1',
  r2: 'text-rate-2',
  r3: 'text-rate-3',
  /*
   * 65 이상은 **노랑**(`rate-4`)이다 — 2026-08-30 사용자가 시안을 보고 골랐다.
   *
   * 원본은 밝은 배경에서 빨강(`rate-4-light`)을 썼고 우리도 그것을 따라갔었다.
   * 배경이 검정으로 바뀐 뒤로는 그 빨강이 강조색(`--color-accent` #d92b2b)과 겹쳐
   * "1위·활성 표시" 와 "승률 65% 이상" 이 같은 색이 된다. 원본이 어두운 배경용으로
   * 갖고 있던 노랑을 쓰면 그 충돌이 사라진다.
   */
  r4: 'text-rate-4',
}

/** 승률·킬뎃 색 클래스 (배경은 검정이다) */
export function rateClass(value: number | null | undefined): string {
  return TONE_CLASS[rateTone(value)]
}
