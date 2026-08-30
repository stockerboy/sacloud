/**
 * 로딩 자리표시.
 *
 * 첫 프레임의 공백을 메우기 위한 **구현상의 장치**다.
 * Phase 10(SSR)에서 서버 렌더로 바뀌면 대부분 사라진다.
 *
 * `적진` 톤 — 회색 블록이 번쩍이면 검은 화면에서 그것만 튄다.
 * 카드보다 한 단 올린 면(`bg-card-2`)으로 낮추고, 각지게 둔다.
 * 구조와 props 는 그대로다 (겉만 바꿨다).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse rounded-[2px] bg-card-2 ${className ?? ''}`} />
  )
}
