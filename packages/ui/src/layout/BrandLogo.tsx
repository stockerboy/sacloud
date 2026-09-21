/**
 * 브랜드 로고.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ ★★되돌리는 법 — 아래 `DEFAULT_VARIANT` 를 `'mark'` 로 바꾸면 끝이다★★      ║
 * ║   (2026-09-16 이전의 벡터 로고로 완전히 돌아간다. 파일은 하나도 안 지웠다) ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── ★2026-09-16: 사장님이 그림 로고를 주셨다★ («사이트 배경이랑 로고 이걸로 바꿔봐»)
 *   빨간 `Log` 글자 셋이 달려가고, 구름 위에 `SA CLOUD` 가 얹힌 그림이다.
 *   `variant="art"` 가 그 로고이고 **지금의 기본값**이다 (`DEFAULT_VARIANT`).
 *
 *   ⚠ 사장님이 주신 PNG 는 **투명이 아니었다** — 투명을 흉내 낸 ★체커보드가 그림에
 *     구워져★ 있었다(1536×1024 · 알파 없음). 그래서 테두리에서 flood fill 로
 *     체커를 벗겨 내고(70.5%) 티끌을 지운 뒤 잘라, `apps/web/public/brand/` 에
 *     webp 로 넣었다. 원본 PNG 1682KB → **webp 50KB**.
 *
 *   ⚠ ★옛 벡터 로고(`mark` · `wordmark`)는 한 줄도 안 지웠다★ (`CLAUDE.md` 1-4).
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 그렸다
 *   예전 로고는 3rd.supply 로고 박스(616×143.5 / 152×24)에 맞춘 껍데기였다.
 *   이제 원본 박스를 따라갈 이유가 없어 **글자 자체가 로고**가 되도록 바꿨다.
 *
 * ── 2026-09-01 오전: 워드마크가 `SACLOUD` → `3RD CLOUD` 가 됐다 (D-242)
 *   사이트 이름이 `log in SA CLOUD` 로 바뀌었고 도메인이 `3rdcloud.my` 다.
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

/* ══════════════════════════════════════════════════════════════════════════
   ★2026-09-17 — 상단바 로고를 세 가지 색으로 다시 그렸다 (`variant="tri"`)★

   사장님: «이 사진에서 상단 바 로고도 글자에 빨간색(SA) 파란색(CLOUD)
           구름은 흰색 채워서 가면 될거같고»

   ── 왜 그림(webp)이 아니라 코드인가
     PNG/WebP 는 ★색을 못 바꾼다.★ 그리고 그림 로고(`art`)는 폰 상단바(24~34px)로
     줄면 구름 속 `SA CLOUD` 글자가 4px 남짓이 되어 ★흐릿하게 뭉개졌다★ —
     사장님이 본 그 화면이다. 그래서 상단바용은 벡터로 새로 그린다.

   ── 무엇을 그리는가
     왼쪽에 ★흰 구름★(원 셋 + 둥근 띠로 만든 실루엣), 오른쪽에 한 줄로
     `SA`(빨강) `CLOUD`(파랑). ★원본 그림을 베끼지 않았다★ (`CLAUDE.md` 2장 4번) —
     달리는 `Log` 글자·노트북은 넣지 않았고 구름은 좌표를 새로 잡았다.

   ── 색은 프로젝트 토큰을 쓴다
     빨강 `--v2-red`(#e01b24) · 파랑 `--v2-blue`(#5b8dff). 둘 다 `.sac-v2` 안에서만
     살아 있어서 ★바깥(옛 `SiteHeader` · `AuthCard`)을 위해 대체값을 같이 적는다.★
     `--color-accent` 는 쓰지 않는다 — 리그마다 갈아끼워지는 색이라 SPL 에서는
     빨강, IPL 에서는 파랑이 되어 ★로고 색이 화면마다 달라진다.★

   ── 되돌리는 법
     아래 `NAV_VARIANT` 를 `'art'` 로 바꾸면 2026-09-16 의 그림 로고로 돌아간다.
     그림 파일도 `art`/`mark`/`wordmark` 코드도 ★한 줄도 안 지웠다★ (`CLAUDE.md` 1-4).
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 글자 굵기는 ★웹폰트에 맡기지 않는다.★
 * `--font-display`(Black Han Sans)는 한글용이라 라틴 글자 폭이 그때그때 다르고,
 * 늦게 오면 로고가 한 번 출렁인다. 그래서 굵은 시스템 스택을 쓰고,
 * 폭은 아래 `textLength` 로 못 박는다 — ★어떤 서체가 잡혀도 자리 폭은 같다.★
 */
const TRI_FONT = {
  fontFamily: '"Arial Black", "Arial Bold", "Segoe UI", system-ui, sans-serif',
  fontWeight: 900,
  letterSpacing: '0',
} as const

