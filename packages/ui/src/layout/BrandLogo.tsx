/**
 * 브랜드 로고.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 그렸다
 *   예전 로고는 3rd.supply 로고 박스(616×143.5 / 152×24)에 맞춘 껍데기였다.
 *   이제 원본 박스를 따라갈 이유가 없어 **글자 자체가 로고**가 되도록 바꿨다.
 *
 * ── 2026-09-01: 워드마크가 `SACLOUD` → `3RD CLOUD` 가 됐다 (D-242)
 *   사이트 이름이 `3rd cloud` 로 바뀌었고 도메인이 `3rd.cloud` 다.
 *   로고·큰 제목에서는 **대문자 `3RD CLOUD`**, 문장 속에서는 `3rd cloud` 로 쓴다.
 *
 *   ⚠ **구름 그림은 아직 없다.** D-242 는 로고를 「`3RD` + 구름 그림 + `CLOUD`」로 적어
 *   두었지만 그 그림이 아직 나오지 않았다. 없는 것을 지어내지 않는다(CLAUDE.md 3장 7번) —
 *   지금은 **글자만** 그리고 두 낱말 사이는 그냥 띄어 둔다. 그림이 나오면 그 자리에 넣는다.
 *
 *   ⚠ **옛 워드마크(`SACLOUD`)를 지우지 않았다** (CLAUDE.md 10-4).
 *   `wordmark="sacloud"` 로 넘기면 예전 그대로 그린다. 기본값만 새 것으로 바꿨다.
 *
 * ── 규칙
 *   - 글자는 `--font-display`(Black Han Sans). 브랜드는 큰 제목에 해당한다
 *   - 색은 글자 하나 + 마침점 하나뿐이다. 진홍은 **점 하나에만** 쓴다
 *   - `textLength` 로 폭을 못박는다. 서체가 늦게 오거나 못 오더라도 박스를 넘지 않는다.
 *     그래서 워드마크 글자 수가 늘어도 **박스 크기는 그대로**다 — GNB 가 밀리지 않는다
 *   - 원본 이미지 자산은 쓰지 않는다 (CLAUDE.md 3장 4번)
 */

const DISPLAY_FONT = { fontFamily: 'var(--font-display)' } as const
const ACCENT = { fill: 'var(--color-accent, #d92b2b)' } as const

/**
 * 어떤 워드마크를 그릴 것인가.
 *
 * `3rdcloud` 가 현재 이름(D-242), `sacloud` 는 2026-09-01 이전의 옛 이름이다.
 * 옛 것은 되돌릴 수 있게 남겨 둔다 (CLAUDE.md 10-4).
 */
export type BrandWordmark = '3rdcloud' | 'sacloud'

const WORDMARK_TEXT: Record<BrandWordmark, string> = {
  '3rdcloud': '3RD CLOUD',
  sacloud: 'SACLOUD',
}

/** 스크린리더가 읽는 이름. 화면 글자와 같아야 한다 */
const WORDMARK_LABEL: Record<BrandWordmark, string> = {
  '3rdcloud': '3RD CLOUD',
  sacloud: 'SACLOUD',
}

/** 홈 히어로의 큰 로고. 색은 부모의 `color` 를 따른다 */
export function MainLogo({
  className,
  wordmark = '3rdcloud',
}: {
  className?: string
  wordmark?: BrandWordmark
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 100"
      role="img"
      aria-label={WORDMARK_LABEL[wordmark]}
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
        {WORDMARK_TEXT[wordmark]}
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
  wordmark = '3rdcloud',
}: {
  className?: string
  tone?: 'light' | 'dark'
  wordmark?: BrandWordmark
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 132 24"
      width={132}
      height={24}
      role="img"
      aria-label={WORDMARK_LABEL[wordmark]}
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
        {WORDMARK_TEXT[wordmark]}
      </text>
      <rect x="120" y="12" width="6" height="6" style={ACCENT} />
    </svg>
  )
}
