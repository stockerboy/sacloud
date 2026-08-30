/**
 * 브랜드 로고.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 그렸다
 *   예전 로고는 3rd.supply 로고 박스(616×143.5 / 152×24)에 맞춘 껍데기였다.
 *   이제 원본 박스를 따라갈 이유가 없어 **글자 자체가 로고**가 되도록 바꿨다.
 *
 * ── 규칙
 *   - 글자는 `--font-display`(Black Han Sans). 브랜드는 큰 제목에 해당한다
 *   - 색은 글자 하나 + 마침점 하나뿐이다. 진홍은 **점 하나에만** 쓴다
 *   - `textLength` 로 폭을 못박는다. 서체가 늦게 오거나 못 오더라도 박스를 넘지 않는다
 *   - 원본 이미지 자산은 쓰지 않는다 (CLAUDE.md 3장 4번)
 */

const DISPLAY_FONT = { fontFamily: 'var(--font-display)' } as const
const ACCENT = { fill: 'var(--color-accent, #d92b2b)' } as const

/** 홈 히어로의 큰 로고. 색은 부모의 `color` 를 따른다 */
export function MainLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 100"
      role="img"
      aria-label="SACLOUD"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="76"
        textLength="512"
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
        fontSize="80"
        style={DISPLAY_FONT}
      >
        SACLOUD
      </text>
      {/* 진홍은 이 점 하나뿐이다 */}
      <rect x="528" y="62" width="14" height="14" style={ACCENT} />
    </svg>
  )
}

/** GNB · 인증 카드의 작은 로고 */
export function NavLogo({
  className,
  /** 밝은 배경(인증 카드 등)에서는 글자를 어둡게 그린다 */
  tone = 'light',
}: {
  className?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 132 24"
      width={132}
      height={24}
      role="img"
      aria-label="SACLOUD"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="19"
        textLength="112"
        lengthAdjust="spacingAndGlyphs"
        fontSize="19"
        style={{
          ...DISPLAY_FONT,
          fill:
            tone === 'dark' ? 'var(--color-ink, #060505)' : 'var(--color-text-strong, #f6eded)',
        }}
      >
        SACLOUD
      </text>
      <rect x="120" y="12" width="6" height="6" style={ACCENT} />
    </svg>
  )
}
