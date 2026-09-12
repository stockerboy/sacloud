'use client'

/**
 * ★클랜 카드 v3★ — 띠 + (A) 클랜 테마 배경 위의 KPI 4줄 + 성향 육각형 (2026-09-10 시안)
 *
 * 테마가 칠하는 다섯 곳 중 A·B·E 가 여기다 (`CLAN_THEME_GUIDE` 3절).
 * 육각형은 `hexagon_v2`(워커가 접어 둔 것) 를 그대로 그린다 — 등수는 리그 안 등수,
 * 게임템포만 글자(`text`) 다. 못 잰 축은 «측정중» 이고 면적은 0 이다.
 */
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { showsTier, type ClanHexagonV2, type LeagueClanShow } from '@sacloud/contract'
import { floorColor, rankColor, rankColorHexAxis, statColor } from './rankColors'
import { Hexagon, type HexAxisView } from './Hexagon'
import { clanStyleNote } from './clanStyleNote'
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

/**
 * ★게임템포 기준★ (2026-09-12 사장님: «게임 템포는 초 옆에 기준을 만들어서»).
 *
 * 초만 적혀 있으면 25.5초가 빠른 건지 느린 건지 알 수가 없다. 리그 안 백분위로
 * 다섯 칸을 나눠 말로 적는다. 값은 ★리그 안 상대 위치★ 라 리그가 커지면 같이 움직인다.
 * 백분위가 높을수록 빠르다 (`clanTraitsV2` 의 tempo 정규화 방향).
 */
