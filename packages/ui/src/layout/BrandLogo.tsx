/**
 * 로고.
 *
 * 원본의 로고 이미지(`assets/images/main_logo.png`, `nav_logo.png`)는 가져오지 않는다
 * (CLAUDE.md 3장 4번 — 원본 자산 복사 금지). **박스 크기와 배치만** 원본과 맞추고
 * 그림 자체는 우리 것으로 새로 그렸다.
 *
 * 원본 실측 박스
 * - 홈(main): 616 × 143.5 (CSS `width: 44rem`, 이미지 비율로 높이 결정)
 * - GNB(nav): 152 × 24   (CSS `max-height: 1.75rem`)
 */

export function MainLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 616 143.5"
      role="img"
      aria-label="SACLOUD"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="118" width="616" height="10" fill="#e02020" />
      <text
        x="308"
        y="96"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="96"
        fontWeight="700"
        letterSpacing="6"
      >
        SACLOUD
      </text>
    </svg>
  )
}

export function NavLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 152 24"
      width={152}
      height={24}
      role="img"
      aria-label="SACLOUD"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="4" width="4" height="16" fill="#e02020" />
      <text
        x="12"
        y="18"
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="1.5"
      >
        SACLOUD
      </text>
    </svg>
  )
}
