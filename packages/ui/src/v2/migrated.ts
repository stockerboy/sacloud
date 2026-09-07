/**
 * ★★어느 화면까지 v2 로 옮겼나★★ (2026-09-07 · Part 10 ④~ · 사장님 승인)
 *
 * ── 왜 목록인가
 *   사장님 지시는 ★한 번에 한 화면★ 이다. 그런데 껍데기(바탕색 · 푸터)는 모든 화면이
 *   공유한다. 그래서 «지금 이 주소가 옮겨진 화면인가» 를 ★한 곳★ 에서 판단하고,
 *   맞을 때만 셸에 `.sac-v2` 를 두른다.
 *
 * ── 무슨 일이 일어나나
 *   `.sac-v2` 안에서는 옛 토큰(`--color-page` …)이 v2 값으로 바뀐다 (`tokens.css` 「다리」).
 *   ★조각 코드는 한 줄도 안 고친다.★ 옮기지 않은 화면은 한 픽셀도 안 바뀐다.
 *
 * ── 화면을 하나 끝낼 때마다 여기 한 줄을 더한다
 *   되돌리려면 그 줄만 빼면 된다. 코드를 되돌릴 필요가 없다.
 */

/** 정확히 이 주소일 때 */
const EXACT: readonly string[] = [
  /* ④ 홈 (2026-09-07) */
  '/',
]

/**
 * slug 가 끼는 주소는 정규식으로 (`/league/<slug>/rank/player` …).
 *
 * ⚠ ★검증을 통과한 화면만 여기 올린다.★ 미리 적어 두면 아직 안 본 화면이
 *   색만 바뀐 채로 나간다 — 그게 「검증 안 된 화면을 민다」는 뜻이다.
 */
const PATTERNS: readonly RegExp[] = [
  /* ⑤ 개인 랭킹 (2026-09-07) */
  /^\/league\/[^/]+\/rank\/player$/,
]

/** 이 주소가 v2 로 옮겨진 화면인가 */
export function isV2Route(pathname: string): boolean {
  if (EXACT.includes(pathname)) return true
  return PATTERNS.some((pattern) => pattern.test(pathname))
}