/** 구름 = 흰색. 상단바 바탕이 어두우므로 통짜 흰색이 가장 또렷하다 */
const TRI_CLOUD = '#ffffff'
/** `SA` = 빨강. `.sac-v2` 밖에서도 보이게 대체값을 같이 준다 */
const TRI_RED = 'var(--v2-red, #e23b3b)'
/** `CLOUD` = 파랑 */
const TRI_BLUE = 'var(--v2-blue, #5b8dff)'

/**
 * 좌표계 404×100.
 *
 * 구름이 x 18~122, 글자가 x 136~396 을 쓴다. 비율 4.04 —
 * 상단바 34px 에서 폭 137px 이라 ★옛 그림 로고(61px 폭 · 34px)보다 넓지만
 * 글자가 읽힌다.★ 폰(28px)에서는 113px 이고 68px 머리띠 안에 여유 있게 들어간다.
 */
const TRI_VIEWBOX = '0 0 404 100'
const TRI_RATIO = 404 / 100
const TRI_LABEL = 'SA CLOUD'

/** 상단바용 세 색 로고 본체. 크기는 부모(className 또는 height)가 정한다 */
function TriMark({
  className,
  width,
  height,
}: {
  className?: string
  width?: number
  height?: number
}) {
  return (
    <svg
      className={className}
      viewBox={TRI_VIEWBOX}
      width={width}
      height={height}
      role="img"
      aria-label={TRI_LABEL}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/*
        구름 — 원 셋과 둥근 띠 하나를 겹쳐 실루엣을 만든다.
        path 한 붓으로 그리지 않은 이유: ★같은 색으로 겹치면 경계가 사라진다★ —
        좌표를 손으로 고치기 쉬워 나중에 모양을 다듬을 때 편하다.
      */}
      <g fill={TRI_CLOUD}>
        <circle cx="40" cy="58" r="22" />
        <circle cx="72" cy="41" r="28" />
        <circle cx="102" cy="60" r="20" />
        <rect x="30" y="58" width="80" height="24" rx="12" />
      </g>
      {/*
        `textLength` + `lengthAdjust` 로 폭을 못 박는다.
        서체가 바뀌어도 `SA` 는 항상 72, `CLOUD` 는 항상 176 을 차지한다.
      */}
      <text
        x="136"
        y="69"
        textLength="72"
        lengthAdjust="spacingAndGlyphs"
        fontSize="58"
        fill={TRI_RED}
        style={TRI_FONT}
      >
        SA
      </text>
      <text
        x="220"
        y="69"
        textLength="176"
        lengthAdjust="spacingAndGlyphs"
        fontSize="58"
        fill={TRI_BLUE}
        style={TRI_FONT}
      >
        CLOUD
      </text>
    </svg>
  )
}

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
 * - `tri`      2026-09-17 세 색 벡터 로고(흰 구름 + 빨강 `SA` + 파랑 `CLOUD`).
 *              **상단바의 지금 기본값** (`NAV_VARIANT`)
 * - `art`      2026-09-16 사장님이 주신 그림 로고. **홈 큰 로고의 기본값** (`DEFAULT_VARIANT`)
 * - `mark`     2026-09-01 ~ 09-15 의 벡터 로고(구름 + 두 줄 글자). 안 지웠다
 * - `wordmark` 2026-09-01 오전까지 쓰던 한 줄 글자 로고. 안 지웠다
 */
export type BrandLogoVariant = 'cat' | 'tri' | 'art' | 'mark' | 'wordmark'

/**
 * ★★되돌리는 스위치 — 이 한 줄★★
 *
 * `'art'` → `'mark'` 로 바꾸면 사이트 전체 로고가 2026-09-15 모습으로 돌아간다.
 * `variant` 를 직접 넘긴 호출은 이 값을 무시한다 (그런 호출은 지금 없다).
 */
/*
 * ⚠ ★2026-09-18 — 사장님이 새 로고를 주셨다★:
 *   「우리 사이트 대문 로고랑 다른 로고들 이걸로 다 바꿔줘」
 *
 *   구름 위에 고양이가 올라앉은 ★SA CLOUD★ 그림이다. 옛 값 `'art'` 는
 *   그대로 살아 있다 (`CLAUDE.md` 1-4) — 이 한 줄을 되돌리면 옛 로고로 돌아간다.
 */
const DEFAULT_VARIANT: BrandLogoVariant = 'cat'

