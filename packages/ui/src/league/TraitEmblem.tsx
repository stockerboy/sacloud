/**
 * ★특성 앰블럼★ — 여섯 축의 배지를 육각형 딱지 하나로 그린다 (2026-09-17 사장님).
 *
 * > «개인랭킹 … 사이에 상위10프로 안에 드는 특성들은 앰블럼을 줘
 * >  피파 그 파워헤더 같은 특성들처럼 육각형 모양 앰블럼 특징에 맞게 넣어줘»
 *
 * ── 무엇을 그리나
 *   세로로 긴 육각형 딱지 + 그 안에 ★흰 그림 하나.★ ★이름 글자는 안 넣는다★ —
 *   랭킹 표 한 줄에 셋까지 나란히 서야 해서 글자가 들어갈 자리가 없다.
 *   이름은 `<title>` 로만 붙어서 마우스를 올리면 뜬다.
 *
 * ── ★이름을 지어내지 않는다★
 *   배지 이름은 `PLAYER_HEX_BADGE` 한 곳에서 온다. 여기서 문자열을 만들지 않는다 —
 *   축 이름이 바뀔 때마다 배지가 «없는 축» 을 말하던 사고가 두 번 있었다
 *   (`playerHex.ts` 의 2026-09-15 · 2026-09-16 주석).
 *
 * ── ★무기별로 이름이 다른 축은 그림도 다르다★
 *   ```
 *   save        세이브 머신 / 세이브 머신   → 방패 (하나)
 *   duel        롱 마스터   / 라이플화력    → 조준경 / 총알
 *   chance      기회창출    / 기회차단      → 열쇠   / 막힌 화살
 *   safe        안전함      / 크랙          → 심장   / 갈라진 금
 *   gap         스나차이    / 라플차이      → 기운 저울 / 높이 다른 두 막대
 *   outnumbered 소수싸움    / 소수싸움      → 하나 대 셋 (하나)
 *   ```
 *   뜻은 `PLAYER_HEX_DESC` 를 읽고 맞췄다. 원본 사이트·FIFA 그림을 베끼지 않았다 —
 *   전부 SVG path 로 새로 그렸다. 아이콘 라이브러리를 새로 깔지 않았다.
 *
 * ── 등급은 둘뿐이다 (2026-09-17 사장님)
 *   `best` 최상위권(5위 이내) · `high` 상위권(10% 이내). 그 아래는 앰블럼을 안 단다.
 *   ★경계 숫자는 여기 없다★ — `contract/src/traitTier.ts` 의 `traitTierOf` 가 가른다.
 *   껍데기만 갈린다: 최상위권은 ★금테 + 바깥 무리★, 상위권은 ★은테★. 그림은 같다.
 *
 * ── ⚠ ★그라데이션 id 는 «등급» 으로만 짓는다★
 *   같은 배지가 랭킹 표 스무 줄에 나란히 뜬다. 훅(`useId`)은 서버 컴포넌트에서 못 쓰니
 *   id 가 문서에 여러 번 생기는 것을 피할 수 없다. 대신 ★같은 id 는 언제나 같은 내용★
 *   이 되게 맞췄다 (`sac-emb-bg-best` 는 어디서나 똑같은 그라데이션이다).
 *   브라우저는 첫 번째를 고르므로 내용이 같으면 그림이 어긋나지 않는다.
 *   ★축·무기처럼 배지마다 달라지는 것을 id 에 넣지 마라★ — 넣는 순간 조용히 갈린다.
 */
import { PLAYER_HEX_BADGE, TRAIT_TIER_LABEL, type TraitAxisKey, type TraitTierKey } from '@sacloud/contract'
import { V3 } from '../v3/tokens'

/* ── 딱지 ────────────────────────────────────────────────── */

/** 그림판. 세로로 길다 (100 × 116) */
const VB_W = 100
const VB_H = 116

