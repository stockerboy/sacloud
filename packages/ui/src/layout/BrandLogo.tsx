/**
 * 브랜드 로고.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 그렸다
 *   예전 로고는 3rd.supply 로고 박스(616×143.5 / 152×24)에 맞춘 껍데기였다.
 *   이제 원본 박스를 따라갈 이유가 없어 **글자 자체가 로고**가 되도록 바꿨다.
 *
 * ── 2026-09-01 오전: 워드마크가 `SACLOUD` → `3RD CLOUD` 가 됐다 (D-242)
 *   사이트 이름이 `3rd cloud` 로 바뀌었고 도메인이 `3rdcloud.my` 다.
 *
 * ── 2026-09-01 오후: **사용자가 로고를 확정했다. 구름 그림이 왔다**
 *   D-242 가 「`3RD` + 구름 그림 + `CLOUD`」로 적어 두고 비워 뒀던 자리가 채워졌다.
 *   확정본은 **왼쪽에 속이 빈 구름 한 덩이 + 오른쪽에 두 줄 글자**다.
 *
 *     구름   3RD
 *            CLOUD.my      ← `.my` 만 진홍, 나머지보다 작다
 *
 *   `variant="mark"` 가 그 로고이고 **기본값**이다.
 *
 *   ⚠ **옛 글자 로고를 지우지 않았다** (CLAUDE.md 10-4).
 *   `variant="wordmark"` 로 넘기면 2026-09-01 오전까지의 한 줄짜리 글자 로고를 그대로 그린다.
 *   그쪽은 `wordmark="sacloud"` 로 그 이전 이름(`SACLOUD`)까지 되돌릴 수 있다.
 *   `wordmark="sacloud"` 를 주면 그림 로고로는 그릴 수 없으므로 자동으로 글자 로고가 된다.
 *
 * ── 왜 글자를 `<text>` 가 아니라 path 로 그렸나
 *   확정본의 글자는 **아주 굵은 라틴 그로테스크**다. 우리 `--font-display`(Black Han Sans)는
 *   한글용이라 라틴 글자의 굵기·폭이 확정본과 다르고, 웹폰트가 늦게 오거나 못 오면
 *   **로고 모양이 그때그때 달라진다.** 로고는 그러면 안 된다.
 *   그래서 확정본 그림의 흰/빨강 영역 경계를 그대로 따서 path 로 굳혔다.
 *   덕분에 서체 로딩과 무관하게 항상 같은 모양이고, GNB 18~32px 에서도 뭉개지지 않는다.
 *   비트맵을 base64 로 박은 것이 **아니다** — 좌표는 전부 벡터다.
 *
 * ── 규칙
 *   - 색은 두 가지뿐이다. 구름·글자는 `currentColor`, `.my` 만 진홍(`--color-accent`)
 *   - `filter` · `box-shadow` 는 쓰지 않는다
 *   - 원본(3rd.supply) 이미지 자산은 쓰지 않는다 (CLAUDE.md 3장 4번)
 */

const DISPLAY_FONT = { fontFamily: 'var(--font-display)' } as const
const ACCENT = { fill: 'var(--color-accent, #d92b2b)' } as const

/**
 * 확정 로고의 좌표계.
 *
 * 사용자가 준 그림에서 잉크가 있는 사각형만 잘라 낸 값이다(1058×366px).
 * 폭:높이 = 2.885 — **옛 글자 로고(5.5)보다 좁다.** 같은 높이로 놓으면 GNB 가 오히려 덜 밀린다.
 */
const MARK_VIEWBOX = '0 0 1059 367'
const MARK_RATIO = 1059 / 367

/** 왼쪽 구름. 속이 빈 외곽선 한 붓이다 — 통짜 덩어리가 아니다 */
const CLOUD_PATH =
  'M355.3,0.3L386,0L412.2,3.6L347.2,22.2L315,35L289.7,47.7L270.6,59.6L248.2,77.2L230.7,96.7L216.7,117.7L204.3,147.3L199.8,167.8L199.6,177.4L202.1,179.9L227.2,190.8L240.8,200.2L246.8,207L198,202L179,203L154.6,206.6L123.1,216.1L95.6,230.6L74.2,248.2L62,266L57,285L59.2,295.8L66.8,307.2L84,318L100.4,323.6L152,331L288,338L338.2,342.8L357.8,347.2L371.2,352.8L382.8,362.2L384.6,366.2L104,366L77.6,362.4L57.1,356.9L32.8,345.2L17.2,332.8L8.7,321.3L2.4,306.6L0,290L1.7,277.7L8.1,259.1L16.6,244.6L38.2,220.2L64.9,200.9L97.1,185.1L126.7,176.7L157.8,172.8L167.3,130.3L175,110L183.7,93.7L205.2,64.2L221.2,49.2L236.6,37.6L264,22L291.3,11.3L323.7,3.7Z'