/**
 * ★★상단바만 따로 도는 스위치★★ (2026-09-17)
 *
 * `'tri'` → `'art'` 로 바꾸면 상단바 로고가 2026-09-16 의 그림 로고로 돌아간다.
 *
 * ⚠ ★`DEFAULT_VARIANT` 와 일부러 갈라 놓았다.★ 홈 한가운데의 큰 로고(`MainLogo`)는
 *   110px 이라 그림이 또렷하게 보이고 ★다른 사람이 지금 손대는 중★ 이다.
 *   한 스위치로 묶으면 상단바를 고치면서 홈 히어로까지 같이 바뀐다.
 */
/*
 * ⚠ ★2026-09-18 — 상단바도 새 로고로★ (사장님: 「대문 로고랑 ★다른 로고들★ 이걸로 다 바꿔줘」).
 *   옛 값 `'tri'`(직접 그린 세 색 로고)는 그대로 살아 있다 (`CLAUDE.md` 1-4).
 */
const NAV_VARIANT: BrandLogoVariant = 'cat'

/**
 * 그림 로고의 크기.
 *
 * `apps/web/public/brand/sa-cloud-logo.webp` — 640×354 · 50KB.
 * 체커를 벗기고 잘라 낸 잉크 상자가 1360×752 였고, 그 비율(1.808)을 그대로 줄인 값이다.
 * 사장님 원본 PNG(`1536×1024`)의 비율(1.5)이 아니다 — 원본은 투명 여백을 포함한 값이다.
 */
const ART_SRC = '/brand/sa-cloud-logo.webp'
const ART_W = 640
const ART_H = 354

/**
 * ★2026-09-18 사장님 로고★ — 구름에 올라앉은 고양이 + `SA CLOUD`.
 *
 * ── 왜 두 장인가
 *   `CLOUD` 글자가 ★속이 빈 테두리 글자★ 다. 원본은 흰 바탕에 ★어두운★ 테두리라
 *   어두운 배경에 얹으면 ★그 다섯 글자가 통째로 사라진다.★ 그래서 어두운 배경용으로
 *   ★그 획만★ 밝게 칠한 판을 따로 만들었다. 고양이 눈·코는 ★어두운 채로 뒀다★ —
 *   같이 밝게 하면 얼굴이 지워진다 (실제로 한 번 그렇게 만들어 봤다).
 *
 * ── 어떻게 만들었나 (되만들 일이 있을 때를 위해)
 *   ```
 *   ① 가장자리에서 흰색을 타고 들어가 ★바깥 바탕★ 만 투명하게 (floodfill)
 *   ② 구름 속 · 고양이 몸 · 두 발에 ★씨앗★ 을 주어 그 흰색만 남긴다
 *      — 씨앗을 안 준 흰색(= CLOUD 글자 속)은 저절로 투명해진다
 *   ③ y ≥ 448 아래의 어두운 획만 밝게 (고양이 어두운 선은 y 449 위에서 끝난다 · 실측)
 *   ```
 */
const CAT_SRC_DARK = '/brand/mark-dark.webp'
const CAT_SRC_LIGHT = '/brand/mark-light.webp'
const CAT_W = 952
const CAT_H = 201

/*
 * ⚠ ★상단바용 작은 판★ (2026-09-19 검수에서 잡았다).
 *
 *   상단바 로고는 ★34px(폰 28px)★ 로만 그린다. 그런데 934px 짜리 62KB 를
 *   ★모든 페이지가★ 받고 있었다 — 옛 상단바(`tri`)는 인라인 SVG 라 0바이트였으니
 *   ★0 → 62KB 회귀★ 였다. 96px 판(12KB)을 따로 두어 5분의 1로 줄인다.
 *   (96px 은 34px 을 고해상도 화면에서 3배로 그려도 남는 크기다)
 *
 *   ⚠ 큰 판은 ★홈 대문★ 이 그대로 쓴다 — 거기는 150px 라 작은 판이면 뭉개진다.
 */
const CAT_SRC_DARK_SM = '/brand/mark-dark-sm.webp'
const CAT_SRC_LIGHT_SM = '/brand/mark-light-sm.webp'
const CAT_W_SM = 454
const CAT_H_SM = 96

/**
 * 새 로고 본체.
 *
 * ⚠ ★`width`·`height` 를 반드시 준다★ — `flex` 안에서 치수가 없으면 세로가 눌린다
 *   (`ArtMark` 가 이미 같은 함정을 적어 뒀다).
 */
