/**
 * 미등록·외부 클랜용 공통 마크 (D-146).
 *
 * ── 왜 필요한가
 *   SACLOUD 공식 1/2부 등록 클랜만 **실제 클랜마크**를 쓴다.
 *   외부 클랜의 emblem 을 우리 화면에 그리면 그 클랜이 SACLOUD 에 등록된 것처럼 보인다.
 *   그래서 등록 클랜이 아니면 전부 이 중립 마크로 대체한다.
 *   외부 클랜 · 미등록 클랜 · 무소속 · 소속을 모르는 경우가 전부 여기로 온다.
 *
 * ── 언제 이 마크가 나오는지는 여기서 정하지 않는다
 *   판정은 `clanMarkPolicy.ts` 의 `clanMarkView` 하나가 한다.
 *   호출부마다 조건을 따로 쓰다가 무소속 선수 옆에 마크가 통째로 빠졌던 적이 있다.
 *
 * ── 디자인 (2026-08-28 사용자 지시)
 *   검은 원 배경 + **빨간 구름 윤곽선**. 안을 채우지 않고 **테두리로만** 그린다.
 *   **SACLOUD 가 직접 그린 심볼**이고 외부 저작물을 가져오지 않았다 (CLAUDE.md 3장 4번).
 *
 *   예전에는 하늘색으로 속을 채운 실루엣이었다. 사용자가 색과 형태를 지정해 바꿨다 —
 *   "빨간 구름모양 테두리, 테두리 안까지 빨간색으로 채우지 마라. 그냥 테두리로만 그려라".
 *
 *   실루엣이 아니라 윤곽선이라 작은 크기에서 선이 사라지기 쉽다. 그래서
 *   원 세 개를 겹친 단순한 형태를 **하나의 외곽 경로**로 그리고 선을 굵게 잡았다.
 *   `vector-effect` 를 쓰지 않는다 — 뷰박스가 고정이라 확대해도 선 굵기가 비율을 지킨다.
 *
 * 이미지가 아니라 인라인 SVG 다 — 네트워크 요청이 없고 깨진 이미지 아이콘이 뜨지 않는다.
 */

export interface FallbackClanMarkProps {
  className?: string
  /** 접근성 라벨. 목록에서 반복될 때는 빈 문자열로 둔다 */
  alt?: string
}

export function FallbackClanMark({ className, alt = '' }: FallbackClanMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role={alt ? 'img' : 'presentation'}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <circle cx="16" cy="16" r="16" fill="#141414" />
      {/*
        구름 윤곽선 하나. 왼쪽 아래에서 시작해 작은 봉우리 → 큰 봉우리 → 오른쪽 봉우리를
        지나 밑변으로 닫는다. `fill="none"` 이라 **안이 비어 있다** — 지시대로 테두리뿐이다.
      */}
      <path
        d="M9.4 21.6
           a4.4 4.4 0 0 1 0.5 -8.7
           a5.9 5.9 0 0 1 11.1 -1.4
           a4.1 4.1 0 0 1 1.6 10.1
           Z"
        fill="none"
        stroke="#E23A3A"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
