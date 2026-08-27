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
 * ── 디자인
 *   검은 원 배경 + 하늘색 구름. **SACLOUD 가 직접 그린 심볼**이고
 *   외부 저작물을 가져오지 않았다 (CLAUDE.md 3장 4번).
 *   실제 클랜마크와 한눈에 구분돼야 하고, 16px 에서도 형태가 남아야 해서
 *   구름은 원 세 개를 겹친 단순한 실루엣으로 그린다.
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
      {/* 구름 — 원 세 개 + 받침. 작은 크기에서도 뭉개지지 않게 굵게 잡았다 */}
      <g fill="#4FA9E8">
        <circle cx="12" cy="17.5" r="4.2" />
        <circle cx="16.5" cy="14.5" r="5.4" />
        <circle cx="21" cy="18" r="3.8" />
        <rect x="8" y="17.5" width="16" height="4.6" rx="2.3" />
      </g>
      {/* 살짝 밝은 하이라이트로 원 배경과 분리한다 */}
      <path
        d="M13.2 13.4a4.6 4.6 0 0 1 5.5-1.2"
        stroke="#9BD3F5"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
