'use client'

/**
 * ★선수 상세 v3 본문★ (2026-09-10 · 사장님 시안 `PlayerDetailV3.tsx` 를 실데이터로)
 *
 *   ├ 2단 (높이 stretch)
 *   │   ├ 좌: 구간별 전적 — 점수 · 등수 → 구간 칩 → VS 구간 → 승률/킬뎃 → 판킬 → MVP → 🚨핵의심
 *   │   └ 우: STRENGTH POINT — 여섯 축 + 10위 이내 특성 배지
 *   ├ 승률 및 킬뎃 추이 (DAY = 최근 날짜별 · WEEK = 주간)
 *   └ 최근 경기 (행 클릭 → 스코어보드)
 *
 * 없는 값은 비운다. 라운드 점수·세이브 횟수는 경기 API 에 없어 그리지 않는다 (지어내지 않는다).
 * 옛 화면(`LeaguePlayerRecordScreen` 의 `TierBreakdown` · `WeeklyTrendCard` · `MatchCard`)은
 * 지우지 않았다 — 부르지 않을 뿐이다 (`CLAUDE.md` 1-4).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { LeaguePlayerDetail, MatchDetail, MatchListItem, MatchPlayerStat, PlayerDayRecord, WeeklyPoint } from '@sacloud/contract'
import { rankColor, statColor } from './rankColors'
import { Hexagon, type HexAxisView } from './Hexagon'
import { AnalysisPanelV3 } from './AnalysisPanelV3'
import { MatchHexagonV3 } from './MatchHexagonV3'
import { Card, CardHead, Kda, MarkCircle, MvpBadge, RankText, SectionBar, SniperMark, TierText, clanThemeOf, fitMarkUrl, hasFitMark, relativeKst } from './primitives'
import { WIN_LOSS, V3, cardStyle, chipStyle, fmt, pct1, spacerStyle } from './tokens'
import { formatRating } from '../common/format'
import { TrendChartV3, type TrendMode } from './TrendChartV3'
import { teamSnapOf } from './ClanDetailV3'

const MVP_LEGACY_UNKNOWN_NOTICE = false
/* 2026-09-11 사장님 목업: 구간 카드(승률·킬뎃·MVP·핵의심)는 ★머리 카드★(PlayerHeaderV3 · 레이아웃)로 올라갔다.
   true 로 되돌리면 옛 두 장 배치가 그대로 돌아온다 (`CLAUDE.md` 1-4) */
const TIER_CARD_IN_BODY = false
/* 2026-09-11 사장님: «누가 스나이퍼인지 안 떠 — 워터마크 폐지, 닉 옆에 빨간 (S)». 워터마크(SNIPER·ME)는 스위치로만 남긴다 */
const SCORE_WATERMARKS = false

const halfStyle: CSSProperties = { marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 16, alignItems: 'stretch' }
const halfCardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', ...cardStyle }
const statRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'baseline', gap: 12, padding: '9px 0', borderTop: `1px solid ${V3.rowDivider2}` }
/* 2026-09-11 사장님: 경기 카드를 폰 모양 한 가지로 통일한다 — 두 칸 × 세 줄.
   1줄 승패·맵·시각 / 자리   2줄 양 팀 / MVP·킬뎃   3줄 상대 티어 / 펼치기 */
const matchRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', rowGap: 7, columnGap: 12, padding: '13px 18px', cursor: 'pointer' }
const playerRowStyle: CSSProperties = { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 104px 74px', gap: 10, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${V3.rowDivider2}` }
const playerRowSavesStyle: CSSProperties = { ...playerRowStyle, gridTemplateColumns: 'minmax(0,1fr) 104px 60px 74px' }

export interface PlayerDetailV3Props {
  data: LeaguePlayerDetail
  leagueSlug: string
  matches: readonly MatchListItem[]
  matchesLoading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  expanded: Readonly<Record<string, MatchDetail>>
  onExpand: (match: MatchListItem) => void
  report: { count: number; reported: boolean; pending: boolean; message: string | null; onReport: () => void }
}

/* ── 구간별 전적 ─────────────────────────────────────────────── */

function TierRecordCard({ data, report, ownTier }: { data: LeaguePlayerDetail; report: PlayerDetailV3Props['report']; ownTier: number | null }) {
  const rows = data.tier_breakdown
  const played = rows.filter((r) => r.games > 0)
  /* 기본 칩 = ★내 클랜의 티어★(최근 경기에서 읽음 · QA 교차검토 9-14). 모르면 가장 많이 뛴 티어. 누르면 그것이 우선 */
  const [picked, setPicked] = useState<number | null>(null)
  const mostPlayed = played.length > 0 ? played.reduce((a, b) => (b.games > a.games ? b : a)).tier : rows[0]?.tier ?? 1
  const tier = picked ?? (ownTier !== null && rows.some((r) => r.tier === ownTier) ? ownTier : mostPlayed)
  const setTier = setPicked
  const sel = rows.find((r) => r.tier === tier) ?? null
  const hex = data.hex
  const score = hex?.score ?? null
  const scoreRank = hex?.score_rank ?? null
  const games = sel?.games ?? 0
  const hasData = games >= 10
  const mvpRate = sel && games > 0 ? (sel.mvp / games) * 100 : null
  /* MVP 자료가 있는 리그인가 — 시즌 전체 MVP 가 0 이고 판이 있으면 원본에 MVP 가 없는 것 (IPL 병영 로그). 0 으로 찍지 않는다 */
  /* 2026-09-11: MVP 규칙(세이브 2회↑ → 킬↑데스↓)이 모든 리그·모든 판에 붙었다 — «자료에 MVP 없음» 안내는 접는다.
     옛 판단은 LEGACY 스위치로 남긴다 (QA 교차검토 3번: 0회 선수에게 «자료에 MVP 가 없습니다» 가 떴다) */
  const mvpKnown = MVP_LEGACY_UNKNOWN_NOTICE ? data.mvp_count > 0 || rows.every((r) => r.games === 0) : true
  const tieredLeague = data.league.division_count >= 2
  return (
    <div style={halfCardStyle}>
      <CardHead>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, whiteSpace: 'nowrap' }}>
          {score !== null ? (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{formatRating(score)}</span>
              {scoreRank !== null ? <RankText rank={scoreRank} color={rankColor(scoreRank)} /> : null}
            </>
          ) : hex ? (
            /* 점수 리그인데 아직 10판 미만 — 래더로 떨어지지 않는다 (QA 회차 2 · 띠와 같은 규칙) */
            <span style={{ fontSize: 13, fontWeight: 700, color: V3.textMuted }}>실력 점수 측정 중 · {fmt(hex.games)}판</span>
          ) : (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{formatRating(data.rating)}</span>
              {data.rank !== null ? <RankText rank={data.rank} color={rankColor(data.rank)} /> : null}
            </>
          )}
        </span>
      </CardHead>
      {tieredLeague ? (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '10px 18px 12px', borderBottom: `1px solid ${V3.rowDivider}` }}>
          {rows.map((r) => (
            <span key={r.tier} onClick={() => setTier(r.tier)} style={chipStyle(r.tier === tier)}>
              <TierText division={r.tier} leagueCategory={data.league.category} size={11} />
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${V3.rowDivider}` }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap', minWidth: 0 }}>
          <span style={{ fontSize: 11, color: V3.textGhost2, letterSpacing: '.1em' }}>VS</span>
          {tieredLeague && sel ? <TierText division={sel.tier} leagueCategory={data.league.category} size={16} /> : <span style={{ fontSize: 15, color: V3.textMuted }}>전체</span>}
        </span>
        <div style={spacerStyle} />
        <span style={{ fontSize: 11.5, color: games === 0 ? '#3f4c66' : hasData ? V3.textMuted : V3.textFaint, whiteSpace: 'nowrap' }}>{fmt(games)}판</span>
      </div>
      {sel && hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 18px 6px' }}>
          <StatRow label="승률">
            <Pair sub={`${sel.win}승 ${sel.lose}패`} value={pct1(sel.win_rate)} color={sel.win_rate === null ? V3.textMuted : statColor(sel.win_rate)} />
          </StatRow>
          {/* 킬뎃은 어느 구간이든 스나·라플로 나눠 적는다 (2026-09-11 사장님: «라플킬뎃 스나킬뎃 분리») */}
          <StatRow label="킬뎃">
            <Pair tag="스나" sub={`${sel.sniper_kill}/${sel.sniper_death}`} value={pct1(sel.sniper_kd)} color={sel.sniper_kd === null ? V3.textMuted : statColor(sel.sniper_kd)} small />
            <Pair tag="라플" sub={`${sel.rifle_kill}/${sel.rifle_death}`} value={pct1(sel.rifle_kd)} color={sel.rifle_kd === null ? V3.textMuted : statColor(sel.rifle_kd)} small />
          </StatRow>
        </div>
      ) : (
        <div style={{ padding: '14px 18px 8px', fontSize: 11.5, color: V3.textGhost2 }}>10판 이상 기록이 쌓이면 승률·킬뎃을 표시합니다</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 18px 16px' }}>
        <StatRow label="판킬">
          {sel && (sel.sniper_kill_per_match !== null || sel.rifle_kill_per_match !== null) ? (
            <>
              <Pair tag="스나" sub="" value={sel.sniper_kill_per_match === null ? '-' : sel.sniper_kill_per_match.toFixed(1)} color={V3.text} small />
              <Pair tag="라플" sub="" value={sel.rifle_kill_per_match === null ? '-' : sel.rifle_kill_per_match.toFixed(1)} color={V3.text} small />
            </>
          ) : (
            <Pair sub="시즌 전체" value={data.kill_per_match.toFixed(1)} color={V3.text} />
          )}
        </StatRow>
        <StatRow label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, color: V3.gold }}>★</span><span>MVP</span></span>}>
          {mvpKnown ? (
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{fmt(games)}판 중</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: V3.gold }}>{sel?.mvp ?? 0}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#c9a94a' }}>회</span>
              </span>
              <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>{pct1(mvpRate)}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: V3.textGhost, whiteSpace: 'nowrap' }}>이 리그 자료에 MVP 가 없습니다</span>
          )}
        </StatRow>
        <ReportButton report={report} />
      </div>
    </div>
  )
}

function StatRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={statRowStyle}>
      <span style={{ fontSize: 12, color: V3.textDim, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>{children}</span>
    </div>
  )
}

function Pair({ tag, sub, value, color, small }: { tag?: string; sub: string; value: string; color: string; small?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: small ? 5 : 9, whiteSpace: 'nowrap', flex: 'none' }}>
      {tag ? <span style={{ fontSize: 9.5, color: V3.textGhost, letterSpacing: '.06em' }}>{tag}</span> : null}
      <span style={{ fontSize: small ? 10 : 11, color: V3.textGhost2 }}>{sub}</span>
      <span style={{ fontSize: small ? 15 : 17, fontWeight: 600, color }}>{value}</span>
    </span>
  )
}

function ReportButton({ report }: { report: PlayerDetailV3Props['report'] }) {
  const on = report.reported
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
      <button
        type="button"
        onClick={report.onReport}
        disabled={report.pending}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, cursor: report.pending ? 'wait' : 'pointer', fontFamily: 'inherit', background: on ? 'rgba(224,27,36,.12)' : 'rgba(224,27,36,.05)', border: `1px solid ${on ? 'rgba(255,90,99,.55)' : 'rgba(224,27,36,.3)'}`, boxShadow: on ? '0 0 16px rgba(224,27,36,.22)' : 'none', width: '100%' }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, flex: 'none' }}>🚨</span>
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#ff6b6b' : '#c98f95' }}>핵의심</span>
        <div style={spacerStyle} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: on ? '#ff6b6b' : '#c98f95' }}>{fmt(report.count)}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? '#c96b6b' : V3.textDim }}>회</span>
        </span>
      </button>
      {report.message ? <span style={{ fontSize: 10.5, color: V3.textDim }}>{report.message}</span> : null}
    </div>
  )
}

/* ── STRENGTH POINT ───────────────────────────────────────────── */

function strengthAxes(data: LeaguePlayerDetail): HexAxisView[] {
  const hex = data.hex
  if (!hex) return []
  return hex.axes.map((a) => ({
    label: a.label,
    value: a.percentile,
    note: a.rank === null ? '측정중' : `${a.rank}위`,
    noteColor: a.rank === null ? V3.textGhost : rankColor(a.rank),
    /* ★10위 안은 더 세게★ (2026-09-11 사장님) */
    strong: a.rank !== null && a.rank <= 10,
  }))
}

function StrengthCard({ data }: { data: LeaguePlayerDetail }) {
  const hex = data.hex
  const axes = strengthAxes(data)
  const badges = hex ? hex.axes.filter((a) => a.badge !== null && a.rank !== null) : []
  return (
    <div style={halfCardStyle}>
      <CardHead title={<span style={{ letterSpacing: '.06em' }}>STRENGTH POINT</span>} right={
        <span style={{ fontSize: 10.5, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
          {hex ? `시즌 Cloud 0 · ${fmt(hex.games)}전 기준` : '시즌 Cloud 0'}
        </span>
      } />
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '8px 18px 14px', flexWrap: 'wrap', gap: 12 }}>
        {hex && !hex.measuring ? (
          /* 2026-09-11: 머리 카드가 빠져 이 카드가 한 줄을 다 쓴다 → 육각형을 키운다 (300px 고정 그림을 배율로) */
          <span className="v3-hex-zoom" style={{ display: 'block', width: 300 * 1.55, height: 262 * 1.55 }}>
            <span style={{ display: 'block', transform: 'scale(1.55)', transformOrigin: 'top left' }}>
              <Hexagon axes={axes} id="playerHex" />
            </span>
          </span>
        ) : (
          <div style={{ padding: '28px 8px', fontSize: 12, color: V3.textGhost, textAlign: 'center', lineHeight: 1.7 }}>
            {hex ? (
              <>한 무기로 10판 이상 쌓이면 여섯 축을 잽니다<br /><span style={{ color: V3.textGhost2 }}>지금 {fmt(hex.weapon_games)}판</span></>
            ) : (
              <>여섯 축은 30분마다 접힙니다 · 아직 이 선수의 줄이 없습니다</>
            )}
          </div>
        )}
      </div>
      {badges.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 18px 16px' }}>
          <span style={{ fontSize: 9.5, color: V3.textGhost2, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>특성</span>
          {badges.map((a) => (
            <span key={a.key} title={a.desc} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 8px', borderRadius: 999, whiteSpace: 'nowrap', background: 'linear-gradient(100deg,rgba(255,216,61,.16),rgba(255,216,61,.04))', border: '1px solid rgba(255,216,61,.5)', boxShadow: '0 0 14px rgba(255,216,61,.18)' }}>
              <BadgeIcon kind={a.key === 'save' ? 'shield' : 'trend'} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#ffe89a' }}>{a.badge}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#c9a94a' }}>{a.rank}위</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BadgeIcon({ kind }: { kind: 'shield' | 'trend' }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flex: 'none', display: 'block' }} aria-hidden>
      {kind === 'shield' ? (
        <>
          <path d="M12 2.6 L20 6 V12.4 C20 17 16.6 20.4 12 21.6 C7.4 20.4 4 17 4 12.4 V6 Z" fill="rgba(255,216,61,.14)" stroke={V3.gold} strokeWidth={1.5} strokeLinejoin="round" />
          <path d="M8.4 12.2 L11.2 15 L16 9.6" fill="none" stroke={V3.gold} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M3.5 17.5 L9 11.4 L13 14.6 L20.5 6.5" fill="none" stroke={V3.gold} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.4 6.2 H20.8 V11.6" fill="none" stroke={V3.gold} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="11.4" r="1.7" fill={V3.gold} />
        </>
      )}
    </svg>
  )
}

/* ── 추이 차트 ────────────────────────────────────────────────── */

const KX0 = 44
const KX1 = 500
/* 세로축 — 기본 20~80 (시안). 값이 그 밖이면 0~100 까지 넓힌다. 잘라서 거짓말하지 않는다 */
function yScaleOf(points: readonly TrendPoint[]): { lo: number; hi: number; ticks: number[] } {
  const vals = points.flatMap((p) => [p.winRate, p.kd]).filter((v): v is number => v !== null)
  const lo = vals.some((v) => v < 20) ? 0 : 20
  const hi = vals.some((v) => v > 80) ? 100 : 80
  const ticks = lo === 0 && hi === 100 ? [0, 25, 50, 75, 100] : lo === 0 ? [0, 20, 40, 60, 80] : hi === 100 ? [20, 40, 60, 80, 100] : [20, 40, 60, 80]
  return { lo, hi, ticks }
}

interface TrendPoint {
  label: string
  winRate: number | null
  kd: number | null
}

function TrendChart({ points, markSlug, clan, winLabel, kdLabel }: { points: TrendPoint[]; markSlug: string | null; clan: LeaguePlayerDetail['clan']; winLabel: string; kdLabel: string }) {
  const n = points.length
  const scale = yScaleOf(points)
  const ky = (v: number) => 236 - ((Math.max(scale.lo, Math.min(scale.hi, v)) - scale.lo) / (scale.hi - scale.lo)) * 210
  const xOf = (i: number) => (n <= 1 ? KX1 : KX0 + ((KX1 - KX0) * i) / (n - 1))
  const line = (pick: (p: TrendPoint) => number | null) => {
    const segs: string[] = []
    let cur: string[] = []
    points.forEach((p, i) => {
      const v = pick(p)
      if (v === null) { if (cur.length) segs.push(cur.join(' ')); cur = []; return }
      cur.push(`${xOf(i).toFixed(1)},${ky(v).toFixed(1)}`)
    })
    if (cur.length) segs.push(cur.join(' '))
    return segs
  }
  const wr = line((p) => p.winRate)
  const kd = line((p) => p.kd)
  const lastWr = [...points].reverse().find((p) => p.winRate !== null)?.winRate ?? null
  const lastKd = [...points].reverse().find((p) => p.kd !== null)?.kd ?? null
  const labelIdx = n <= 6 ? points.map((_, i) => i) : [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n - 1]
  return (
    <div style={{ padding: '6px 12px 10px', background: V3.plot }}>
      <svg viewBox="0 0 640 300" style={{ width: '100%', height: 300, display: 'block' }}>
        <defs>
          <filter id="kdGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="g1" />
            <feGaussianBlur stdDeviation="16" result="g2" />
            <feMerge><feMergeNode in="g2" /><feMergeNode in="g1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="640" height="300" fill={V3.plot} />
        <text x="272" y="150" textAnchor="middle" fontSize="62" fontWeight="900" fill="#dff2ff" opacity="0.05" letterSpacing="6">CLOUD 0</text>
        {scale.ticks.map((g) => (
          <g key={g}>
            <line x1={KX0} y1={ky(g)} x2={KX1} y2={ky(g)} stroke="#111826" />
            <text x={KX0 - 8} y={ky(g) + 4} textAnchor="end" fill={V3.textDim} fontSize="11">{g}</text>
          </g>
        ))}
        {labelIdx.map((i, k) => (
          <g key={`${i}-${k}`}>
            {k > 0 && k < labelIdx.length - 1 ? <line x1={xOf(i)} y1={26} x2={xOf(i)} y2={236} stroke="#111826" strokeDasharray="3 5" /> : null}
            <text x={xOf(i)} y={264} textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'} fill={V3.textDim} fontSize="11">{points[i]?.label ?? ''}</text>
          </g>
        ))}
        <line x1={KX1} y1={20} x2={KX1} y2={242} stroke="#2b3a58" />
        <text x={KX1} y={16} textAnchor="middle" fill="#8f9bb5" fontSize="13" fontWeight="700">today</text>
        {n === 0 ? <text x="272" y="140" textAnchor="middle" fill={V3.textGhost} fontSize="13">아직 찍힌 날이 없습니다</text> : null}
        {wr.map((p, i) => (
          <g key={`w${i}`}>
            <polyline points={p} fill="none" stroke={V3.blue} strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" filter="url(#kdGlow)" opacity={0.42} />
            <polyline points={p} fill="none" stroke="#7fa9ff" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={p} fill="none" stroke="#dbe8ff" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </g>
        ))}
        {kd.map((p, i) => (
          <g key={`k${i}`}>
            <polyline points={p} fill="none" stroke={V3.red} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" filter="url(#kdGlow)" opacity={0.5} />
            <polyline points={p} fill="none" stroke="#ff5a63" strokeWidth={6.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={p} fill="none" stroke="#ffd7da" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </g>
        ))}
        {lastWr !== null ? (
          <>
            {markSlug && hasFitMark(markSlug) ? (
              <image href={fitMarkUrl(markSlug)} x={KX1 - 10} y={ky(lastWr) - 10} width="20" height="20" clipPath="circle(10px at 10px 10px)" />
            ) : (
              <circle cx={KX1} cy={ky(lastWr)} r={10} fill={V3.chip} stroke="#7fa9ff" strokeWidth={1.6} />
            )}
            <text x={KX1 + 16} y={ky(lastWr) + 5} textAnchor="start" fill="#dbe8ff" fontSize="15" fontWeight="700">{lastWr.toFixed(1)}%</text>
            <text x={KX1 + 16} y={ky(lastWr) + 19} textAnchor="start" fill="#8fa9d8" fontSize="9.5" fontWeight="700">{winLabel}</text>
          </>
        ) : null}
        {lastKd !== null ? (
          <>
            <circle cx={KX1} cy={ky(lastKd)} r={10} fill={V3.chip} stroke="#ff5a63" strokeWidth={1.6} />
            <text x={KX1} y={ky(lastKd) + 3} textAnchor="middle" fill="#ffd7da" fontSize="8.5" fontWeight="700">K/D</text>
            <text x={KX1 + 16} y={ky(lastKd) + 5} textAnchor="start" fill="#ffd7da" fontSize="15" fontWeight="700">{lastKd.toFixed(1)}%</text>
            <text x={KX1 + 16} y={ky(lastKd) + 19} textAnchor="start" fill="#c98f95" fontSize="9.5" fontWeight="700">{kdLabel}</text>
          </>
        ) : null}
        {clan === null ? null : null}
      </svg>
    </div>
  )
}

/* 서버는 최근 것이 먼저다 — 그래프는 왼쪽이 옛날이어야 하므로 날짜로 오름차순 정렬한다 */
function dayPoints(days: readonly PlayerDayRecord[]): TrendPoint[] {
  return [...days]
    .filter((d) => d.played && d.games >= 2)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ label: d.label, winRate: d.win_rate, kd: d.kd_rate }))
}
function weekPoints(points: readonly WeeklyPoint[]): TrendPoint[] {
  return [...points]
    .filter((p) => p.played)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => ({ label: p.start.slice(5).replace('-', '/'), winRate: p.win_rate, kd: p.kd }))
}

/** ⚠ 옛 추이 카드(`TrendChart` · 최근 3일/주간)는 아래에 그대로 있다. 2026-09-10 부터는 사장님 지시서대로 `TrendChartV3` 가 그린다 */
function TrendCard({ data }: { data: LeaguePlayerDetail }) {
  const [mode, setMode] = useState<TrendMode>('day')
  const today = data.trend.find((d) => d.today) ?? null
  /* DAY 마커는 «경기가 있던 마지막 날» 값을 잇는다 — 오늘 0판이면 «오늘 0승 0패 83%» 처럼 읽혀 헷갈렸다 (QA 교차검토 16번)
     → 오늘 판이 있으면 «오늘», 없으면 그 날짜를 적는다 */
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const dayRef = today && today.win + today.lose > 0 ? { d: today, name: '오늘' } : lastPlayed ? { d: lastPlayed, name: lastPlayed.label } : null
  return (
    <Card style={{ marginTop: 16 }}>
      <CardHead title="승률 및 킬뎃 추이" ribbon={V3.red} right={
        <span style={{ display: 'flex', gap: 5 }}>
          <span onClick={() => setMode('day')} style={chipStyle(mode === 'day')}>DAY</span>
          <span onClick={() => setMode('cum')} style={chipStyle(mode === 'cum')}>누적</span>
        </span>
      }>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}><span style={{ width: 15, height: 2, background: '#ff5a63' }} /><span style={{ fontSize: 11, color: V3.textFaint }}>킬뎃</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 2, background: '#7fa9ff' }} /><span style={{ fontSize: 11, color: V3.textFaint }}>승률</span></span>
        <span style={{ fontSize: 10.5, color: V3.textGhost2, minWidth: 0 }}>매일 새벽 6시에 찍힙니다 · 2판 미만인 날은 찍히지 않습니다 · 그래프를 움직여 날짜별 기록을 봅니다</span>
      </CardHead>
      <TrendChartV3
        days={data.trend}
        mode={mode}
        seed={data.player.id}
        markSlug={data.clan?.slug ?? null}
        winLabel={mode === 'day' ? (dayRef ? `${dayRef.name} ${dayRef.d.win}승 ${dayRef.d.lose}패` : '아직 경기 없음') : `누적 ${data.win}승 ${data.lose}패`}
        kdLabel={mode === 'day' ? (dayRef ? `${dayRef.name} ${dayRef.d.kill}킬 ${dayRef.d.death}데스` : '') : data.kill !== null && data.death !== null ? `누적 ${fmt(data.kill)}킬 ${fmt(data.death)}데스` : ''}
      />
    </Card>
  )
}

function TrendCardLegacy({ data }: { data: LeaguePlayerDetail }) {
  const [range, setRange] = useState<'DAY' | 'WEEK'>('DAY')
  const points = useMemo(() => (range === 'DAY' ? dayPoints(data.recent_days) : weekPoints(data.weekly?.points ?? [])), [range, data])
  return (
    <Card style={{ marginTop: 16 }}>
      <CardHead title="승률 및 킬뎃 추이" ribbon={V3.red} right={
        <span style={{ display: 'flex', gap: 5 }}>
          {(['DAY', 'WEEK'] as const).map((r) => (
            <span key={r} onClick={() => setRange(r)} style={chipStyle(range === r)}>{r}</span>
          ))}
        </span>
      }>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}><span style={{ width: 15, height: 2, background: '#ff5a63' }} /><span style={{ fontSize: 11, color: V3.textFaint }}>킬뎃</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 2, background: '#7fa9ff' }} /><span style={{ fontSize: 11, color: V3.textFaint }}>승률</span></span>
        <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{range === 'DAY' ? '2판 미만인 날은 찍히지 않습니다' : '경기가 있던 주만 찍힙니다'}</span>
      </CardHead>
      <TrendChart
        points={points}
        markSlug={data.clan?.slug ?? null}
        clan={data.clan}
        winLabel={`${data.win}승 ${data.lose}패`}
        kdLabel={data.kill !== null && data.death !== null ? `${fmt(data.kill)}킬 ${fmt(data.death)}데스` : ''}
      />
    </Card>
  )
}
export { TrendCardLegacy }

/* ── 최근 경기 · 스코어보드 ───────────────────────────────────── */

function ScoreRow({ row, me, mvp, weaponKnown, showSaves, leagueSlug }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; showSaves: boolean; leagueSlug: string }) {
  const sniper = weaponKnown && row.weapon === 1
  const kd = row.kd_rate
  const clan = row.match_time_clan
  return (
    <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ ...(showSaves ? playerRowSavesStyle : playerRowStyle), background: me ? 'linear-gradient(100deg,rgba(143,240,255,.10),rgba(143,240,255,.02) 55%,transparent)' : 'transparent', boxShadow: me ? 'inset 3px 0 0 #8ff0ff, inset 0 0 26px rgba(143,240,255,.10)' : 'none' }}>
      {/* ★인식표★ — ASTRA 1~3위 먹구름 · 4~100위 흰구름 (2026-09-11 사장님). 글자 뒤에 깐다 */}
      {row.nameplate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${row.nameplate}`} /> : null}
      {SCORE_WATERMARKS && sniper ? <span aria-hidden style={{ position: 'absolute', left: '34%', top: '50%', transform: 'translate(-50%,-50%) skewX(-16deg) scaleY(0.9) scaleX(1.16)', fontSize: 25, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.5em', color: V3.red, opacity: 0.17, WebkitTextStroke: `3.4px ${V3.red}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>SNIPER</span> : null}
      {SCORE_WATERMARKS && me ? <span aria-hidden style={{ position: 'absolute', left: '66%', top: '50%', transform: 'translateY(-50%) skewX(-12deg) scaleY(0.92)', fontSize: 24, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.24em', color: '#8ff0ff', opacity: 0.14, WebkitTextStroke: '2.2px #8ff0ff', whiteSpace: 'nowrap', pointerEvents: 'none' }}>ME</span> : null}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <MarkCircle clan={clan ? { slug: clan.slug, mark: clan.mark } : null} size={20} />
        {/* 닉네임을 누르면 그 선수 화면으로 (2026-09-11 사장님). 줄 접힘과 안 겹치게 전파를 막는다 */}
        <a href={`/league/${leagueSlug}/player/${row.player_id}`} onClick={(e) => e.stopPropagation()} style={{ ...{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: me ? '#dff2ff' : '#c3cbdb' }, ...{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}>{row.name}</a>
        {sniper ? <SniperMark /> : null}
        {mvp ? <MvpBadge size={8.5} /> : null}
      </span>
      <span style={{ position: 'relative' }}><Kda kill={row.kill} death={row.death} assist={row.assist} /></span>
      {showSaves ? (
        <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : '#3f4c66' }}>{row.saves === null ? '-' : `${row.saves}/${row.save_chances ?? 0}`}</span>
      ) : null}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: kd === null ? V3.textGhost : statColor(kd) }}>{pct1(kd)}</span>
    </div>
  )
}

/** 스코어보드의 «우리 팀» — API 가 준 `viewer_side`. 없으면 명단의 소속으로 찾고, 그것도 없으면 red (2026-09-10 사장님 지적 — 팀이 뒤바뀌던 버그) */
export function viewerSideOf(detail: MatchDetail): 'red' | 'blue' {
  if (detail.viewer_side) return detail.viewer_side
  const ours = detail.league_clan.league_clan_id
  const redOurs = detail.red_stats.filter((s) => s.match_time_clan?.league_clan_id === ours).length
  const blueOurs = detail.blue_stats.filter((s) => s.match_time_clan?.league_clan_id === ours).length
  if (redOurs !== blueOurs) return redOurs > blueOurs ? 'red' : 'blue'
  return detail.player_stat?.side ?? 'red'
}

function Scoreboard({ detail, me, leagueCategory, leagueSlug }: { detail: MatchDetail; me: string; leagueCategory: string; leagueSlug: string }) {
  const mySide = viewerSideOf(detail)
  /* 2026-09-11 사장님: 집계 전 경기라고 세이브 칸이 통째로 사라지면 «없는 화면» 처럼 보인다 →
     칸은 늘 두고 아직 모르는 값만 «-» 로 적는다 (0 으로 채우지 않는다). 옛 판: [...].some((s) => s.saves !== null) */
  const showSaves = detail.red_stats.length + detail.blue_stats.length > 0
  const roundsOf = (side: 'red' | 'blue') => (side === 'red' ? detail.red_rounds : detail.blue_rounds)
  const teams = ([mySide, mySide === 'red' ? 'blue' : 'red'] as const).map((side) => {
    const stats = side === 'red' ? detail.red_stats : detail.blue_stats
    const ours = side === mySide
    const snap = teamSnapOf(detail, side, ours ? detail.league_clan : detail.opponent)
    const won = ours ? detail.win : !detail.win
    const theme = clanThemeOf(snap.clan.slug)
    return { side, stats, snap, won, theme }
  })
  /* ★경기분석★ (2026-09-11 사장님) — 누르면 그 팀 명단을 접고 그 자리에 이 판 육각형을 그린다.
     이긴 팀 파랑 · 진 팀 빨강 한 판 위에 겹쳐서. 버튼은 ★양 팀 다★ 달되 한 번에 하나만 펴진다.
     자료는 이미 이 응답에 실려 온다(`red_hexagon_v2`/`blue_hexagon_v2`) — 왕복이 늘지 않는다 */
  const [analysis, setAnalysis] = useState<'red' | 'blue' | null>(null)
  const hexOf = (side: 'red' | 'blue') => (side === 'red' ? detail.red_hexagon_v2 : detail.blue_hexagon_v2)?.hexagon ?? null
  /* 배틀로그가 없는 옛 경기는 버튼을 아예 안 그린다 (지어내지 않는다) */
  const canAnalyze = hexOf('red') !== null && hexOf('blue') !== null
  const wonTeam = teams.find((t) => t.won) ?? teams[0]
  const lostTeam = teams.find((t) => !t.won) ?? teams[1]
  return (
    <div style={{ background: '#0a0f1a', borderTop: `1px solid ${V3.divider}`, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {teams.map((t) => (
        /* ★이긴 팀 하늘색 · 진 팀 빨강★ (2026-09-12 사장님) */
        <div key={t.side} style={{ border: `1px solid ${t.won ? WIN_LOSS.winLine : WIN_LOSS.loseLine}`, borderRadius: 8, background: t.won ? WIN_LOSS.winBg : WIN_LOSS.loseBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderBottom: `1px solid ${V3.rowDivider}`, borderLeft: `2px solid ${t.theme.ink}` }}>
            <MarkCircle clan={t.snap.clan} size={22} />
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: t.won ? WIN_LOSS.winInk : WIN_LOSS.loseInk }}>{t.snap.clan.name}</span>
            {t.snap.division !== null ? <TierText division={t.snap.division} leagueCategory={leagueCategory} size={10} /> : null}
            <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: t.won ? V3.blueSoft : V3.redSoft }}>{t.won ? '승리' : '패배'}</span>
            <div style={spacerStyle} />
            {canAnalyze ? (
              <span
                onClick={(e) => { e.stopPropagation(); setAnalysis((now) => (now === t.side ? null : t.side)) }}
                style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', padding: '3px 9px', borderRadius: V3.radiusChip, color: analysis === t.side ? '#cfe0ff' : '#8fa9d8', border: `1px solid ${analysis === t.side ? 'rgba(159,192,255,.55)' : 'rgba(143,169,216,.32)'}`, background: analysis === t.side ? 'rgba(91,141,255,.16)' : 'transparent' }}
              >
                {analysis === t.side ? '명단' : '경기분석'}
              </span>
            ) : null}
            <span style={{ fontSize: 11, color: '#4e5b76', whiteSpace: 'nowrap' }}>
              {roundsOf(t.side) !== null && roundsOf(t.side === 'red' ? 'blue' : 'red') !== null ? `${roundsOf(t.side)}:${roundsOf(t.side === 'red' ? 'blue' : 'red')}` : t.side.toUpperCase()}
            </span>
          </div>
          {analysis === t.side ? (
            <div style={{ padding: '14px 10px 16px', display: 'flex', justifyContent: 'center' }}>
              <MatchHexagonV3
                won={wonTeam ? hexOf(wonTeam.side) : null}
                lost={lostTeam ? hexOf(lostTeam.side) : null}
                wonName={wonTeam?.snap.clan.name ?? '승리'}
                lostName={lostTeam?.snap.clan.name ?? '패배'}
                id={`mhex-${detail.id}-${t.side}`}
              />
            </div>
          ) : (
          <>
          <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ display: 'grid', gridTemplateColumns: showSaves ? 'minmax(0,1fr) 104px 60px 74px' : 'minmax(0,1fr) 104px 74px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 9.5, color: '#3f4c66', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
            <span>플레이어</span><span>K / D / A</span>{showSaves ? <span style={{ textAlign: 'right' }}>세이브</span> : null}<span style={{ textAlign: 'right' }}>킬뎃</span>
          </div>
          {t.stats.length === 0 ? <div style={{ padding: '10px 14px', fontSize: 11, color: V3.textGhost }}>기록이 없습니다</div> : null}
          {t.stats.map((row) => (
            <ScoreRow key={row.player_id} row={row} me={row.player_id === me} mvp={row.mvp === true} weaponKnown={row.weapon !== null} showSaves={showSaves} leagueSlug={leagueSlug} />
          ))}
          </>
          )}
        </div>
      ))}
    </div>
  )
}

function MatchRows({ data, leagueSlug, matches, expanded, onExpand }: Pick<PlayerDetailV3Props, 'data' | 'leagueSlug' | 'matches' | 'expanded' | 'onExpand'>) {
  const [open, setOpen] = useState<string | null>(null)
  /* 클랜 색은 이제 승패 색이 대신한다 (2026-09-12 사장님) — 지우지 않고 void 로 남긴다 */
  const theme = clanThemeOf(data.clan?.slug)
  void theme
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {matches.map((m) => {
        const isOpen = open === m.id
        const edge = m.win ? V3.blue : V3.red
        const my = m.player_stat
        const mvpIsMe = m.mvp_player_id !== null && m.mvp_player_id === data.player.id
        const detail = expanded[m.id]
        /* 명단이 아직 안 들어온 경기 — 펼치지 않는다 (2026-09-10 사장님: «킬데스 수집중») */
        const pending = m.red.length === 0 && m.blue.length === 0
        return (
          <div key={m.id} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: (m.win ? 'rgba(91,141,255,.13)' : 'rgba(255,90,99,.13)'), opacity: pending ? 0.75 : 1 }}>
            <div onClick={() => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }} style={{ ...matchRowStyle, cursor: pending ? 'default' : 'pointer' }} className="v3-prow">
              {/* 1줄 — 승패 · 맵 · 시각 / 오른쪽엔 그 경기에서 내 자리 */}
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>
                <span style={{ fontSize: 12, color: V3.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
                <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{relativeKst(m.start_at)}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {my?.participant_role ? (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 5, color: my.participant_role === 'mercenary' ? '#c9a35b' : V3.textMuted, background: my.participant_role === 'mercenary' ? 'rgba(201,163,91,.10)' : V3.chip, border: `1px solid ${my.participant_role === 'mercenary' ? 'rgba(201,163,91,.45)' : V3.chipBorder}` }}>
                    {my.participant_role === 'mercenary' ? '용병' : '클랜전'}
                  </span>
                ) : null}
              </span>
              {/* 2줄 — 양 팀 / 오른쪽엔 MVP · 킬뎃 */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {/* ★클랜명은 승패 색★ (2026-09-12 사장님) */}
                <MarkCircle clan={m.league_clan.clan} size={20} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.league_clan.clan.name}</span>
                <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
                <MarkCircle clan={m.opponent.clan} size={20} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.loseInk : WIN_LOSS.winInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.opponent.clan.name}</span>
              </span>
              <span className="v3-match-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                {pending ? <span style={{ fontSize: 11.5, color: '#8fa9d8', whiteSpace: 'nowrap' }}>킬데스 수집중</span> : my ? <Kda kill={my.kill} death={my.death} assist={my.assist} /> : <span style={{ fontSize: 11, color: V3.textGhost }}>기록 없음</span>}
                {my && my.kd_rate !== null ? <span style={{ fontSize: 13, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap', color: statColor(my.kd_rate) }}>{my.kd_rate.toFixed(1)}%</span> : null}
                {/* ★배지는 제일 오른쪽 끝★ (2026-09-11 사장님: 경기카드 통일) */}
                {mvpIsMe ? <MvpBadge size={8.5} /> : null}
              </span>
              {/* 3줄 — 상대 티어 / 오른쪽엔 펼치기 */}
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 9.5, color: V3.textGhost2, letterSpacing: '.08em' }}>vs</span>
                <TierText division={m.opponent.division} leagueCategory={data.league.category} size={10} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? '#3f4c66' : isOpen ? '#a9c3ff' : V3.textGhost }}>
                {pending ? '수집중' : <>상세 <span style={{ fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span></>}
              </span>
            </div>
            {isOpen ? (
              detail ? <Scoreboard detail={detail} me={data.player.id} leagueCategory={data.league.category} leagueSlug={data.league.slug} /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
            ) : null}
          </div>
        )
      })}
      <span style={{ display: 'none' }}>{leagueSlug}</span>
    </div>
  )
}


