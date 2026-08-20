/**
 * 배지 (`공식` 등).
 *
 * 원본 실측 구조
 * ```
 * <div class="inline-flex items-center px-2 py-1 rounded-full text-sm select-none
 *             bg-coolGray-800 text-white mr-2">
 *   <div class="rounded-full mr-… bg-yellow-500"></div>   ← 앞의 작은 점
 *   공식
 * ```
 * 실측: 배경 #1F2937 / 글자 흰색 / 12.25px / padding 3.5px 7px / 완전 둥근 모서리 / 점 #F59E0B
 */
export function Label({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex select-none items-center rounded-full bg-badge px-2 py-1 text-sm text-white ${className ?? ''}`}
    >
      <span className="mr-1 inline-block h-2 w-2 rounded-full bg-badge-dot" />
      {name}
    </span>
  )
}