function tempoTier(pct: number): string {
  if (pct >= 80) return '매우 빠름'
  if (pct >= 60) return '빠른 편'
  if (pct >= 40) return '보통'
  if (pct >= 20) return '느린 편'
  return '매우 느림'
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
    /* 게임템포는 등수가 아니라 ★초 + 기준★ 이다 (2026-09-12 사장님) */
    if (key === 'tempo') return { label: label[key], value: axis.value * 100, note: axis.text, noteColor: '#a9c3ff', note2: tempoTier(axis.value * 100) }
    /*
     * ★«42개중 28위»★ (2026-09-12 사장님: «클랜 몇개중 몇위 이렇게 해주고»).
     * 등수만 적으면 몇 팀 중인지를 몰라 28위가 잘한 건지 못한 건지 안 보인다.
     * 모집단을 못 세면 등수만 적는다 — 지어내지 않는다.
     */
    /* ★싸움 3위 · 나머지 5위★ (2026-09-12 사장님). 까닭은 `rankColorHexAxis` 주석에 */
    if (axis.rank !== null) return { label: label[key], value: axis.value * 100, note: `${axis.rank}위`, noteColor: rankColorHexAxis(axis.rank, key === 'sniperDuel'), note2: axis.total === null ? null : `${fmt(axis.total)}개중` }
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
     ★1~3위 불 · 4~6위 먹구름 · 7위부터 흰구름★ (2026-09-12 사장님이 경계를 이렇게 확정). 다른 구간·SPL·열산 어디에도 안 준다 */
  const plateRank = data.rank ?? 999
  const plate: 'fire' | 'dark' | 'light' | null =
    data.division === 1 && data.league.category === 'independent'
      ? plateRank <= 3 ? 'fire' : plateRank <= 6 ? 'dark' : 'light'
      : null
  const theme = clanThemeOf(data.clan.slug)
  const rank = data.rank
  const ink = rank === null ? V3.textMuted : rankColor(rank)
  const games = data.win + data.lose
  const tier = tierWins.length > 0 ? tierWins[tierIndex % tierWins.length] : null
  const tierRate = tier && tier.win + tier.lose > 0 ? (tier.win / (tier.win + tier.lose)) * 100 : null
  /* ★티어는 IPL 만★ (2026-09-12 사장님: «SPL티어 없애»). 규칙은 계약의 `showsTier` 한 곳 */
  const tiered = showsTier(data.league.slug) && data.league.division_count >= 2
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
        {/*
          ★육각형이 왼쪽★ (2026-09-12 사장님: «클랜 플레이 스타일 파트를 없애고
          그 그래프를 그냥 메인 카드 왼쪽에 배치해줄 수 있어?»).

          옛 판은 이 그림을 ★따로 「플레이스타일」 탭★ 에 뒀고(2026-09-11) 카드에는
          `showHexagon={false}` 로 안 그렸다. 탭을 없애고 카드로 데려왔다.
          ⚠ `showHexagon` 은 남긴다 — 되돌릴 자리다 (`CLAUDE.md` 1-4).
        */}
        {showHexagon ? (
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Hexagon axes={clanHexAxes(data.hexagon_v2)} id="clanHex" />
            {/* ★클랜평 세 마디★ — 유형 · 템포 · 강한 축 (2026-09-12 사장님 확정) */}
            <ClanStyleLine hex={data.hexagon_v2} />
          </div>
        ) : null}
        {/* ★주전 다섯★ — 카드 남는 자리 (2026-09-12 사장님) */}
        <MainLineup data={data} theme={theme} />
        <div style={{ position: 'relative', flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
      </div>
    </section>
  )
}

/**
 * ★주전 다섯★ — 라플 넷 + 스나 하나 (2026-09-12 사장님).
 *
 * > «메인카드 남는공간에 클랜 메인스나(1명 클랜내에서 가장 순위가 높은 스나)
 * >  메인라플 4명(클랜 내 라플순위 1,2,3,4등) 5명 세로로 나열해줘
 * >  라플4명부터 나열하고 마지막 젤 아래가 스나 (…) 5명이 안되는 클랜은 그냥 없음»
 *
 * 줄 수는 ★언제나 다섯★ 이다. 모자란 자리는 «없음» 이라고 적는다 —
 * 자리를 없애면 카드 높이가 클랜마다 달라져 목록이 들쭉날쭉해진다.
 * 차례를 서버가 정해서 준다 (`main_lineup`) — 화면에서 다시 줄 세우지 않는다.
 */
function MainLineup({ data, theme }: { data: LeagueClanShow; theme: ClanTheme }) {
  const rows = data.main_lineup ?? []
  /* 라플 넷 · 스나 하나 — 자리마다 무엇이 와야 하는지 여기서 정한다 */
  const slots: (0 | 1)[] = [0, 0, 0, 0, 1]
  const rifles = rows.filter((row) => row.weapon === 0)
  const snipers = rows.filter((row) => row.weapon === 1)
  /**
   * ★들어올 때는 접혀 있다★ (2026-09-12 사장님: «추천 글씨를 주요멤버 라고 적고
   * 얇은띠로 접어놔 일단 그리고 누르면 나오게끔 해줘»).
   *
   * 다섯 줄이 늘 펴져 있으면 머리 카드가 화면 한 판을 다 먹는다. 띠 한 줄로 접어 둔다.
   */
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', flex: open ? '0 1 210px' : '0 0 auto', minWidth: 168, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((now) => !now)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', padding: '6px 8px', fontFamily: 'inherit', cursor: 'pointer',
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', whiteSpace: 'nowrap',
          color: open ? '#cfe0ff' : V3.textDim,
          background: open ? 'rgba(91,141,255,.12)' : 'rgba(255,255,255,.03)',
          border: `1px solid ${open ? 'rgba(159,192,255,.45)' : V3.cardBorder}`,
          borderRadius: V3.radiusChip,
        }}
      >
        <span>주요멤버</span>
        <span style={{ fontSize: 9, color: V3.textGhost }}>{open ? '▲' : '▼'}</span>
      </button>
      {!open ? null : slots.map((weapon, index) => {
        const row = weapon === 0 ? rifles[index] : snipers[0]
        return (
          <span
            key={`${weapon}-${index}`}
            style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 7, padding: '5px 2px', borderTop: index === 0 ? 'none' : '1px solid #18222f' }}
          >
            {row ? <MarkCircle clan={data.clan} size={18} /> : <span aria-hidden style={{ width: 18, height: 18 }} />}
            <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: row ? theme.ink : V3.textGhost2 }}>
              {row ? row.player.name : '없음'}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', color: row ? (weapon === 1 ? V3.redSoft : V3.textDim) : V3.textGhost2 }}>
              {weapon === 1 ? '스나수' : '라플수'}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * ★클랜평★ (2026-09-12 사장님: «유형 템포 강한 축 ㄱㄱ»).
 *
 * 규칙과 까닭은 `clanStyleNote.ts` 한 곳에 있다 — 여기서는 그리기만 한다.
 * 한 축이라도 못 쟀으면 `null` 이라 아무것도 안 그린다 (반쪽 자료로 평하지 않는다).
 */
function ClanStyleLine({ hex }: { hex: ClanHexagonV2 | null }) {
  const note = clanStyleNote(hex)
  if (!note) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, maxWidth: 320, padding: '0 8px 2px', textAlign: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: '#cfe0ff', padding: '3px 10px', borderRadius: 999, background: 'rgba(91,141,255,.14)', border: '1px solid rgba(159,192,255,.4)', whiteSpace: 'nowrap' }}>
          {note.type}
        </span>
        <span style={{ fontSize: 10.5, color: V3.textDim }}>{note.typeNote}</span>
      </span>
      <span style={{ fontSize: 10.5, color: V3.textFaint, lineHeight: 1.5 }}>{note.tempo}</span>
      <span style={{ fontSize: 10.5, color: '#c9a94a', lineHeight: 1.5 }}>{note.praise}</span>
    </div>
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
