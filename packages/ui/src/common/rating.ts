/**
 * 래더 점수 색 등급.
 *
 * 원본 실측 (2026-08-20) — 클래스명이 곧 구간 하한값이다.
 *
 * | 구간 | 원본 클래스 | 색 |
 * |---|---|---|
 * | 1600 미만 | (없음) | 기본 글자색 |
 * | 1600 이상 1800 미만 | `rating-1600` | #02ab18 |
 * | 1800 이상 2000 미만 | `rating-1800` | #2185d0 |
 * | 2000 이상 2500 미만 | `rating-2000` | #f2711c |
 * | 2500 이상 | `rating-2500` | #ff3d3d |
 *
 * 직접 확인한 것은 `3432점 → rating-2500` 한 건이다.
 * 나머지 경계는 클래스명에서 읽은 것이라 **경계 포함 여부는 `[미확인]`**.
 * 원본에는 티어 "이름"(브론즈/골드 등)이 없다. 색 등급만 있다 (CLAUDE.md 6장).
 */

export const RATING_THRESHOLDS = [1600, 1800, 2000, 2500] as const

export function ratingClass(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return ''
  if (rating >= 2500) return 'text-rating-2500'
  if (rating >= 2000) return 'text-rating-2000'
  if (rating >= 1800) return 'text-rating-1800'
  if (rating >= 1600) return 'text-rating-1600'
  return ''
}
