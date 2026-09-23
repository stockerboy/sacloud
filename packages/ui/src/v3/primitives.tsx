'use client'

/**
 * ★v3 조각★ — 선수·클랜 상세 v3 와 사이트 전체가 같이 쓰는 작은 부품 (2026-09-10)
 *
 * - `MarkCircle`   클랜마크 원. 이름 앞에는 **언제나** 마크가 있다 — 모르면 구름 (사장님 상시 지시).
 *                  원 크롭 파일(`/assets/clans/<slug>.png`) 이 있으면 그것을, 없으면 옛 `ClanMark`
 *                  (넥슨 주소 → 구름 fallback) 를 쓴다. `background-size:100% 100%` — `cover` 는 테두리가 잘린다.
 * - `TierText`     ASTRA 는 영롱하게 · CHALLENGER 는 브론즈 · 다른 리그는 글자 그대로.
 * - `Card` 류      시안의 카드 · 머리 · 리본 · 섹션 줄.
 * - `Kda`          킬·어시 흰색 / 데스 빨강.
 */
import type { CSSProperties, ReactNode } from 'react'
import { ClanMark, type ClanMarkInput } from '../common/ClanMark'
import { showsTier } from '@sacloud/contract'
import { divisionLabel } from '../league/divisionLabel'
import { CLAN_THEMES, FALLBACK_THEME, clanThemeOf, type ClanTheme } from './clanThemes'
import { ASTRA_STYLE, CHAL_NUM_COLOR, CHAL_STYLE, V3, cardHeadStyle, cardStyle, cardTitleStyle, ribbonStyle, spacerStyle } from './tokens'

/**
 * ★slug 를 못 받은 티어 칩을 「카테고리로 판단」 하게 되돌리는 스위치★ (2026-09-14).
 *
 * `true` 면 2026-09-13 판 그대로 — `independent`(IPL) 이면 그린다.
 * `false`(지금) 면 slug 를 받은 자리만 그린다. 지금은 티어를 쓰는 리그가 없어서
 * 결국 아무 데도 안 그린다 — 그게 사장님이 시키신 «티어 전부 없애고» 다.
 */
const TIER_CHIP_CATEGORY_FALLBACK = false

export { clanThemeOf, FALLBACK_THEME, type ClanTheme }

/** 원 크롭 마크가 있는 클랜인가 — 테마 표와 마크 파일은 같은 403개에서 나왔다 */
export function hasFitMark(slug: string | null | undefined): boolean {
  return !!slug && slug in CLAN_THEMES
}
export function fitMarkUrl(slug: string): string {
  return `/assets/clans/${slug}.png`
}

export interface MarkCircleProps {
  /** 클랜 요약 — slug 로 원 크롭 파일을 찾는다. null 이면 구름 */
  clan?: (ClanMarkInput & { slug?: string | null }) | null
  size?: number
  /** 링 — 테마가 있으면 `edge`/`main` 으로 발광 */
  ring?: ClanTheme | null
  style?: CSSProperties
  className?: string
  title?: string
}

