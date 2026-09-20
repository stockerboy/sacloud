/**
 * ★★따봉 · 역따봉★★ (2026-09-20 사장님)
 *
 * > 「좋아요 싫어요 따봉 역따봉으로 디자인 해줘」
 *
 * ── 왜 바꿨나
 *   옛 판은 ★삼각형 ▲▼★ 이었다. 「위/아래」 라는 뜻만 있고
 *   ★좋다·싫다가 안 읽힌다.★ 엄지는 설명이 필요 없다.
 *
 * ── ⚠ 역따봉은 ★같은 그림을 뒤집는다★
 *   따로 그리면 두 그림의 굵기·비례가 어긋나 ★한쪽만 커 보인다.★
 *   180도 돌리면 언제나 같은 무게다.
 *
 * ⚠ 목록·글상세·댓글이 ★같은 부품★ 을 쓴다. 세 군데에 따로 그려 두면
 *   한 곳만 고쳐지고 나머지가 남는다 (실제로 ▲ 가 세 군데 흩어져 있었다).
 */
export function ThumbIcon({
  up,
  size = 14,
  className,
}: {
  up: boolean
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden
      style={{ transform: up ? undefined : 'rotate(180deg)', flex: 'none' }}
    >
      <path d="M2 21h3.2V9.6H2V21zm20-10.2c0-1-.8-1.8-1.8-1.8h-5.6l.85-4.1.03-.3c0-.37-.16-.72-.4-.97L14.1 2.7 7.9 8.9c-.33.33-.53.78-.53 1.28v8.9c0 1 .8 1.8 1.8 1.8h8.1c.74 0 1.38-.45 1.65-1.1l2.72-6.35c.08-.2.13-.42.13-.65v-1.98z" />
    </svg>
  )
}
