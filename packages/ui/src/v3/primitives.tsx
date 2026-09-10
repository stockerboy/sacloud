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
import { divisionLabel } from '../league/divisionLabel'
import { CLAN_THEMES, FALLBACK_THEME, clanThemeOf, type ClanTheme } from './clanThemes'
import { ASTRA_STYLE, CHAL_NUM_COLOR, CHAL_STYLE, V3, cardHeadStyle, cardStyle, cardTitleStyle, ribbonStyle, spacerStyle } from './tokens'

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
  size = 11,
  style,
}: {
  division: number | null | undefined
  leagueCategory?: string
  size?: number
  style?: CSSProperties
}) {
  if (division === null || division === undefined) return null
  const label = divisionLabel(division, leagueCategory)
  if (label === 'ASTRA') {
    return <span style={{ ...ASTRA_STYLE, fontSize: size, whiteSpace: 'nowrap', ...style }}>ASTRA</span>
  }
  const m = /^CHALLENGER\s*(\d)$/.exec(label)
  if (m) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap', ...style }}>
        <span style={{ fontSize: size, ...CHAL_STYLE }}>CHALLENGER</span>
        <span style={{ fontSize: size, fontWeight: 600, color: CHAL_NUM_COLOR }}>{m[1]}</span>
      </span>
    )
  }
  return <span style={{ fontSize: size, color: V3.textMuted, whiteSpace: 'nowrap', ...style }}>{label}</span>
}

export function Card({ children, style, edge }: { children: ReactNode; style?: CSSProperties; edge?: string }) {
  return (
    <section style={{ ...cardStyle, ...(edge ? { borderTop: `2px solid ${edge}` } : {}), ...style }}>
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
      <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#1a2438' }} />
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
      <span style={{ color: '#eef4ff' }}>{show(kill)}</span>
      <span style={{ color: '#3a4560' }}>/</span>
      <span style={{ color: V3.redSoft }}>{show(death)}</span>
      <span style={{ color: '#3a4560' }}>/</span>
      <span style={{ color: '#eef4ff' }}>{assist === null || assist === 0 ? '-' : assist}</span>
    </span>
  )
}

/** MVP 배지 (선수 화면 — 본인일 때만) */
export function MvpBadge({ size = 10 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flex: 'none',
        padding: '3px 7px',
        borderRadius: V3.radiusChip,
        whiteSpace: 'nowrap',
        background: 'rgba(255,216,61,.10)',
        border: '1px solid rgba(255,216,61,.55)',
        boxShadow: '0 0 12px rgba(255,216,61,.22)',
      }}
    >
      <span style={{ fontSize: size + 0.5, color: V3.gold }}>★</span>
      <span style={{ fontSize: size, fontWeight: 900, letterSpacing: '.08em', color: V3.gold }}>MVP</span>
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

/** «9/3» 같은 월/일 */
export function monthDay(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const kst = new Date(at.getTime() + 9 * 3_600_000)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}