/** `3RD` / `CLOUD` 두 줄. `R`·`D`·`O`·`D` 의 속구멍은 같은 path 안의 반대 방향 고리다 */
const WORD_PATH =
  'M432,78L454,78L470,82L481,90L486,100L487,117L485,124L479,132L472,135L471,137L479,140L487,150L488,172L484,182L480,187L464,195L454,197L430,197L418,195L405,189L399,178L398,166L402,165L425,161L426,166L430,170L449,171L453,169L456,164L456,156L453,151L448,149L426,148L426,126L442,126L452,123L455,117L455,112L452,106L448,104L434,104L428,108L426,114L399,110L399,102L402,93L409,85L421,80ZM508,80L573,80L585,83L597,91L601,98L604,109L603,133L598,144L592,150L585,153L585,156L607,195L571,195L566,183L564,182L551,157L540,157L540,195L507,195ZM623,80L687,80L704,85L715,95L719,103L722,115L723,148L719,172L714,181L708,187L701,191L686,195L622,195ZM540,107L540,132L563,132L570,127L571,116L568,109L563,107ZM655,107L655,167L679,167L686,162L689,154L689,122L687,115L682,109L679,108ZM439,228L465,228L489,232L488,260L473,257L445,256L439,258L435,262L432,271L432,303L434,311L438,315L448,318L471,317L489,314L489,342L487,343L464,346L431,345L420,342L413,338L406,331L405,327L402,324L398,306L398,270L401,253L407,242L415,235L423,231ZM634,228L660,228L675,231L687,238L696,252L699,267L698,315L691,331L679,341L659,346L628,345L611,339L603,332L599,325L595,310L594,296L595,265L598,252L605,240L611,235L623,230ZM508,230L540,230L540,317L585,317L585,344L507,344ZM717,230L749,230L749,304L751,312L755,316L760,318L775,317L781,309L782,230L815,230L814,313L810,327L802,337L794,342L784,345L755,346L737,342L730,338L723,331L719,323L716,305ZM835,230L900,230L912,233L925,242L930,250L934,266L934,307L931,321L926,330L920,336L911,341L899,344L834,344ZM639,256L634,258L629,266L629,308L632,314L637,317L652,318L659,316L663,312L665,307L665,267L662,260L658,257ZM867,257L867,317L888,317L894,315L899,309L901,300L900,267L894,259L889,257Z'

/** `.my`. **진홍은 이것 하나뿐이다** */
const DOMAIN_PATH =
  'M965.7,304.3L972,305L973,306L972.3,307.3L973,308L975.7,305.7L980,304L987,304L991.7,306.3L994,309L1002,304L1010,304L1013.3,305.7L1015.3,307.7L1018,314L1017.7,343.7L1009,344L1008,343L1008,316L1006.7,313.3L1004,312L1001,312L997.7,313.7L995,317L994.7,343.7L987,344L986,343L986,317L984.3,313.7L982,312L978,312L974.7,313.7L973,317L972.7,343.7L965,344L963.7,343.3L964,306ZM1023.7,304.3L1030,304L1031.3,304.7L1034,311L1039,329L1040.3,330.7L1042,328L1049.3,305.3L1053,304L1057,304L1058.7,305.3L1043,351L1040.3,356.3L1037.3,359.3L1031,362L1025.7,361.3L1025,355L1032.3,352.3L1035,346L1035,342L1022,306ZM946,334L953.3,334.7L954,336L953.3,343.3L952,344L944.7,343.3L944,336Z'

/** 화면 글자와 같은 이름. 스크린리더가 읽는다 */
const MARK_LABEL = '3RD CLOUD.my'

/**
 * 어떤 워드마크를 그릴 것인가.
 *
 * `3rdcloud` 가 현재 이름(D-242), `sacloud` 는 2026-09-01 이전의 옛 이름이다.
 * 옛 것은 되돌릴 수 있게 남겨 둔다 (CLAUDE.md 10-4).
 */
