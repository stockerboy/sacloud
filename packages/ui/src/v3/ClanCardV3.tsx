'use client'

/**
 * ★클랜 카드 v3★ — 띠 + (A) 클랜 테마 배경 위의 KPI 4줄 + 성향 육각형 (2026-09-10 시안)
 *
 * 테마가 칠하는 다섯 곳 중 A·B·E 가 여기다 (`CLAN_THEME_GUIDE` 3절).
 * 육각형은 `hexagon_v2`(워커가 접어 둔 것) 를 그대로 그린다 — 등수는 리그 안 등수,
 * 게임템포만 글자(`text`) 다. 못 잰 축은 «측정중» 이고 면적은 0 이다.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { ClanHexagonV2, LeagueClanShow } from '@sacloud/contract'
import { floorColor, rankColor, statColor } from './rankColors'
import { Hexagon, type HexAxisView } from './Hexagon'
import { GhostButton, LeagueCenter, OfficialPill } from './PlayerBandV3'
import { MarkCircle, TierText, clanThemeOf, fitMarkUrl, hasFitMark, type ClanTheme } from './primitives'
import { ASTRA_STYLE, V3, cardStyle, fmt, pct1 } from './tokens'
import { formatRating } from '../common/format'

const bandStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
  alignItems: 'center',
  gap: 13,
  padding: '14px 18px',
  borderBottom: `1px solid ${V3.divider}`,
}
const traitBodyStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
  padding: '14px 22px 20px',
}
const kpiRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0,1fr)',
  alignItems: 'baseline',
  gap: 12,
  padding: '13px 4px',
  borderBottom: '1px solid #18222f',
}

/** (A) 클랜 테마 배경 레이어 — 마크 워터마크 + 위 밝음/아래 짙음 + 능선 */
export function ClanTraitBackdrop({ theme, markSlug }: { theme: ClanTheme; markSlug: string | null }) {
  return (
    <>
      {markSlug && hasFitMark(markSlug) ? (
        <span aria-hidden style={{ position: 'absolute', left: '-4%', top: '8%', width: '58%', height: '112%', backgroundImage: `url(${fitMarkUrl(markSlug)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', opacity: 0.08, pointerEvents: 'none' }} />
      ) : null}
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '62%', background: `linear-gradient(180deg, ${theme.light}14, ${theme.main}0a 55%, transparent)`, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', background: `linear-gradient(0deg, ${theme.deep}1f, ${theme.main}0a 60%, transparent)`, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', background: `linear-gradient(0deg, ${theme.main}30, ${theme.main}08)`, clipPath: 'polygon(0% 100%, 0% 46%, 13% 30%, 27% 52%, 41% 22%, 56% 48%, 70% 26%, 84% 50%, 100% 34%, 100% 100%)', pointerEvents: 'none' }} />
    </>
  )
}

/** 클랜 육각형 축 → 그림 입력. 시안 순서(스나싸움 · 소수싸움 · 세이브 · 게임템포 · 선짤 · 교환율) */
export function clanHexAxes(hex: ClanHexagonV2 | null): HexAxisView[] {
  const order = ['sniperDuel', 'outnumbered', 'save', 'tempo', 'firstBlood', 'trade'] as const
  const label: Record<(typeof order)[number], string> = {
    sniperDuel: '스나싸움', outnumbered: '소수싸움', save: '세이브', tempo: '게임템포', firstBlood: '선짤', trade: '교환율',
  }
  return order.map((key) => {
    const axis = hex?.axes.find((a) => a.key === key) ?? null
    if (!axis || axis.value === null) return { label: label[key], value: null, note: '측정중', noteColor: V3.textGhost }
    if (key === 'tempo') return { label: label[key], value: axis.value * 100, note: axis.text, noteColor: '#a9c3ff' }
    if (axis.rank !== null) return { label: label[key], value: axis.value * 100, note: `${axis.rank}위`, noteColor: rankColor(axis.rank) }
    return { label: label[key], value: axis.value * 100, note: axis.text, noteColor: V3.textMuted }
  })
}

export interface ClanCardV3Props {
  data: LeagueClanShow
  infoHref: string
  seasonLabel: string
  memberCount: number | null
  renewedNote: ReactNode
  renewAction: ReactNode
  /** 구간 선택 — 상대 티어별 승률. 없으면 통합 승률만 */
  tierWins?: { division: number; win: number; lose: number }[]
  tierIndex?: number
  onTierStep?: (dir: 1 | -1) => void
  /** 띠 안에 육각형을 그릴까 — 기록실에서는 «플레이스타일» 탭이 대신 그린다 (2026-09-11) */
  showHexagon?: boolean
}

export function ClanCardV3({ data, infoHref, seasonLabel, memberCount, renewedNote, renewAction, tierWins = [], tierIndex = 0, onTierStep, showHexagon = true }: ClanCardV3Props) {
  /* ★인식표★ (2026-09-11 사장님) — ASTRA 구간 클랜만 준다.
     ★1~3위 불 · 4~10위 먹구름 · 그 밖은 흰구름★. 다른 구간·SPL·열산 어디에도 안 준다 */
  const plateRank = data.rank ?? 999
  const plate: 'fire' | 'dark' | 'light' | null =
    data.division === 1 && data.league.category === 'independent'
      ? plateRank <= 3 ? 'fire' : plateRank <= 10 ? 'dark' : 'light'
      : null
  const theme = clanThemeOf(data.clan.slug)
  const rank = data.rank
  const ink = rank === null ? V3.textMuted : rankColor(rank)
  const games = data.win + data.lose
  const tier = tierWins.length > 0 ? tierWins[tierIndex % tierWins.length] : null
  const tierRate = tier && tier.win + tier.lose > 0 ? (tier.win / (tier.win + tier.lose)) * 100 : null
  const tiered = data.league.division_count >= 2
  const kpis: { label: string; value: string; sub: ReactNode; color: string; picker?: boolean }[] = [
    /* 같은 «층» 단위라 선수 점수와 ★같은 색 규칙★ 을 쓴다 (2026-09-11 사장님) */
    { label: '래더', value: formatRating(data.rating), sub: data.placement ? '배치 중' : '', color: floorColor(data.rating) },
    tier
      ? { label: '구간 승률', value: pct1(tierRate), sub: <><TierText division={tier.division} leagueCategory={data.league.category} size={11} /> <span>{tier.win}승 {tier.lose}패</span></>, color: tierRate === null ? V3.textMuted : statColor(tierRate), picker: tierWins.length > 1 }
      : { label: '승률', value: pct1(data.win_rate), sub: `${data.win}승 ${data.lose}패`, color: data.win_rate === null ? V3.textMuted : statColor(data.win_rate) },
    { label: '순위', value: rank === null ? '-' : `${rank}위`, sub: <>{tiered ? <TierText division={data.division} leagueCategory={data.league.category} size={11} /> : null}{data.rank_count !== null ? <span> / {fmt(data.rank_count)}팀</span> : null}</>, color: ink },
    /* 목업 넷째 줄은 «최다연승». 시즌 0 경기에서 센 값 — 없으면 «-» */
    { label: '최다연승', value: data.max_win_streak === null ? '-' : `${fmt(data.max_win_streak)}연승`, sub: `${fmt(games)}전 ${data.win}승 ${data.lose}패`, color: data.max_win_streak === null ? V3.textMuted : V3.gold },
  ]
  return (
    <section style={{ ...cardStyle, marginTop: 16, borderTop: `2px solid ${theme.edge}` }}>
      <div style={bandStyle} className="v3-band">
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <MarkCircle clan={data.clan} size={42} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.ink, textShadow: `0 0 16px ${theme.main}80`, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data.clan.name}
            </span>
            <span style={{ fontSize: 11, color: '#6f93b4', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
              시즌 Cloud 0 · {fmt(games)}전 기준
            </span>
          </span>
        </span>
        <LeagueCenter name={data.league.name} season={seasonLabel} />
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, minWidth: 0, flexWrap: 'wrap' }}>
          {data.clan.is_official_clan ? <OfficialPill theme={theme} /> : null}
          {renewAction}
          <GhostButton href={infoHref}>기본정보</GhostButton>
        </span>
      </div>

      <div style={traitBodyStyle}>
        <ClanTraitBackdrop theme={theme} markSlug={data.clan.slug} />
        {plate ? <span aria-hidden className={`v3-plate v3-plate--${plate}`} /> : null}
        <div style={{ position: 'relative', flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '0 4px 12px', borderBottom: '1px solid #18222f' }}>
            {tiered ? (
              <>
                {data.division === 1 && data.league.category === 'independent' ? (
                  <span style={{ fontSize: 11, border: '1px solid rgba(143,240,255,.35)', borderRadius: V3.radiusChip, background: 'rgba(143,240,255,.06)', padding: '3px 9px', whiteSpace: 'nowrap', ...ASTRA_STYLE }}>ASTRA</span>
                ) : (
                  <span style={{ padding: '3px 0' }}><TierText division={data.division} leagueCategory={data.league.category} size={11} /></span>
                )}
              </>
            ) : null}
            {memberCount !== null && memberCount > 0 ? <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>클랜원 {fmt(memberCount)}명</span> : null}
            <span style={{ fontSize: 11, color: V3.textGhost2, whiteSpace: 'nowrap', display: 'inline-flex', gap: 4 }}>· {renewedNote}</span>
          </div>
          {kpis.map((k) => (
            <div key={k.label} style={kpiRowStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {k.picker && onTierStep ? <StepButton onClick={() => onTierStep(-1)}>‹</StepButton> : null}
                <span style={{ fontSize: 11.5, color: V3.textDim, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{k.label}</span>
                {k.picker && onTierStep ? <StepButton onClick={() => onTierStep(1)}>›</StepButton> : null}
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: V3.textGhost, fontWeight: 500, minWidth: 0, display: 'inline-flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end', textAlign: 'right' }}>{k.sub}</span>
                <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', flex: 'none', color: k.color }}>{k.value}</span>
              </span>
            </div>
          ))}
        </div>
        {/* 2026-09-11 사장님: 클랜 페이지도 선수 페이지처럼 탭으로 나눈다 — 육각형은 «플레이스타일» 탭에서 그린다 */}
        {showHexagon ? <Hexagon axes={clanHexAxes(data.hexagon_v2)} id="clanHex" /> : null}
      </div>
    </section>
  )
}

function StepButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flex: 'none', fontSize: 10, color: '#8fa2c4', background: V3.chip, border: `1px solid ${V3.chipBorder}`, borderRadius: V3.radiusChip, cursor: 'pointer', fontFamily: 'inherit' }}
    >
      {children}
    </button>
  )
}
