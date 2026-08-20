/**
 * 404 화면.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="flex justify-center items-center mt-5">
 *   <div class="text-center mt-20">          위 여백 5rem
 *     <img class="w-96">                     24rem(336px) · 16:9
 *     <div class="text-3xl font-semibold">페이지를 찾을 수 없습니다.</div>
 * ```
 * 일러스트는 원본 이미지를 가져오지 않고 같은 크기로 새로 그렸다 (CLAUDE.md 3장 4번).
 */
export function NotFoundView() {
  return (
    <div className="mt-5 flex items-center justify-center">
      <div className="mt-20 text-center">
        <NotFoundArt className="w-notfound" />
        <div className="text-3xl font-semibold">페이지를 찾을 수 없습니다.</div>
      </div>
    </div>
  )
}

function NotFoundArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 336 189"
      role="img"
      aria-label="404"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="168"
        y="126"
        textAnchor="middle"
        fill="#d4d4d4"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="110"
        fontWeight="700"
        letterSpacing="8"
      >
        404
      </text>
    </svg>
  )
}