/** 세로로 긴 육각형 — 위·아래가 뾰족하고 옆이 평평하다 */
const PLATE = 'M50 3 L96 30 V86 L50 113 L4 86 V30 Z'
/** 안쪽 한 겹 — 가장자리 빛 */
const PLATE_INNER = 'M50 11 L89 34 V82 L50 105 L11 82 V34 Z'
/** 위쪽에서 드는 빛 — 깎아 놓은 면처럼 보이게 하는 띠 */
const PLATE_TOP = 'M50 3 L96 30 V45 L50 20 L4 45 V30 Z'
/** 아래쪽 그늘 — 위 띠의 짝. 둘이 있어야 판때기가 아니라 «깎인 면» 으로 보인다 */
const PLATE_BOTTOM = 'M4 71 L50 96 L96 71 V86 L50 113 L4 86 Z'

/** 딱지 한가운데 — 그림을 줄일 때의 기준점 */
const PLATE_CX = 50
const PLATE_CY = 57
/** 테와 그림 사이 숨 쉴 자리. 1 이면 그림이 테에 붙는다 */
const GLYPH_SCALE = 0.86

/** 그림 색 */
const INK = V3.textStrong

/* ── 그림 ────────────────────────────────────────────────── */

/**
 * ★파내는 색★ — 방패의 체크, 총알의 탄피 금, 벽의 금은 흰 덩어리 위를 «파낸» 자리다.
 * 그 자리는 ★딱지 바탕과 똑같은 칠★ 이어야 뚫린 것처럼 보인다. 그래서 색이 아니라
 * ★바탕 그라데이션을 가리키는 `url(#...)`★ 을 받는다 (등급마다 바탕이 다르다).
 */
interface CarveProps {
  carve: string
}

/**
 * 획으로 그리는 그림의 공통 설정. `strokeWidth` 는 그림판(100) 기준이라
 * 22px 로 줄면 7 → 약 1.5px 다. 이보다 얇으면 폰에서 사라진다.
 */