/* ── 클랜별 전적 (2026-09-11 사장님 목업) ─────────────────────── */

/**
 * 구간마다 한 칸. 밑의 마크 줄에서 상대를 누르면 ★제목이 그 클랜으로 바뀌고★ 숫자가 그 상대와의 기록이 된다.
 * 마크 줄은 ★많이 붙은 순★ 이다 (사장님: «상대로 많이 한 순서대로 앞쪽에»).
 * 킬뎃은 그 선수 무기 것 · 승률은 통합이다 (같은 날 확정).
 */
function ClanVsCard({ data }: { data: LeaguePlayerDetail }) {
  const rows = data.tier_breakdown.filter((r) => r.games > 0)
  const weapon = data.hex?.weapon ?? null
  const [picked, setPicked] = useState<Record<number, string | null>>({})
  const theme = clanThemeOf(data.clan?.slug)
  const tiered = data.league.division_count >= 2
  /* ★자기 구간★ = 가장 많이 뛴 구간 (워커의 homeTier 와 같은 규칙 — 같으면 높은 티어) */
  const homeTier = useMemo(() => {
    let best: number | null = null
    for (const r of rows) if (best === null || r.games > (rows.find((x) => x.tier === best)?.games ?? 0)) best = r.tier
    return best
  }, [rows])
  const [open, setOpen] = useState<number | null>(null)
  /* 아직 아무것도 안 건드렸으면 자기 구간을 편다 */
  const openTier = open === null ? homeTier : open
  return (
    <div style={{ marginTop: 16, ...cardStyle }}>
      <CardHead title="클랜별 전적" right={
        <span style={{ fontSize: 10.5, color: V3.textGhost2, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>시즌 Cloud 0 · {fmt(data.win + data.lose)}전 기준</span>
      } />
      {rows.length === 0 ? (
        <div style={{ padding: 18, fontSize: 12, color: V3.textGhost }}>아직 경기가 없습니다.</div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px 16px' }}>
        {rows.map((r) => {
          const opened = openTier === r.tier
          const toggle = () => {
            setPicked({})
            setOpen(opened ? -1 : r.tier)
          }
          if (!opened) {
            return (
              <div
                key={r.tier}
                onClick={toggle}
                style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'pointer', border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, background: V3.card, padding: '8px 12px' }}
              >
                <MarkCircle clan={data.clan} size={18} />
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.player.name}</span>
                <span style={{ fontSize: 9.5, color: '#3a4560', flex: 'none' }}>VS</span>
                {tiered ? (
                  <TierText division={r.tier} leagueCategory={data.league.category} size={11} />
                ) : (
                  <span style={{ fontSize: 11.5, color: V3.textMuted }}>전체</span>
                )}
                <div style={spacerStyle} />
                <span style={{ fontSize: 10.5, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(r.win)}승 {fmt(r.lose)}패</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: r.win_rate === null ? V3.textGhost : statColor(r.win_rate) }}>{pct1(r.win_rate)}</span>
                <span style={{ fontSize: 9, color: V3.textGhost, flex: 'none' }}>▼</span>
              </div>
            )
          }
          const sel = picked[r.tier] ?? null
          const opp = sel === null ? null : r.opponents.find((o) => o.league_clan_id === sel) ?? null
          /* 고른 상대가 있으면 그 상대 숫자, 없으면 구간 전체 */
          const win = opp ? opp.win : r.win
          const lose = opp ? opp.lose : r.lose
          const winRate = opp ? opp.win_rate : r.win_rate
          const kd = weapon === 1
            ? (opp ? opp.sniper_kd : r.sniper_kd)
            : weapon === 0
              ? (opp ? opp.rifle_kd : r.rifle_kd)
              : (opp ? opp.kd : r.kd)
          return (
            <div key={r.tier} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, background: V3.card, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <MarkCircle clan={data.clan} size={22} />
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.player.name}</span>
                <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
                {opp ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 700, color: clanThemeOf(opp.clan.slug).ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.clan.name}</span>
                    <MarkCircle clan={opp.clan} size={22} />
                    <div style={spacerStyle} />
                    <span onClick={() => setPicked((p) => ({ ...p, [r.tier]: null }))} style={{ fontSize: 10.5, color: V3.textGhost, cursor: 'pointer', whiteSpace: 'nowrap' }}>구간 전체</span>
                  </>
                ) : (
                  <>
                    {tiered ? (
                      <TierText division={r.tier} leagueCategory={data.league.category} size={12} />
                    ) : (
                      <span style={{ fontSize: 12.5, color: V3.textMuted }}>전체</span>
                    )}
                    <div style={spacerStyle} />
                  </>
                )}
                <span onClick={toggle} style={{ fontSize: 9, color: V3.textGhost, cursor: 'pointer', flex: 'none', marginLeft: 8 }}>▲</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 10, color: V3.textGhost, letterSpacing: '.06em' }}>K/D</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: kd === null ? V3.textGhost : statColor(kd) }}>{pct1(kd)}</span>
                <span style={{ width: 1, height: 11, background: V3.rowDivider }} />
                <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(win)}승 {fmt(lose)}패</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: winRate === null ? V3.textGhost : statColor(winRate) }}>{pct1(winRate)}</span>
              </div>
              {r.opponents.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                  {r.opponents.map((o) => (
                    <span
                      key={o.league_clan_id}
                      onClick={() => setPicked((p) => ({ ...p, [r.tier]: p[r.tier] === o.league_clan_id ? null : o.league_clan_id }))}
                      title={`${o.clan.name} · ${o.games}전`}
                      style={{ display: 'inline-flex', cursor: 'pointer', borderRadius: '50%', padding: 2, background: o.league_clan_id === sel ? 'rgba(91,141,255,.28)' : 'transparent', boxShadow: o.league_clan_id === sel ? '0 0 0 1px rgba(127,169,255,.8)' : undefined }}
                    >
                      <MarkCircle clan={o.clan} size={26} />
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 페이지 본문 ──────────────────────────────────────────────── */

export function PlayerDetailV3(props: PlayerDetailV3Props) {
  const { data, matches, matchesLoading, hasMore, loadingMore, onLoadMore } = props
  const [tab, setTab] = useState<'graph' | 'play' | 'clan'>('graph')
  return (
    <div>
      {TIER_CARD_IN_BODY ? (
        <div style={halfStyle}>
          <TierRecordCard data={data} report={props.report} ownTier={matches.find((m) => m.league_clan.clan.id === data.clan?.id)?.league_clan.division ?? null} />
          <StrengthCard data={data} />
        </div>
      ) : null}
      {/* ★탭 셋★ (2026-09-11 사장님 목업) — 그래프 · 플레이분석 · 클랜별전적 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 16 }}>
        {([['graph', '그래프'], ['play', '플레이분석'], ['clan', '클랜별전적']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '12px 0', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              borderRadius: V3.radiusCard, whiteSpace: 'nowrap',
              color: tab === key ? '#dbe8ff' : V3.textMuted,
              background: tab === key ? 'rgba(91,141,255,.12)' : V3.card,
              border: `1px solid ${tab === key ? 'rgba(127,169,255,.7)' : V3.cardBorder}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'graph' ? <TrendCard data={data} /> : null}
      {tab === 'play' ? (
        /* PC 는 왼쪽에 «어떻게 재는가», 오른쪽에 육각형 (2026-09-11 사장님). 폰은 육각형만 */
        <div className="v3-play-split" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <AnalysisPanelV3 />
          <StrengthCard data={data} />
        </div>
      ) : null}
      {tab === 'clan' ? <ClanVsCard data={data} /> : null}
      <SectionBar title="최근 경기" />
      {matchesLoading ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>불러오는 중…</div>
      ) : matches.length === 0 ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>아직 경기가 없습니다.</div>
      ) : (
        <MatchRows data={data} leagueSlug={props.leagueSlug} matches={matches} expanded={props.expanded} onExpand={props.onExpand} />
      )}
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} style={{ marginTop: 10, width: '100%', padding: '11px 0', fontFamily: 'inherit', fontSize: 12.5, color: '#a9c3ff', background: 'rgba(91,141,255,.08)', border: '1px solid rgba(91,141,255,.35)', borderRadius: V3.radiusCard, cursor: 'pointer' }}>
          {loadingMore ? '불러오는 중…' : '더 불러오기'}
        </button>
      ) : null}
    </div>
  )
}