function CatMark({
  className,
  height,
  tone = 'light',
  small = false,
}: {
  className?: string
  height?: number
  /** `light` = 어두운 배경에 얹는다(기본) · `dark` = 밝은 배경에 얹는다 */
  tone?: 'light' | 'dark'
  /** 상단바처럼 ★작게 그리는 자리★ — 96px 판을 쓴다 (12KB) */
  small?: boolean
}) {
  const h = height ?? 32
  const dark = tone !== 'dark'
  const src = small
    ? dark
      ? CAT_SRC_DARK_SM
      : CAT_SRC_LIGHT_SM
    : dark
      ? CAT_SRC_DARK
      : CAT_SRC_LIGHT
  const w = small ? CAT_W_SM : CAT_W
  const hh = small ? CAT_H_SM : CAT_H
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={MARK_LABEL}
      width={Math.round((h * w) / hh)}
      height={h}
      className={className ? `${className} shrink-0` : 'shrink-0'}
    />
  )
}

/**
 * 그림 로고 본체.
 *
 * ⚠ ★`width`·`height` 를 반드시 준다★ — 이 로고는 `flex` 안에 놓이는데
 *   (`v2-brand flex items-center`) 치수가 없으면 ★세로가 눌린다.★
 *   `SiteHeaderV2` 가 표장에서 이미 같은 함정을 적어 뒀다.
 *   `shrink-0` 도 같은 이유다 — 좁은 폰에서 가로로 찌그러지지 않게.
 */
function ArtMark({ className, height }: { className?: string; height?: number }) {
  const h = height ?? 32
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ART_SRC}
      alt={MARK_LABEL}
      width={Math.round((h * ART_W) / ART_H)}
      height={h}
      className={className ? `${className} shrink-0` : 'shrink-0'}
    />
  )
}

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
function resolveVariant(
  variant: BrandLogoVariant | undefined,
  wordmark: BrandWordmark,
  /** 아무것도 안 정해졌을 때의 기본값. 상단바는 `NAV_VARIANT`, 홈 큰 로고는 `DEFAULT_VARIANT` */
  fallback: BrandLogoVariant = DEFAULT_VARIANT,
) {
  if (variant) return variant
  return wordmark === 'sacloud' ? 'wordmark' : fallback
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
  const resolved = resolveVariant(variant, wordmark)
  if (resolved === 'cat') {
    /* 홈 큰 로고. 높이는 부모가 정한다 — 어두운 히어로 위라 `tone` 은 기본값(light) */
    return <CatMark className={className} height={150} />
  }
  if (resolved === 'tri') {
    /*
     * 홈 큰 로고를 세 색 로고로 부르면 여기로 온다. ★기본값은 아니다★ —
     * 홈 히어로는 `DEFAULT_VARIANT`(`'art'`) 그대로다. 불렀을 때만 그린다.
     */
    return <TriMark className={className} height={110} width={Math.round(110 * TRI_RATIO)} />
  }
  if (resolved === 'art') {
    /* 홈 큰 로고. 높이는 `HomeSearch` 가 정한다 (PC 110px · 폰 56px) */
    return <ArtMark className={className} height={110} />
  }
  if (resolved === 'mark') {
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

  const resolved = resolveVariant(variant, wordmark, NAV_VARIANT)
  if (resolved === 'cat') {
    /* 상단바. 로그인 카드처럼 밝은 바탕이면 `tone='dark'` 로 원본 색을 쓴다.
       ★작은 판★ 을 쓴다 — 여기는 34px 라 934px 판이 필요 없다 (12KB 대 62KB) */
    return <CatMark className={className} height={34} tone={tone} small />
  }
  if (resolved === 'tri') {
    /*
     * ★지금 상단바가 쓰는 로고★ — 흰 구름 + 빨강 `SA` + 파랑 `CLOUD`.
     *
     * ⚠ ★`width`·`height` 를 반드시 준다★ — 상단바는 `flex` 다. 치수 없는 `svg` 는
     *   브라우저가 300×150 으로 잡았다가 눌린다. `className`(`h-[34px] w-auto`)이
     *   덮어쓰지만, ★못 오는 경우(옛 `SiteHeader`)를 위해 기본 치수를 같이 준다.★
     *   `tone` 은 안 본다 — 세 색이 이미 정해져 있어 밝기로 갈아끼울 것이 없다.
     */
    return (
      <TriMark className={className} height={34} width={Math.round(34 * TRI_RATIO)} />
    )
  }
  if (resolved === 'art') {
    /*
     * ⚠ ★그림 로고는 작아지면 구름 속 `SA CLOUD` 글자가 안 읽힌다★ —
     *   34px 높이에서 그 글자는 4px 남짓이다. 여기서는 ★그림표(픽토그램)로 쓴다★:
     *   빨간 `Log` 셋 + 흰 구름 실루엣으로 알아본다.
     *   ★읽는 기계에는 `alt` 로 «3RD CLOUD.my» 가 그대로 들린다.★
     *   글자로 읽히는 로고가 필요하면 `DEFAULT_VARIANT` 를 `'mark'` 로 되돌린다.
     */
    return <ArtMark className={className} height={34} />
  }
  if (resolved === 'mark') {
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
