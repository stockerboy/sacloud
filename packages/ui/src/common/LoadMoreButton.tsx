'use client'

/**
 * `더 불러오기` — 커서 페이지네이션 전용. 페이지 번호는 없다.
 *
 * 원본 실측 구조
 * ```
 * <div class="mt-2">
 *   <div class="flex justify-center items-center py-3 bg-indigo-500 text-white cursor-pointer">
 *     더 불러오기
 * ```
 * 다음 커서가 없으면 아예 렌더되지 않는다.
 */
export function LoadMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void
  loading?: boolean
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className="flex w-full cursor-pointer items-center justify-center bg-more py-3 text-white disabled:opacity-60"
      >
        더 불러오기
      </button>
    </div>
  )
}