export function MarkCircle({ clan, size = 20, ring, style, className, title }: MarkCircleProps) {
  const slug = clan?.slug ?? null
  const box: CSSProperties = {
    width: size,
    height: size,
    flex: 'none',
    borderRadius: '50%',
    backgroundColor: V3.chip,
    overflow: 'hidden',
    display: 'inline-block',
    boxShadow: ring ? `0 0 0 1px ${ring.edge}a6, 0 0 ${Math.max(10, size / 2)}px ${ring.main}6b` : undefined,
    ...style,
  }
  if (hasFitMark(slug)) {
    return (
      <span
        className={className}
        title={title}
        style={{
          ...box,
          backgroundImage: `url(${fitMarkUrl(slug as string)})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />
    )
  }
  return (
    <span className={className} title={title} style={box}>
      <ClanMark clan={clan ?? null} size="fluid" />
    </span>
  )
}

/** 티어 글자 — IPL 1 = ASTRA (영롱) · 2/3 = CHALLENGER n (브론즈) · 그 밖은 리그 규칙 그대로 */
export function TierText({
  division,
  leagueCategory,
  leagueSlug,
  size = 11,
  style,
  prefix,
  prefixSize,
}: {
  division: number | null | undefined
  leagueCategory?: string
  /**
   * ★티어를 쓰는 리그인가★ 를 여기서 본다 (2026-09-13 사장님: «SPL은 1티어 2티어 구분 없어»).
   *
   * ⚠ 계약에 `showsTier(slug)` 가 이미 있었는데 ★이 조각만 안 보고 있었다.★
   *   그래서 경기 카드·상대전적·스코어보드에 SPL 인데 «2티어» 가 찍혔다.
   *   화면마다 따로 감추면 또 빠뜨린다 — ★글자를 만드는 여기 한 곳★ 에서 막는다.
   *
   * 안 넘기면 지금까지처럼 그대로 그린다 (아직 안 고친 호출부가 안 깨진다).
   */
  leagueSlug?: string
  size?: number
  style?: CSSProperties
  /**
   * ★티어 앞에 붙는 말★ (2026-09-15 밤 · 무한 QA) — 예: «vs».
   *
   * 부모가 따로 그리면, 티어를 안 쓰는 리그에서 이 조각이 `null` 을 돌려줄 때
   * ★앞말만 혼자 남는다.★ 실제로 경기 카드에 «vs» 한 글자가 떠 있었다.
   * 위 주석의 방침 그대로 — ★글자를 만드는 여기 한 곳★ 에서 같이 막는다.
   */
  prefix?: string
  /** 앞말 크기 (안 주면 `size` 보다 한 단계 작게) */
  prefixSize?: number
}) {
  if (division === null || division === undefined) return null
  /**
   * ★티어를 안 쓰는 리그에는 안 그린다★ (2026-09-13 사장님: «SPL은 1티어 2티어 구분 없어»).
   *
   * ── 두 갈래로 판정한다
   *   ① `leagueSlug` 를 받았으면 계약(`showsTier`)이 정한다 — ★이게 진짜 기준★ 이다
   *   ② 안 받았으면 `leagueCategory` 로 본다 — ★`independent`(IPL) 만★ 그린다
   *
   * ── 왜 ② 가 필요한가
   *   이 조각을 부르는 자리가 ★열아홉 군데★ 인데 거의 다 slug 가 아니라 category 만 들고 있다.
   *   열아홉 군데에 slug 를 실어 나르다 보면 ★반드시 몇 개를 빠뜨린다.★
   *   운영 실측(2026-09-13): `independent` 인 리그는 IPL 하나뿐이고, IPL 이 티어를 쓰는
   *   유일한 리그다 — 두 갈래가 ★같은 답★ 을 낸다. SPL(official·division_count 2)과
   *   10🏔(official·1)은 이제 티어 글자가 아예 안 나간다.
   *
   * ⚠ 나중에 `independent` 인데 티어를 안 쓰는 리그가 생기면 그 자리에 `leagueSlug` 를
   *   넘기면 된다 — ①이 ②를 이긴다.
   *
   * ── ⚠ ★2026-09-14 — ② 의 전제가 깨졌다★
   *   위에 «IPL 이 티어를 쓰는 유일한 리그다» 라고 적어 뒀는데, 바로 그날
   *   사장님이 «IPL 티어 전부 없애고» 라고 하셨다. 이제 ★티어를 쓰는 리그가 없다.★
   *   그런데 ② 는 여전히 `independent`(=IPL) 에 그려 주고 있어서, 사장님이
   *   «아직도 IPL에 ASTRA CHALLENGER 다 안없어졌어» 라고 잡아 주셨다.
   *
   *   ★slug 를 못 받았을 때의 기본값을 「안 그린다」로 뒤집는다.★
   *   열아홉 군데에 slug 를 실어 나르지 않아도 되고, 티어를 다시 쓰는 리그가 생기면
   *   그 화면에서 slug 를 넘기면 된다 — ①이 언제나 ②를 이긴다.
   *   옛 갈래는 `TIER_CHIP_CATEGORY_FALLBACK = true` 로 되돌아온다 (`CLAUDE.md` 1-4).
   */
  if (leagueSlug !== undefined) {
    if (!showsTier(leagueSlug)) return null
  } else if (!TIER_CHIP_CATEGORY_FALLBACK) {
    return null
  } else if (leagueCategory !== undefined && leagueCategory !== 'independent') {
    return null
  }
  const label = divisionLabel(division, leagueCategory)
  /* 앞말은 ★여기까지 온 뒤에만★ 그린다 — 위에서 `null` 로 돌아갔으면 같이 사라진다 */
  const head =
    prefix === undefined ? null : (
      <span
        style={{
          fontSize: prefixSize ?? Math.max(9, size - 1),
          color: V3.textGhost2,
          letterSpacing: '.08em',
          marginRight: 4,
        }}
      >
        {prefix}
      </span>
    )
  if (label === 'ASTRA') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap', ...style }}>
        {head}
        <span style={{ ...ASTRA_STYLE, fontSize: size }}>ASTRA</span>
      </span>
    )
  }
  const m = /^CHALLENGER\s*(\d)$/.exec(label)
  if (m) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap', ...style }}>
        {head}
        <span style={{ fontSize: size, ...CHAL_STYLE }}>CHALLENGER</span>
        <span style={{ fontSize: size, fontWeight: 600, color: CHAL_NUM_COLOR }}>{m[1]}</span>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap', ...style }}>
      {head}
      <span style={{ fontSize: size, color: V3.textMuted }}>{label}</span>
    </span>
  )
}

/*
 * ⚠ ★2026-09-22 밤 — 위쪽 색 띠(2px)를 안 그린다★ (사장님: 「서플라이랑 똑같이」).
 *   서플라이 카드에는 색 띠가 없다 — 테두리 1px 만 있다.
 *   ★`edge` 는 그대로 받는다★ — 되살리려면 아래 style 에
 *   `...(edge ? { borderTop: ... } : {})` 한 조각만 넣으면 된다 (`CLAUDE.md` 1-4).
 */
export function Card({ children, style, edge }: { children: ReactNode; style?: CSSProperties; edge?: string }) {
  void edge
  return (
    <section style={{ ...cardStyle, ...style }}>
      {children}
    </section>
  )
}

export function CardHead({
  title,
  ribbon = V3.blue,
  children,
  right,
  style,
}: {
  title?: ReactNode
  ribbon?: string
  children?: ReactNode
  right?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ ...cardHeadStyle, ...style }}>
      <div style={{ ...ribbonStyle, background: ribbon }} />
      {title !== undefined ? <span style={cardTitleStyle}>{title}</span> : null}
      {children}
      <div style={spacerStyle} />
      {right}
    </div>
  )
}

/** 본문 사이의 섹션 줄 — «최근 경기» 같은 제목 + 가는 선 */
export function SectionBar({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={ribbonStyle} />
      {/* ⚠ 2026-09-22 흰 카드용. 옛 값(다크) title #fff · line #1a2438 — 1-4 */}
      <span style={{ fontSize: 16, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: V3.divider }} />
      {right}
    </div>
  )
}

/** 킬 / 데스 / 어시 — 킬·어시 흰색, 데스 빨강, 0 어시는 `-` */
export function Kda({
  kill,
  death,
  assist,
  size = 16,
}: {
  kill: number | null
  death: number | null
  assist: number | null
  size?: number
}) {
  const show = (v: number | null) => (v === null ? '-' : String(v))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: size, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {/* ⚠ 2026-09-22 흰 카드용. 옛 값(다크) kill/assist #eef4ff · 슬래시 #3a4560 — 1-4 */}
      <span style={{ color: V3.textStrong }}>{show(kill)}</span>
      <span style={{ color: V3.textGhost }}>/</span>
      <span style={{ color: V3.red }}>{show(death)}</span>
      <span style={{ color: V3.textGhost }}>/</span>
      <span style={{ color: V3.textStrong }}>{assist ?? 0}</span>
    </span>
  )
}

/**
 * ★경쟁전 엠블럼★ (2026-09-16 사장님: «모든 경쟁전글씨 옆에 저 로고 장착(경쟁전만)»).
 *
 * ★경쟁전에만 붙인다★ — 일반전(IPL·열산리그)에는 안 붙는다. 그래서 이 조각은
 * «경쟁전» 이라고 적는 자리에서만 부른다. 조각 하나로 두면 크기·간격이 안 흩어진다.
 *
 * 원본 그림이 1.5MB 라 22px 로 줄여 webp 로 넣었다 (1.0KB · 2배 판 2.6KB).
 */
export function CompetitiveMark({ size = 16 }: { size?: number }) {
  return (
    <img
      src="/assets/competitive-emblem.webp"
      srcSet="/assets/competitive-emblem.webp 1x, /assets/competitive-emblem@2x.webp 2x"
      alt=""
      aria-hidden
      width={Math.round(size * (30 / 22))}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: 'none' }}
    />
  )
}

/** MVP 배지 (선수 화면 — 본인일 때만) */
/** 스나이퍼 표시 — 사장님이 고른 «발광 스코프» (2026-09-11 · 시안 02). 워터마크·(S) 대신 닉 옆에 붙는다 */
export function SniperMark({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ flex: 'none', filter: 'drop-shadow(0 0 4px rgba(255,90,99,.55))' }} aria-label="스나이퍼">
      <title>스나이퍼</title>
      <circle cx="8" cy="8" r="6" fill="rgba(255,90,99,.16)" stroke={V3.red} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.6" fill={V3.red} />
      <path d="M8 0.8v3M8 12.2v3M0.8 8h3M12.2 8h3" stroke={V3.red} strokeWidth="1.5" />
    </svg>
  )
}

/**
 * ★MVP 알약★ — PC 에서 가로로 길게 늘일 수 있게 className 을 연다 (2026-09-12 사장님:
 * «pc에서는 mvp카드를 좀 더 가로로 길게 잘 보이게 배치해줘»). 늘리는 값은 CSS 쪽
 * `.v3-mvp-wide` 에 있다 — 폰은 한 픽셀도 안 바뀐다.
 */
/**
 * ★★MVP 표 — 빨간 원 안에 흰 별★★ (2026-09-20 사장님)
 *
 * > 「mvp 표시를 통일해 일단 그 내가 만든 로고인것도 있고 별인것도 있는데
 * >  그냥 빨강색 원안에 하얀색 별이 들어간걸로(경기카드에 써진 엠비피도 이걸로) 통일해
 * >  그리고 닉네임 오른쪽에 넣어 만약에 스나가 엠비피면 스나표시 오른쪽에 하고」
 *
 * ── 무엇이 섞여 있었나
 *   ```
 *     명단 줄        ★ (금색 별 한 글자)
 *     경기 카드      /assets/mvp-emblem.webp (사장님이 만드신 로고)
 *     선수 화면      ★ + 「MVP」 글자 (MvpBadge)
 *   ```
 *   ★같은 뜻인데 셋이 다 달랐다.★ 하나로 모은다.
 *
 * ⚠ ★글자를 넣지 않는다★ — 닉네임 옆에 붙는 표라 자리가 좁다.
 *   빨간 원과 흰 별만으로 충분히 읽힌다. 뜻은 `title` 로 알린다.
 * ⚠ 옛 부품(`MvpBadge`)은 ★지우지 않았다★ — 바로 아래 그대로 있다 (CLAUDE.md 1-4).
 */
/**
 * ★★MVP 표시 — 하나로★★ (2026-09-22 밤 · 사장님)
 *
 * > 「모든 mvp표시 여기서 노란색을 빨간색으로 바꾼걸로 통일해 빨간별 원모양 말고」
 *   (사진: 노란 사각 배지 「★ MVP」)
 *
 *   모양은 그 사각 배지 그대로 — 별 + 「MVP」 글자, 각진 모서리.
 *   색만 노랑 → ★빨강★. 글자는 흰색(빨강 위 검정은 안 읽힌다).
 *   카드 11곳 · 스코어보드 전부 이 하나를 부른다 — 여기만 바꾸면 전부 바뀐다.
 *
 * ⚠ 옛 「빨강 원 안 흰 별」 은 아래 `MvpMarkCircle` 로 남겼다 (`CLAUDE.md` 1-4).
 */
export function MvpMark({ size = 16, className, compact = false }: { size?: number; className?: string; /** ★만 — 명단 줄처럼 자리가 없는 곳 (2026-09-23 밤 QA: 닉네임이 「거…」 로 눌렸다). 빨간 사각은 그대로 */ compact?: boolean }) {
  const fs = Math.max(9, Math.round(size * 0.66))
  return (
    <span
      className={className}
      title="MVP"
      aria-label="MVP"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        flex: 'none',
        padding: compact ? '2px 4px' : '2px 6px',
        borderRadius: 0,
        background: '#e0342f',
        color: '#ffffff',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: fs }}>&#9733;</span>
      {compact ? null : <span style={{ fontSize: fs, fontWeight: 900, letterSpacing: '.06em' }}>MVP</span>}
    </span>
  )
}

/** ★옛 판★ — 빨강 원 안 흰 별 (2026-09-20 ~ 2026-09-22). 지우지 않는다 */
export function MvpMarkCircle({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      title="MVP"
      aria-label="MVP"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#e0342f',
        boxShadow: '0 0 0 1px rgba(255,255,255,.22), 0 0 10px rgba(224,52,47,.45)',
        lineHeight: 1,
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.66} height={size * 0.66} aria-hidden fill="#fff">
        <path d="M12 2.6l2.9 6.05 6.6.9-4.8 4.6 1.2 6.55L12 17.6l-5.9 3.1 1.2-6.55-4.8-4.6 6.6-.9L12 2.6z" />
      </svg>
    </span>
  )
}

export function MvpBadge({ size = 10, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flex: 'none',
        padding: '3px 7px',
        borderRadius: V3.radiusChip,
        whiteSpace: 'nowrap',
        /* 2026-09-22 밤 — 노랑 → 빨강 (사장님). 옛 값 rgba(255,216,61,.10)/.55/.22 · 글자 V3.gold */
        background: '#e0342f',
        border: '1px solid #e0342f',
        boxShadow: 'none',
      }}
    >
      <span style={{ fontSize: size + 0.5, color: '#ffffff' }}>★</span>
      <span style={{ fontSize: size, fontWeight: 900, letterSpacing: '.08em', color: '#ffffff' }}>MVP</span>
    </span>
  )
}

/** 등수 표기 — 큰 숫자 + 작은 «위» */
export function RankText({ rank, color, size = 17 }: { rank: number; color: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, color, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: size, fontWeight: 900, lineHeight: 1, letterSpacing: '-.02em' }}>{rank}</span>
      <span style={{ fontSize: Math.round(size * 0.62), fontWeight: 700 }}>위</span>
    </span>
  )
}

/** 상대 시각 — «16시간 전 23:26» 꼴. 시안의 시간 칸 */
export function relativeKst(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const diff = Date.now() - at.getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  const kst = new Date(at.getTime() + 9 * 3_600_000)
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const rel = d >= 1 ? `${d}일 전` : h >= 1 ? `${h}시간 전` : `${Math.max(1, Math.floor(diff / 60_000))}분 전`
  return `${rel} ${hh}:${mm}`
}

/**
 * ★마지막 경기 시각★ — «2026년 9월 12일 19시 30분» (2026-09-13 사장님).
 *
 * > «최근경기 이름을 통합 기록실(마지막경기 n년n월n일n시n분) 로 바꿔줘»
 *
 * `relativeKst` 는 «11시간 전 19:30» 처럼 ★상대★ 시각이다. 줄 제목에는 그게 안 맞는다 —
 * 「마지막 경기가 언제였나」 는 지금으로부터 몇 시간인지가 아니라 ★그 날짜★ 를 묻는 말이다.
 * 시간대는 `relativeKst` 와 ★같은 방식★ 으로 맞춘다 (UTC 에 9시간을 더한다).
 */
export function fullKst(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const kst = new Date(at.getTime() + 9 * 3_600_000)
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${kst.getUTCHours()}시 ${mm}분`
}

/** «9/3» 같은 월/일 */
export function monthDay(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const kst = new Date(at.getTime() + 9 * 3_600_000)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}

/**
 * ★★경기 카드에 찍는 시각 — ★끝난 때★ 다★★ (2026-09-22 · 사장님 지시)
 *
 * > 「우리사이트에 찍힌 시간은 ★경기 시작시간★ 이야 ★경기 종료시간으로 맞춰★
 * >  병영수첩에 1시39분에 끝났다고 돼있잖아 저 시간으로 맞춰서 1시39분이라고 쓰고
 * >  지금 1시 57분이니까 ★18분전★ 으로 표시해야해」
 *
 * 병영수첩이 보여 주는 시각은 ★끝난 때★ 이고, 우리가 쓰던 값은 ★시작한 때★ 였다
 * (경기 열쇠에 시작 시각이 들어 있다). 한 경기가 20분쯤이라 ★20분씩 어긋나 보였다.★
 *
 * ⚠ ★끝난 때를 모르면 시작한 때로 되돌아간다★ — 빈 자리를 지어내지 않는다 (D-106).
 *   옛 경기(상대시간이 「2시간 전」 처럼 성기게 들어온 것)는 끝 시각이 비어 있다.
 */
export function matchShownAt(match: {
  start_at: string
  end_at?: string | null
}): string {
  return match.end_at ?? match.start_at
}
