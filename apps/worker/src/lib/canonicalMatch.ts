/**
 * ★★한 실제 경기 = 활성 Match 정확히 1개★★ (2026-09-05 · Part 3 ③단계).
 *
 * > 사장님: «신규 Match는 ★코드 방어 + DB unique 방어 두 겹★»
 *
 * ── ★두 겹이 각각 무엇을 막나★
 * ```
 * 1차 (여기)  ★만들기 전에 찾아본다★ — 이미 있으면 안 만들고 「이미 있다」고 센다
 *             → 흔한 경우(다시 돌리기·이어받기)를 ★조용히★ 넘긴다
 * 2차 (DB)   Match_new_sourceMatchId_key (partial unique)
 *             → ★찾기와 만들기 사이의 틈★ 을 막는다. 코드로는 못 없애는 틈이다
 * ```
 *   ⚠ ★1차만 두면 안 된다.★ 두 판이 같은 순간에 찾으면 둘 다 「없다」를 본다.
 *   ⚠ ★2차만 두면 안 된다.★ 그러면 평범한 재실행이 예외로 터진다.
 *
 * ── ★기준시각 이후만 이 규칙을 쓴다★
 *   그 이전에는 ★한 경기가 여러 리그에 있는 것이 정상★ 이었다 (D-155 · 34,862건).
 *   사장님이 「동결」이라 하셨다. 이 파일은 신규 구간만 판단한다.
 *
 * ── ★순수 함수다★
 *   DB 를 안 본다. 「이미 있는 경기키 집합」을 ★받아서★ 판단만 한다.
 *   찾아오는 일은 부르는 쪽(투영 잡)의 몫이다.
 */
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'

/** 신규 규칙이 걸리는 시각. ★동결 기준시각과 같은 값이다★ (2026-09-03 07:00 KST) */
export const CANONICAL_FROM = MIRROR_FREEZE_FROM

export type CanonicalDecision =
  /** 만든다 */
  | { action: 'create' }
  /** 이미 있다 — 만들지 않는다. 흔한 일이고 고장이 아니다 */
  | { action: 'exists'; existingMatchId: string }
  /** 기준시각 이전이다 — 이 규칙 밖이다 */
  | { action: 'out_of_scope'; reason: string }

/**
 * 이 경기를 만들어도 되는가.
 *
 * @param startAt 경기 시각
 * @param matchKey 넥슨 18자리 경기 번호
 * @param liveByKey ★살아 있는(숨김 아닌)★ 경기키 → Match.id
 */
export function decideCanonical(
  startAt: Date,
  matchKey: string,
  liveByKey: ReadonlyMap<string, string>,
): CanonicalDecision {
  if (startAt.getTime() < CANONICAL_FROM.getTime()) {
    return {
      action: 'out_of_scope',
      reason: `기준시각(${CANONICAL_FROM.toISOString()}) 이전이다 — 과거는 동결이다`,
    }
  }
  const existing = liveByKey.get(matchKey)
  if (existing !== undefined) return { action: 'exists', existingMatchId: existing }
  return { action: 'create' }
}

/**
 * ★DB 가 「이미 있다」고 튕긴 것인가★ — 경쟁에서 진 것이지 고장이 아니다.
 *
 * 2차 방어가 걸렸을 때 잡 전체를 죽이면 안 된다. ★그 한 건만 「이미 있다」로 세고 넘어간다.★
 *
 * ⚠ ★어떤 유니크 위반이든 삼키지 마라.★ 우리가 아는 두 자물쇠일 때만 넘긴다 —
 *   그 밖의 유니크 위반은 ★우리가 모르는 문제★ 이므로 그대로 터뜨린다.
 */
export function isDuplicateMatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (!/unique/i.test(message) && !/P2002/.test(message)) return false
  return (
    message.includes('Match_new_sourceMatchId_key') ||
    message.includes('sourceMatchId') ||
    /leagueId.*origin.*sourceMatchId/s.test(message)
  )
}
