/**
 * 배지 (`공식` 등).
 *
 * `적진` 톤 — 알약(rounded-full) 을 버리고 **각진 칩**으로 바꿨다. 이 시안은 둥글지 않다.
 * 면을 채우는 대신 1px 선으로 세우고, 앞의 작은 점 하나만 진홍이다.
 * 점은 계속 원형이다 — 이 화면에서 유일하게 허용된 곡선이고, 크기가 4px 라 각지게 그리면 뭉갠다.
 *
 * 구조·props·클래스 토큰(`bg-badge` · `bg-badge-dot`)은 그대로 쓴다 (겉만 바꿨다).
 */
export function Label({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex select-none items-center rounded-[2px] border border-line bg-badge px-2 py-0.5 text-xs tracking-wide text-text-strong ${className ?? ''}`}
    >
      <span className="mr-1.5 inline-block h-1 w-1 rounded-full bg-badge-dot" />
      {name}
    </span>
  )
}