const stroke = {
  fill: 'none',
  stroke: INK,
  strokeWidth: 7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** ★세이브 머신★ — 혼자 남은 판을 살려 냈다 → 방패에 체크 */
function GlyphShield({ carve }: CarveProps) {
  return (
    <>
      <path
        d="M50 26 L74 35 V57 C74 74 62 84 50 90 C38 84 26 74 26 57 V35 Z"
        fill={INK}
      />
      {/* 체크는 방패 위에 딱지 바탕색으로 판다 */}
      <path
        d="M38 57 L46 66 L62 45"
        fill="none"
        stroke={carve}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

/** ★롱 마스터★(스나) — 롱 안에서 상대 스나를 잡는다 → 조준경 십자선 */
function GlyphScope() {
  return (
    <>
      <circle cx={50} cy={57} r={23} {...stroke} strokeWidth={8} />
      <path d="M50 22 V40 M50 74 V92 M15 57 H33 M67 57 H85" {...stroke} strokeWidth={7} />
      <circle cx={50} cy={57} r={5} fill={INK} />
    </>
  )
}

/**
 * ★라이플화력★(라플) — 스나가 없는 판을 라플이 딴다 → 날아가는 총알.
 *
 * ⚠ 첫 판은 ★뾰족한 오각형★ 이라 «빨리감기» 로 읽혔다. 코를 둥글게 깎고
 *   탄피 금을 한 줄 넣으니 총알이 됐다.
 */
function GlyphBullet({ carve }: CarveProps) {
  return (
    <>
      <path d="M38 38 H58 C70 42 79 50 82 57 C79 64 70 72 58 76 H38 Z" fill={INK} />
      {/* 탄피 금 — 딱지 바탕색으로 판다 */}
      <path d="M50 38 V76" stroke={carve} strokeWidth={5} strokeLinecap="round" />
      <path d="M14 45 H30 M14 57 H27 M14 69 H30" {...stroke} strokeWidth={6} />
    </>
  )
}

/** ★기회창출★(스나) — 그 라운드 첫 킬을 낸다 → 판을 여는 열쇠 */
function GlyphKey() {
  return (
    <>
      <circle cx={50} cy={35} r={14} {...stroke} strokeWidth={8} />
      <path d="M50 49 V90" {...stroke} strokeWidth={8} />
      <path d="M50 73 H68 M50 84 H64" {...stroke} strokeWidth={7} />
    </>
  )
}

/**
 * ★기회차단★(라플) — 상대가 연 라운드를 되받는다 → 벽에 막힌 화살.
 *
 * ⚠ 첫 판에는 부딪힌 자리에 불똥 두 개를 그렸는데, 22px 에서 그것이 벽에 붙어
 *   ★둥근 괄호★ 처럼 보였다. 뺐다 — 화살이 벽에 멈춘 것만으로 읽힌다.
 */
function GlyphBlock() {
  return (
    <>
      {/* 벽 */}
      <rect x={66} y={24} width={12} height={68} rx={3} fill={INK} />
      {/* 들어오던 화살 — 벽 앞에서 멈춘다 */}
      <path d="M16 57 H42" {...stroke} />
      <path d="M42 43 L57 57 L42 71 Z" fill={INK} />
    </>
  )
}

/** ★안전함★(스나) — 그 라운드를 끝까지 산다 → 심장 */
function GlyphHeart() {
  return (
    <path
      d="M50 90 C26 72 20 56 20 45 C20 34 29 26 39 26 C45 26 50 30 50 34 C50 30 55 26 61 26 C71 26 80 34 80 45 C80 56 74 72 50 90 Z"
      fill={INK}
    />
  )
}

/**
 * ★크랙★(라플) — 상대 수비를 깬다 → ★쪼개진 방패.★
 *
 * ── 왜 방패인가 (2026-09-17 · 본체 제안)
 *   ```
 *   save   온전한 방패 + 체크   지킨다
 *   crack  쪼개진 방패          ★그 지킴을 깬다★
 *   ```
 *   둘이 한 집안 그림이라 표에서 나란히 서면 서로를 설명해 준다.
 *   전에는 세이브가 «방패» 고 크랙이 «벽» 이라 남남이었다.
 *
 * ── ⚠ ★선이 아니라 형태가 뜻을 나른다★
 *   앞선 네 판은 전부 ★가는 금★ 으로 «깨짐» 을 말하려 했고, 22px 로 줄면
 *   그 금이 1px 밑으로 내려가 ★사라졌다.★ 지금은 덩어리를 ★둘로 떼어★ 놓아
 *   실루엣 자체가 다르다 — 크기를 줄여도 «갈라졌다» 가 남는다.
 *   두 조각을 ★어긋나게★ (좌우로 벌리고 위아래로 엇갈리게) 놓은 것도 같은 까닭이다.
 *
 * 옛 판(`GlyphCrackWall`)은 바로 아래에 남겨 뒀다 (`CLAUDE.md` 1-4).
 */
function GlyphCrackSplit() {
  return (
    <>
      {/* 왼 조각 — 밖으로 벌어지고 살짝 내려앉았다 */}
      <path
        d="M50 26 L26 35 V57 C26 74 38 84 50 90 L44 60 L56 45 Z"
        fill={INK}
        transform="translate(-5 2) rotate(-5 38 58)"
      />
      {/* 오른 조각 */}
      <path
        d="M50 26 L56 45 L44 60 L50 90 C62 84 74 74 74 57 V35 Z"
        fill={INK}
        transform="translate(5 -2) rotate(5 62 58)"
      />
    </>
  )
}

/**
 * ⚠ ★옛 크랙★ — 금 간 벽. 지우지 않는다 (`CLAUDE.md` 1-4).
 *
 * 세 번 고쳐 그린 판이다:
 *   ① 번개 모양 획 하나     → 22px 에서 그냥 «X 자»
 *   ② 넓은 틈으로 크게 꺾음 → 남은 흰 조각이 글자 «Ŋ»
 *   ③ 벽돌 줄눈까지 파 봄   → 흰 벽이 여덟 조각으로 부서져 «창틀»
 * 그래도 ★금이 가늘어 22px 에서 «흰 덩어리에 줄 하나»★ 로 보였다.
 * `CRACK_GLYPH` 를 `'wall'` 로 바꾸면 이 그림이 돌아온다.
 */
function GlyphCrackWall({ carve }: CarveProps) {
  return (
    <>
      <rect x={24} y={27} width={52} height={60} rx={5} fill={INK} />
      <path
        d="M46 22 L55 45 L43 59 L51 92"
        fill="none"
        stroke={carve}
        strokeWidth={6.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 잔금 둘 */}
      <path
        d="M55 45 L71 39 M43 59 L29 67"
        fill="none"
        stroke={carve}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
    </>
  )
}

/** 어느 크랙 그림을 쓰나 — `'wall'` 로 바꾸면 옛 판이 돌아온다 */
const CRACK_GLYPH: 'split' | 'wall' = 'split'

function GlyphCrack({ carve }: CarveProps) {
  return CRACK_GLYPH === 'wall' ? <GlyphCrackWall carve={carve} /> : <GlyphCrackSplit />
}

/**
 * ★스나차이★(스나) — 상대 스나보다 점수가 앞섰다 → 기운 저울.
 *
 * ⚠ 첫 판은 ★긴 기둥 + 높은 대★ 라 저울이 아니라 ★기중기★ 로 보였다.
 *   기둥을 ★삼각 받침★ 으로 낮추고 접시를 매다니 저울이 됐다.
 */
function GlyphScale() {
  return (
    <>
      {/* 받침 */}
      <path d="M50 47 L63 82 H37 Z" fill={INK} />
      <path d="M29 88 H71" {...stroke} strokeWidth={7} />
      {/* 대 — 오른쪽이 올라갔다 */}
      <path d="M20 54 L80 38" {...stroke} strokeWidth={7} />
      {/* 접시 둘 */}
      <path d="M20 54 V63 M80 38 V47" {...stroke} strokeWidth={4.5} />
      <path d="M10 63 H30 L26 72 H14 Z" fill={INK} />
      <path d="M70 47 H90 L86 56 H74 Z" fill={INK} />
    </>
  )
}

/** ★라플차이★(라플) — 상대 라플보다 점수가 앞섰다 → 높이 다른 두 막대 */
function GlyphBars() {
  return (
    <>
      <rect x={26} y={44} width={18} height={46} rx={2} fill={INK} />
      <rect x={56} y={66} width={18} height={24} rx={2} fill={INK} />
      {/* 앞선 만큼 위로 */}
      <path d="M35 38 V26" {...stroke} strokeWidth={6} />
      <path d="M27 30 L35 18 L43 30 Z" fill={INK} />
    </>
  )
}

/**
 * ★소수싸움★ — 수가 밀린 라운드를 이긴다 → 하나 대 셋.
 *
 * ⚠ ★두 번 버렸다★
 *   ① 가운데 금을 위아래 끝까지 → ★도미노★ 로 보였다
 *   ② 혼자인 쪽에 테를 한 겹    → 눈알(◉) 이 됐다. 더 나빴다
 *   지금은 ★큰 점 하나 · 작은 점 셋★ 과 ★가운데 짧은 금★ 뿐이다.
 *   금이 짧아야 «맞선 자리» 로 읽히고 도미노가 안 된다.
 */
function GlyphOutnumbered() {
  return (
    <>
      <circle cx={27} cy={57} r={13} fill={INK} />
      {/* 맞선 자리 — 짧게 */}
      <path d="M50 42 V72" stroke={INK} strokeWidth={3.5} strokeLinecap="round" opacity={0.4} />
      <circle cx={69} cy={37} r={7.5} fill={INK} />
      <circle cx={83} cy={57} r={7.5} fill={INK} />
      <circle cx={69} cy={77} r={7.5} fill={INK} />
    </>
  )
}

/**
 * 축 × 무기 → 그림 하나.
 *
 * ★이름이 같은 축(`save` · `outnumbered`)은 그림도 하나다★ — 같은 배지를
 * 무기에 따라 다르게 그리면 같은 것을 둘로 읽게 된다.
 */
function glyphOf(axis: TraitAxisKey, sniper: boolean, carve: string) {
  switch (axis) {
    case 'save':
      return <GlyphShield carve={carve} />
    case 'duel':
      return sniper ? <GlyphScope /> : <GlyphBullet carve={carve} />
    case 'chance':
      return sniper ? <GlyphKey /> : <GlyphBlock />
    case 'safe':
      return sniper ? <GlyphHeart /> : <GlyphCrack carve={carve} />
    case 'gap':
      return sniper ? <GlyphScale /> : <GlyphBars />
    case 'outnumbered':
      return <GlyphOutnumbered />
    default:
      return null
  }
}

/* ── 등급 ────────────────────────────────────────────────── */

/**
 * ★앰블럼이 붙는 두 등급★ — 나머지 다섯(중상위권 아래)은 앰블럼을 안 단다.
 *
 * > 「개인랭킹 … 상위10프로 안에 드는 특성들은 앰블럼을 줘」 — 사장님
 *
 * ⚠ ★경계 숫자를 여기 박지 않는다.★ 몇 위·몇 % 가 어느 등급인지는
 *   `packages/contract/src/traitTier.ts` (`traitTierOf`) 한 곳이 정한다.
 *   여기는 ★이미 갈린 등급을 받아서 칠하기만★ 한다.
 */
export type TraitEmblemTier = Extract<TraitTierKey, 'best' | 'high'>

/**
 * 등급별 껍데기.
 *
 * ── ★최상위권은 금, 상위권은 은이다★
 *   둘을 ★테두리 색★ 으로 가른다 — 그림을 바꾸면 같은 특성이 둘로 보인다.
 *   최상위권에만 바깥 무리(halo) 한 겹을 더 둘러서 표에서 먼저 눈에 걸리게 했다.
 *
 * ── ⚠ ★같은 id 가 한 화면에 여러 번 나온다★
 *   랭킹 표 스무 줄에 같은 배지가 뜨면 `<linearGradient id=...>` 도 스무 개다.
 *   훅(`useId`)은 서버 컴포넌트에서 못 쓴다. 그래서 ★id 를 등급으로만 짓는다★ —
 *   같은 id 는 언제나 ★같은 내용★ 이라 브라우저가 첫 번째를 골라도 그림이 같다.
 *   (축·무기에 따라 달라지는 것을 id 에 넣으면 그 순간 조용히 어긋난다. 넣지 마라)
 */
const TIER_SKIN: Record<
  TraitEmblemTier,
  { bg: [string, string]; ring: [string, string, string]; inner: string; halo: string | null }
> = {
  best: {
    bg: ['#2a3557', '#111a2d'],
    ring: ['#ffeeb0', '#c8962c', '#ffd75e'],
    inner: 'rgba(255,228,160,.34)',
    halo: 'rgba(255,205,90,.20)',
  },
  high: {
    bg: ['#222e4c', '#0e1727'],
    ring: ['#e6eefb', '#7b8fb6', '#c3d4ee'],
    inner: 'rgba(214,230,255,.24)',
    halo: null,
  },
}

/* ── 컴포넌트 ────────────────────────────────────────────── */

/**
 * ★`inline-block`★ — 표 줄 안에서 글자와 나란히 서야 한다. flex 줄에 놓이면
 * 어차피 블록으로 바뀌므로 두 자리 다 맞는다. `flex:none` 은 좁은 폰에서
 * ★앰블럼이 찌그러지지 않게★ 하는 자리다.
 */
const EMBLEM_STYLE = { display: 'inline-block', verticalAlign: 'middle', flex: 'none' } as const

export interface TraitEmblemProps {
  axis: TraitAxisKey
  /** ★0 = 라이플 · 1 = 스나이퍼★ (`CLAUDE.md` 5장) */
  weapon: 0 | 1
  /** `best` 최상위권(5위 이내) · `high` 상위권(10% 이내). 판정은 `traitTierOf` 가 한다 */
  tier: TraitEmblemTier
  /** 높이(px). 기본 22 — 랭킹 표 한 줄에 들어가는 크기다 */
  size?: number
  className?: string
}

export function TraitEmblem({ axis, weapon, tier, size = 22, className }: TraitEmblemProps) {
  const sniper = weapon === 1
  const name = PLAYER_HEX_BADGE[axis]?.[sniper ? 'sniper' : 'rifle'] ?? null
  /* ★이름을 못 찾으면 안 그린다★ — 없는 배지를 지어내지 않는다 */
  if (name === null) return null

  const skin = TIER_SKIN[tier]
  /* ★이름도 등급도 지어내지 않는다★ — 둘 다 계약에서 가져온다 */
  const label = `${name} · ${TRAIT_TIER_LABEL[tier]}`
  const width = Math.round((size * VB_W) / VB_H)
  const bgId = `sac-emb-bg-${tier}`
  const ringId = `sac-emb-ring-${tier}`

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={width}
      height={size}
      className={className}
      role="img"
      aria-label={label}
      style={EMBLEM_STYLE}
    >
      <title>{label}</title>
      <defs>
        {/*
         * ★`userSpaceOnUse`★ — 그림 안을 «파낸» 자리(방패의 체크 · 총알의 탄피 금 ·
         *   벽의 금)가 ★딱지 바탕과 똑같은 색★ 이어야 한다. 기본값(objectBoundingBox)
         *   이면 그라데이션이 ★그 작은 path 크기에 맞춰 다시 늘어나서★ 색이 어긋난다.
         */}
        <linearGradient id={bgId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="34" y2="116">
          <stop offset="0%" stopColor={skin.bg[0]} />
          <stop offset="100%" stopColor={skin.bg[1]} />
        </linearGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={skin.ring[0]} />
          <stop offset="52%" stopColor={skin.ring[1]} />
          <stop offset="100%" stopColor={skin.ring[2]} />
        </linearGradient>
      </defs>

      {/* 최상위권만 두르는 바깥 무리 */}
      {skin.halo === null ? null : (
        <path d={PLATE} fill="none" stroke={skin.halo} strokeWidth={9} strokeLinejoin="round" />
      )}
      <path
        d={PLATE}
        fill={`url(#${bgId})`}
        stroke={`url(#${ringId})`}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {/* 깎인 면 — 위는 빛, 아래는 그늘 */}
      <path d={PLATE_TOP} fill="rgba(255,255,255,.09)" />
      <path d={PLATE_BOTTOM} fill="rgba(0,0,0,.20)" />
      <path d={PLATE_INNER} fill="none" stroke={skin.inner} strokeWidth={2} strokeLinejoin="round" />
      {/*
       * ★그림을 한 번 줄여서 앉힌다★ — 그림마다 좌표를 고치면 열 군데를 고쳐야 하고
       *   한 곳만 빠뜨려도 그 배지만 크기가 다르다. 테와 그림 사이에 숨 쉴 자리를
       *   두는 일은 ★여기 한 줄★ 에서만 한다. 첫 판은 이 겹이 없어 그림이 테에 붙었다.
       */}
      <g transform={`translate(${PLATE_CX} ${PLATE_CY}) scale(${GLYPH_SCALE}) translate(${-PLATE_CX} ${-PLATE_CY})`}>
        {glyphOf(axis, sniper, `url(#${bgId})`)}
      </g>
    </svg>
  )
}