export type BrandWordmark = '3rdcloud' | 'sacloud'

/**
 * 어떤 모양으로 그릴 것인가.
 *
 * - `mark`     확정 로고(구름 + 두 줄 글자). **기본값**
 * - `wordmark` 2026-09-01 오전까지 쓰던 한 줄 글자 로고. 되돌릴 수 있게 남겨 뒀다
 */
export type BrandLogoVariant = 'mark' | 'wordmark'

const WORDMARK_TEXT: Record<BrandWordmark, string> = {
  '3rdcloud': '3RD CLOUD',
  sacloud: 'SACLOUD',
}

/** 스크린리더가 읽는 이름. 화면 글자와 같아야 한다 */
const WORDMARK_LABEL: Record<BrandWordmark, string> = {
  '3rdcloud': '3RD CLOUD',
  sacloud: 'SACLOUD',
}

/**
 * 옛 이름을 달라고 하면 그림 로고로는 그릴 수 없다 — 확정본은 `3RD CLOUD.my` 하나뿐이다.
 * 그때는 말없이 글자 로고로 내려간다.
 */
function resolveVariant(variant: BrandLogoVariant | undefined, wordmark: BrandWordmark) {
  if (variant) return variant
  return wordmark === 'sacloud' ? 'wordmark' : 'mark'
}

/** 확정 로고 본체. 크기는 부모(className)가 정한다 */
function Mark({
  className,
  color,
  width,
  height,
}: {
  className?: string
  color?: string
  width?: number
  height?: number
}) {
  return (
    <svg
      className={className}
      viewBox={MARK_VIEWBOX}
      width={width}
      height={height}
      role="img"
      aria-label={MARK_LABEL}
      xmlns="http://www.w3.org/2000/svg"
      style={color ? { color } : undefined}
    >
      <g fill="currentColor">
        <path d={CLOUD_PATH} />
        <path d={WORD_PATH} />
      </g>
      {/* 진홍은 이 두 글자뿐이다 */}
      <path d={DOMAIN_PATH} style={ACCENT} />
    </svg>
  )
}

/**
 * 홈 히어로의 큰 로고. 색은 부모의 `color` 를 따른다.
 *
 * 높이를 주고 폭은 `w-auto` 로 두는 것을 전제로 한다 — `viewBox` 비율이 폭을 정한다.
 */
export function MainLogo({
  className,
  wordmark = '3rdcloud',
  variant,
}: {
  className?: string
  wordmark?: BrandWordmark
  variant?: BrandLogoVariant
}) {
  if (resolveVariant(variant, wordmark) === 'mark') {
    return <Mark className={className} />
  }

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

/**
 * GNB · 인증 카드의 작은 로고.
 *
 * ⚠ **두 줄짜리 로고라 높이를 너무 낮추면 글자가 안 읽힌다.**
 *   `3RD` 의 글자 높이는 로고 전체 높이의 32% 다. 로고를 18px 로 놓으면 글자가 5.8px 이 된다.
 *   그래서 GNB 는 32px 로 쓴다(글자 약 10px, 64px 짜리 머리띠에 여유 있게 들어간다).
 *   그 높이에서도 폭은 92px 로 **옛 글자 로고(18px 일 때 99px)보다 좁다** — GNB 가 밀리지 않는다.
 */
export function NavLogo({
  className,
  /** 밝은 배경(인증 카드 등)에서는 글자를 어둡게 그린다 */
  tone = 'light',
  wordmark = '3rdcloud',
  variant,
}: {
  className?: string
  tone?: 'light' | 'dark'
  wordmark?: BrandWordmark
  variant?: BrandLogoVariant
}) {
  const ink =
    tone === 'dark' ? 'var(--color-ink, #060505)' : 'var(--color-text-strong, #f6eded)'

  if (resolveVariant(variant, wordmark) === 'mark') {
    /* className 이 안 먹더라도 박스가 터지지 않게 기본 크기를 준다 (32px 높이 기준) */
    return (
      <Mark
        className={className}
        color={ink}
        height={32}
        width={Math.round(32 * MARK_RATIO)}
      />
    )
  }

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
        style={{ ...DISPLAY_FONT, fill: ink }}
      >
        {WORDMARK_TEXT[wordmark]}
      </text>
      <rect x="120" y="12" width="6" height="6" style={ACCENT} />
    </svg>
  )
}
