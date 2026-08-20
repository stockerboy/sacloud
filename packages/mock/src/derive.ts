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

/** 킬뎃 — 소수점 2자리. 데스가 0이면 킬 수를 그대로 쓴다. */
export function kdRate(kill: number, death: number): number {
  if (death === 0) return Math.round(kill * 100) / 100
  return Math.round((kill / death) * 100) / 100
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
