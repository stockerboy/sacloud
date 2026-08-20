/**
 * 파생값 계산 규칙.
 *
 * 원본이 서버에서 내려주는 값인지 클라이언트가 계산하는 값인지는 [미확인]이다.
 * 우리 계약에서는 **응답에 포함**하기로 확정했고, 계산 규칙은 여기 한 곳에만 둔다.
 * (Phase 7의 실제 서버도 이 규칙을 그대로 구현한다.)
 */

/** 승률 % — 소수점 1자리 */
export function winRate(win: number, lose: number): number {
  const total = win + lose
  if (total === 0) return 0
  return Math.round((win / total) * 1000) / 10
}

/**
 * 킬뎃 % — `킬 / (킬 + 데스) × 100`, 소수점 1자리.
 *
 * **원본 실측으로 확정 (2026-08-20).** 킬÷데스 비율이 아니라 **백분율**이다.
 * 근거: 서플라이공식리그 1위 플레이어 `17,855킬 17,422데스 → 킬뎃 50.6%`
 *       → 17855 / (17855 + 17422) = 0.5061 → 50.6 ✓
 * 승률과 같은 색 등급(50/55/60/65)을 쓰는 것도 백분율이기 때문이다.
 */
export function kdRate(kill: number, death: number): number {
  const total = kill + death
  if (total === 0) return 0
  return Math.round((kill / total) * 1000) / 10
}

/** 평균킬 — 소수점 2자리 */
export function killPerMatch(kill: number, matchCount: number): number {
  if (matchCount === 0) return 0
  return Math.round((kill / matchCount) * 100) / 100
}

/** 비중 % — 소수점 1자리 */
export function percentOf(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 1000) / 10
}
