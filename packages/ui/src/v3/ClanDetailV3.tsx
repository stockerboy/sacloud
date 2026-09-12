'use client'

/**
 * ★클랜 상세 v3 본문★ (2026-09-10 · 사장님 시안 `ClanDetailV3.tsx` 를 실데이터로)
 *
 *   ├ vs <티어> 스트립 — 같은 티어 상대 마크 나열 + 그 티어 상대 전적
 *   ├ 상대전적 — 상대를 고르면 (C) 두 테마로 갈린 SET SCORE · (D) 세트 승률 막대 · 추이 · 맞대결 기록
 *   └ 최근 경기 — 승패 · 맵 · 시각 · 상대 · 래더 ±
 *
 * 라운드 점수는 경기 원본에 없다 — «ROUND SCORE» 칸은 그리지 않는다. 지어내지 않는다.
 * 옛 화면(`LeagueClanRecordScreen`)의 부품들은 지우지 않았다 (`CLAUDE.md` 1-4).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ClanHeadToHead, ClanRankRow, LeagueClanShow, MatchDetail, MatchListItem, MatchPlayerStat } from '@sacloud/contract'
import { rankColor, statColor } from './rankColors'
import { MatchHexagonV3 } from './MatchHexagonV3'
import { Card, CardHead, Kda, MarkCircle, MvpBadge, SectionBar, SniperMark, TierText, clanThemeOf, fitMarkUrl, hasFitMark, monthDay, relativeKst, type ClanTheme } from './primitives'
import { WIN_LOSS, V3, cardStyle, fmt, pct1, spacerStyle } from './tokens'
import { Hexagon } from './Hexagon'
import { clanHexAxes } from './ClanCardV3'
import { H2HChartV3 } from './H2HChartV3'

/** ★선수 기록실과 같은 2칸×3줄★ (2026-09-11 사장님: «경기카드 전부 이 형식으로 통일») */
const prowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', rowGap: 7, columnGap: 12, padding: '13px 18px' }

const matchRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '70px 150px minmax(0,1fr) 108px 62px', alignItems: 'center', gap: 14, padding: '13px 18px', background: V3.card, border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden' }
/* 옛 5칸 한 줄판 — 지우지 않는다 (CLAUDE.md 1-4). 지금은 v3-prow 2칸×3줄을 쓴다 */
void matchRowStyle
const playerRowStyle: CSSProperties = { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 78px', gap: 10, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${V3.rowDivider2}` }

export interface ClanDetailV3Props {
  data: LeagueClanShow
  leagueSlug: string
  matches: readonly MatchListItem[]
  matchesLoading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  expanded: Readonly<Record<string, MatchDetail>>
  onExpand: (match: MatchListItem) => void
  /** 고른 상대와의 경기 — 페이지가 `?opponent=` 로 따로 불러온다 (2026-09-10). 없으면 로딩 중 */
  vsMatches: readonly MatchListItem[] | null
  onSelectOpponent: (leagueClanId: string | null) => void
  /** 티어별 클랜 전부 (클랜랭킹) — 마크 줄에 ★내 클랜 빼고 전부★ 나열한다 (2026-09-11 사장님). 아직 안 왔으면 null */
  tierClansOf: (division: number) => readonly ClanRankRow[] | null
}

/* ── vs 티어 스트립 ────────────────────────────────────────────── */

function TierStrip({ data, h2h, division, selected, onSelect, tierClans }: { data: LeagueClanShow; h2h: ClanHeadToHead[]; division: number; selected: string | null; onSelect: (id: string) => void; tierClans: readonly ClanRankRow[] | null }) {
  const theme = clanThemeOf(data.clan.slug)
  const played = h2h.filter((r) => r.division === division)
  const win = played.reduce((a, r) => a + r.win, 0)
  const lose = played.reduce((a, r) => a + r.lose, 0)
  /* 마크 줄 — 클랜랭킹의 그 티어 클랜 전부(내 클랜 빼고). 랭킹이 아직 안 왔으면 붙어 본 상대만 */
  const h2hOf = new Map(h2h.map((r) => [r.league_clan_id, r]))
  const rows = (tierClans ?? played.map((r) => ({ league_clan_id: r.league_clan_id, clan: { id: r.clan.id, slug: r.clan.slug, name: r.clan.name, mark: { bg: r.clan.mark_bg_url, front: r.clan.mark_front_url }, is_official_clan: false } })))
    .filter((r) => r.league_clan_id !== data.id)
    .map((r) => ({ id: r.league_clan_id, clan: r.clan, record: h2hOf.get(r.league_clan_id) ?? null }))
  const rate = win + lose > 0 ? (win / (win + lose)) * 100 : null
  return (
    <Card style={{ marginTop: 20 }}>
      <div className="v3-tier-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', flexWrap: 'nowrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
          <MarkCircle clan={data.clan} size={30} />
          <span style={{ fontSize: 14, fontWeight: 700, color: theme.ink, whiteSpace: 'nowrap' }}>{data.clan.name}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 'none', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 12, color: V3.textFaint }}>vs</span>
          <TierText division={division} leagueCategory={data.league.category} size={14} />
        </span>
        <span className="v3-tier-strip" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
          {rows.map((r) => {
            const on = r.id === selected
            const rec = r.record
            return (
              <span key={r.id} onClick={() => onSelect(r.id)} title={rec ? `${r.clan.name} · ${rec.win}승 ${rec.lose}패` : `${r.clan.name} · 아직 안 붙었습니다`} style={{ cursor: 'pointer', borderRadius: '50%', boxShadow: on ? '0 0 14px rgba(91,141,255,.75), 0 0 30px rgba(91,141,255,.35)' : 'none', outline: on ? '2px solid #7fa9ff' : '1px solid transparent', outlineOffset: 2, opacity: on ? 1 : rec ? 0.7 : 0.35, display: 'inline-flex' }}>
                <MarkCircle clan={r.clan} size={26} />
              </span>
            )
          })}
          {rows.length === 0 ? <span style={{ fontSize: 11, color: V3.textGhost }}>이 티어에 다른 클랜이 없습니다</span> : null}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8, flex: 'none' }}>
          <span style={{ fontSize: 11.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>{win}승 {lose}패</span>
          <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', color: rate === null ? V3.textGhost : statColor(rate) }}>{pct1(rate)}</span>
        </span>
      </div>
    </Card>
  )
}

/* ── 상대전적 ─────────────────────────────────────────────────── */

const H2H_X0 = 34.3
const H2H_X1 = 549.7
/* 시안은 30~70% 축이었는데 실제 자료는 0%·100% 가 흔해 눈금이 거짓말을 했다 (QA 회차 1) → 0~100 */
const h2hY = (share: number) => 262 - (Math.max(0, Math.min(100, share)) / 100) * 236
const h2hYLegacy = (share: number) => 262 - ((Math.max(30, Math.min(70, share)) - 30) / 40) * 236
void h2hYLegacy

/** 누적 세트 승률 추이 — 붙은 경기를 시간순으로 더해 간다 (지어내지 않는다 · 경기 수만큼 점) */
/** ⚠ 옛 판(판 순서 X축) — 2026-09-11 부터는 H2HChartV3(시즌 시간축)가 그린다. 지우지 않았다 */
function H2HChartLegacy({ opp, theme, oppTheme, mine, oppSlug }: { opp: ClanHeadToHead; theme: ClanTheme; oppTheme: ClanTheme; mine: LeagueClanShow['clan']; oppSlug: string }) {
  const games = [...opp.recent].filter((g) => g.won !== null).reverse()
  let w = 0
  const shares = games.map((g, i) => {
    if (g.won) w += 1
    return { x: games.length <= 1 ? H2H_X1 : H2H_X0 + ((H2H_X1 - H2H_X0) * i) / (games.length - 1), share: (w / (i + 1)) * 100, label: monthDay(g.start_at) }
  })
  const blue = shares.map((p) => `${p.x.toFixed(1)},${h2hY(p.share).toFixed(1)}`).join(' ')
  const red = shares.map((p) => `${p.x.toFixed(1)},${h2hY(100 - p.share).toFixed(1)}`).join(' ')
  const end = shares[shares.length - 1]
  /* 두 끝값이 50% 근처면 마커 둘이 겹쳐 글자가 뭉개진다 (QA 회차 2 · publicity 47.1/52.9) → 글자를 위·아래로 벌린다 */
  const close = end ? Math.abs(end.share - (100 - end.share)) < 16 : false
  const finalShare = opp.win + opp.lose > 0 ? (opp.win / (opp.win + opp.lose)) * 100 : null
  return (
    <div style={{ padding: '6px 12px 10px', background: V3.plot }}>
      <svg viewBox="0 0 700 330" className="v3-h2h-svg" style={{ width: '100%', height: 330, display: 'block' }}>
        <defs>
          <filter id="h2hGlowB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b1" /><feGaussianBlur stdDeviation="16" result="b2" /><feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="h2hGlowR" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="r1" /><feGaussianBlur stdDeviation="16" result="r2" /><feMerge><feMergeNode in="r2" /><feMergeNode in="r1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect x="0" y="0" width="700" height="330" fill={V3.plot} />
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={H2H_X0} y1={h2hY(g)} x2={H2H_X1} y2={h2hY(g)} stroke="#111826" />
            <text x={H2H_X0 - 8} y={h2hY(g) + 4} textAnchor="end" fill="#7c88a4" fontSize="13">{g}%</text>
          </g>
        ))}
        {shares.map((p, i) => (
          <text key={i} x={p.x} y={300} textAnchor={i === 0 ? 'start' : i === shares.length - 1 ? 'end' : 'middle'} fill="#7c88a4" fontSize="13">{i > 0 && shares[i - 1]?.label === p.label ? '' : p.label}</text>
        ))}
        <line x1={H2H_X1} y1={20} x2={H2H_X1} y2={268} stroke="#2b3a58" />
        <text x={H2H_X1} y={16} textAnchor="middle" fill="#8f9bb5" fontSize="14" fontWeight="700">now</text>
        {shares.length === 0 ? <text x="300" y="150" textAnchor="middle" fill={V3.textGhost} fontSize="13">승패를 아는 맞대결이 없습니다</text> : null}
        {shares.length > 1 ? (
          <>
            <polyline points={red} fill="none" stroke={oppTheme.deep} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" filter="url(#h2hGlowR)" opacity={0.5} />
            <polyline points={blue} fill="none" stroke={V3.blue} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" filter="url(#h2hGlowB)" opacity={0.55} />
            <polyline points={red} fill="none" stroke={oppTheme.deep} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.42} />
            <polyline points={blue} fill="none" stroke="#7fa9ff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={red} fill="none" stroke={oppTheme.main} strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
            <polyline points={blue} fill="none" stroke="#dbe8ff" strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </>
        ) : null}
        {end && finalShare !== null ? (
          <>
            <circle cx={H2H_X1} cy={h2hY(end.share)} r={26} fill="none" stroke={V3.blue} strokeWidth={7} filter="url(#h2hGlowB)" opacity={0.55} />
            <circle cx={H2H_X1} cy={h2hY(end.share)} r={22} fill={V3.chip} stroke="#7fa9ff" strokeWidth={2} />
            {hasFitMark(mine.slug) ? <image href={fitMarkUrl(mine.slug)} x={H2H_X1 - 18} y={h2hY(end.share) - 18} width="36" height="36" clipPath="circle(18px at 18px 18px)" /> : null}
            <text x={H2H_X1 + 30} y={h2hY(end.share) + (close ? -26 : 10)} fill="#ffffff" fontSize="20" fontWeight="700">{finalShare.toFixed(1)}%</text>
            <circle cx={H2H_X1 - (close ? 34 : 0)} cy={h2hY(100 - end.share)} r={26} fill="none" stroke={oppTheme.deep} strokeWidth={7} filter="url(#h2hGlowR)" opacity={0.5} />
            <circle cx={H2H_X1 - (close ? 34 : 0)} cy={h2hY(100 - end.share)} r={22} fill={V3.chip} stroke={oppTheme.main} strokeWidth={2} />
            {hasFitMark(oppSlug) ? <image href={fitMarkUrl(oppSlug)} x={H2H_X1 - 18 - (close ? 34 : 0)} y={h2hY(100 - end.share) - 18} width="36" height="36" clipPath="circle(18px at 18px 18px)" /> : null}
            <text x={H2H_X1 + 30} y={h2hY(100 - end.share) + (close ? 38 : 10)} fill="#ffffff" fontSize="20" fontWeight="700">{(100 - finalShare).toFixed(1)}%</text>
          </>
        ) : null}
        <g>
          <line x1={H2H_X0} y1={312} x2={H2H_X0 + 16} y2={312} stroke="#7fa9ff" strokeWidth={3} filter="url(#h2hGlowB)" />
          <line x1={H2H_X0} y1={312} x2={H2H_X0 + 16} y2={312} stroke="#dbe8ff" strokeWidth={1.6} />
          <text x={H2H_X0 + 22} y={321} fill={theme.ink} fontSize="15">{mine.name}</text>
          <line x1={H2H_X0 + 150} y1={312} x2={H2H_X0 + 166} y2={312} stroke={oppTheme.deep} strokeWidth={3} filter="url(#h2hGlowR)" />
          <line x1={H2H_X0 + 150} y1={312} x2={H2H_X0 + 166} y2={312} stroke={oppTheme.main} strokeWidth={1.6} />
          <text x={H2H_X0 + 172} y={321} fill={oppTheme.ink} fontSize="15">{opp.clan.name}</text>
        </g>
      </svg>
    </div>
  )
}

function PlayerRow({ row, mvp, weaponKnown, clanSlug, showSaves, leagueSlug }: { row: MatchPlayerStat; mvp: boolean; weaponKnown: boolean; clanSlug: string | null; showSaves: boolean; leagueSlug: string }) {
  const sniper = weaponKnown && row.weapon === 1
  /* 킬뎃은 포지션이 자리를 가져갔다 (2026-09-12 사장님). 값은 계약에 그대로 있다 */
  const kd = row.kd_rate
  void kd
  const clan = row.match_time_clan
  return (
    <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ ...playerRowStyle, ...(showSaves ? { gridTemplateColumns: 'minmax(0,1fr) 108px 64px 78px' } : {}), background: 'transparent', boxShadow: mvp ? 'inset 3px 0 0 #ffd83d, inset 0 0 26px rgba(255,216,61,.10)' : 'none' }}>
      {/* ★인식표★ — ASTRA 1~3위 먹구름 · 4~100위 흰구름 (2026-09-11 사장님). 글자 뒤에 깐다 */}
      {row.nameplate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${row.nameplate}`} /> : null}
      {SCORE_WATERMARKS && sniper ? <span aria-hidden style={{ position: 'absolute', left: '34%', top: '50%', transform: 'translate(-50%,-50%) skewX(-16deg) scaleY(0.9) scaleX(1.16)', fontSize: 26, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.5em', color: V3.red, opacity: 0.17, WebkitTextStroke: `3.4px ${V3.red}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>SNIPER</span> : null}
      {SCORE_WATERMARKS && mvp ? <span aria-hidden style={{ position: 'absolute', left: '64%', top: '50%', transform: 'translateY(-50%) skewX(-12deg) scaleY(0.92)', fontSize: 26, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.24em', color: V3.gold, opacity: 0.15, WebkitTextStroke: `2.4px ${V3.gold}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>MVP</span> : null}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <MarkCircle clan={clan ? { slug: clan.slug ?? clanSlug, mark: clan.mark } : clanSlug ? { slug: clanSlug } : null} size={20} />
        <a href={`/league/${leagueSlug}/player/${row.player_id}`} onClick={(e) => e.stopPropagation()} style={{ ...{ fontSize: 12.5, fontWeight: 500, color: mvp ? '#ffe89a' : '#c3cbdb' }, ...{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}>{row.name}</a>
        {sniper ? <SniperMark /> : null}
        {mvp ? <MvpBadge size={8.5} /> : null}
      </span>
      <span style={{ position: 'relative' }}><Kda kill={row.kill} death={row.death} assist={row.assist} size={17} /></span>
      {showSaves ? <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : '#3f4c66' }}>{row.saves === null ? '-' : `${row.saves}/${row.save_chances ?? 0}`}</span> : null}
      {/* ★포지션★ (2026-09-12 사장님) — 킬뎃 % 대신 스나수 / 라플수. 아직 못 잰 선수는 «알수없음».
          그 판에 든 총이 아니라 ★주무기★ 다. 판수가 차면 옛 경기 화면에도 소급해서 뜬다 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: row.main_weapon === null || row.main_weapon === undefined ? '#4e5b76' : '#c3cbdb' }}>
        {row.main_weapon === 1 ? '스나수' : row.main_weapon === 0 ? '라플수' : '알수없음'}
      </span>
    </div>
  )
}

/** 우리 팀 진영 — API 의 `viewer_side`. 없으면 명단 소속으로 (2026-09-10) */
/** 목록 줄만으로 «league_clan 이 선 진영» — 명단의 소속으로 본다. 명단이 없으면 null (2026-09-11 · 접힌 줄 라운드 점수) */
export function listSideOf(m: MatchListItem): 'red' | 'blue' | null {
  if (m.league_clan_side) return m.league_clan_side
  /* league_clan_id 가 비어 있는 명단이 많다(2026-09-11 실측: 전부 null) → slug, 그것도 없으면 이름으로 짝짓는다 */
  const same = (p: MatchListItem['red'][number]) => {
    const c = p.match_time_clan
    if (!c) return false
    if (c.league_clan_id && c.league_clan_id === m.league_clan.league_clan_id) return true
    if (c.slug && c.slug === m.league_clan.clan.slug) return true
    return c.name === m.league_clan.clan.name
  }
  const red = m.red.filter(same).length
  const blue = m.blue.filter(same).length
  if (red === 0 && blue === 0) return null
  return red >= blue ? 'red' : 'blue'
}

/** 목록 줄의 라운드 점수 [우리, 상대] — 모르면 null */
export function listRoundsOf(m: MatchListItem): [number, number] | null {
  if (m.red_rounds === null || m.blue_rounds === null) return null
  /* 5:5 처럼 같은데 승패가 있다 = 라운드 기록이 모자란 판 → 지어내지도, 모순되게 적지도 않는다 (QA 회차 12) */
  if (m.red_rounds === m.blue_rounds) return null
  const side = listSideOf(m)
  if (side === null) return null
  return side === 'red' ? [m.red_rounds, m.blue_rounds] : [m.blue_rounds, m.red_rounds]
}

/** 진영의 팀 정보 — 그 진영 명단 다수의 «경기 당시 클랜». 스냅샷 둘 중 하나와 맞으면 그 스냅샷(티어까지),
 *  아니면 명단에서 읽은 클랜(티어 모름 → null). 2026-09-11 QA 교차검토 4번: 용병으로 뛴 선수 페이지에서
 *  «sometimes» 라벨 아래 igloo 명단이 붙었다 — 보는 쪽 스냅샷을 진영에 그대로 씌운 탓 */
export interface TeamSnap { clan: { id: string; slug: string; name: string; mark: { bg: string | null; front: string | null } }; division: number | null; league_clan_id: string | null }
const majorityClanOf = (stats: readonly MatchPlayerStat[]) => {
  const tally = new Map<string, { n: number; c: NonNullable<MatchPlayerStat['match_time_clan']> }>()
  const keyOf = (c: NonNullable<MatchPlayerStat['match_time_clan']>) => c.league_clan_id ?? c.slug ?? c.name
  for (const s of stats) {
    const c = s.match_time_clan
    if (!c) continue
    const cur = tally.get(keyOf(c))
    if (cur) cur.n += 1
    else tally.set(keyOf(c), { n: 1, c })
  }
  const top = [...tally.values()].sort((a, b) => b.n - a.n)[0] ?? null
  return top ? { key: keyOf(top.c), c: top.c } : null
}

/* 2026-09-11 회차 11 에서 되돌림: crucialrz 경기의 우리 팀이 «loveless» 로 바뀌어 보였다 — 용병이 많은 리그라 명단 다수로 팀 이름을 갈아끼우면
   등록 클랜(수집기 라벨)과 어긋난다. ★팀 이름은 등록 클랜★, 선수 옆 마크가 소속을 말한다. 명단 다수 방식은 스위치로 남긴다 */
const TEAM_NAME_FROM_LINEUP = false
/* 상대전적 그래프 — 옛 판(판 순서 X축)으로 되돌리려면 true */
const H2H_CHART_LEGACY = false
/* 2026-09-11 사장님: 워터마크 폐지, 스나이퍼는 닉 옆 빨간 (S) */
const SCORE_WATERMARKS = false

export function teamSnapOf(detail: MatchDetail, side: 'red' | 'blue', fallback: MatchDetail['league_clan']): TeamSnap {
  if (!TEAM_NAME_FROM_LINEUP) return { clan: fallback.clan, division: fallback.division, league_clan_id: fallback.league_clan_id }
  const top = majorityClanOf(side === 'red' ? detail.red_stats : detail.blue_stats)
  const other = majorityClanOf(side === 'red' ? detail.blue_stats : detail.red_stats)
  const snaps = [detail.league_clan, detail.opponent]
  /* 양쪽 다수가 같은 클랜(한 클랜이 용병으로 양쪽에 섰거나 자체 경기)이면 명단으로 못 가른다 → 수집기의 팀 라벨 그대로 */
  if (!top || (other && other.key === top.key)) return { clan: fallback.clan, division: fallback.division, league_clan_id: fallback.league_clan_id }
  const hit = snaps.find((s) => (top.c.league_clan_id && s.league_clan_id === top.c.league_clan_id) || (top.c.slug && s.clan.slug === top.c.slug) || s.clan.name === top.c.name)
  if (hit) return { clan: hit.clan, division: hit.division, league_clan_id: hit.league_clan_id }
  return { clan: { id: top.c.league_clan_id ?? fallback.clan.id, slug: top.c.slug ?? fallback.clan.slug, name: top.c.name, mark: top.c.mark }, division: null, league_clan_id: top.c.league_clan_id }
}

export function ourSideOf(detail: MatchDetail): 'red' | 'blue' {
  if (detail.viewer_side) return detail.viewer_side
  const ours = detail.league_clan.league_clan_id
  const redOurs = detail.red_stats.filter((s) => s.match_time_clan?.league_clan_id === ours).length
  const blueOurs = detail.blue_stats.filter((s) => s.match_time_clan?.league_clan_id === ours).length
  return redOurs >= blueOurs ? 'red' : 'blue'
}

/** 경기 목록 v3(MatchListV3)도 같은 스코어보드를 쓴다 (2026-09-11) */
export function ClanScoreboardV3(props: { detail: MatchDetail; leagueCategory: string; leagueSlug: string }) { return <Scoreboard {...props} /> }

function Scoreboard({ detail, leagueCategory, leagueSlug }: { detail: MatchDetail; leagueCategory: string; leagueSlug: string }) {
  const ourSide = ourSideOf(detail)
  /* 2026-09-11 사장님: 집계 전 경기라고 세이브 칸이 통째로 사라지면 «없는 화면» 처럼 보인다 →
     칸은 늘 두고 아직 모르는 값만 «-» 로 적는다 (0 으로 채우지 않는다). 옛 판: [...].some((s) => s.saves !== null) */
  const showSaves = detail.red_stats.length + detail.blue_stats.length > 0
  const roundsOf = (side: 'red' | 'blue') => (side === 'red' ? detail.red_rounds : detail.blue_rounds)
  const teams = ([ourSide, ourSide === 'red' ? 'blue' : 'red'] as const).map((side) => {
    const stats = side === 'red' ? detail.red_stats : detail.blue_stats
    const ours = side === ourSide
    const snap = teamSnapOf(detail, side, ours ? detail.league_clan : detail.opponent)
    const won = ours ? detail.win : !detail.win
    return { side, stats, snap, won, theme: clanThemeOf(snap.clan.slug) }
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
    <div className="v3-board" style={{ background: '#0a0f1a', borderTop: `1px solid ${V3.rowDivider}`, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {teams.map((t) => (
        /* ★이긴 팀 하늘색 · 진 팀 빨강★ (2026-09-12 사장님) — 경기분석 그래프와 같은 색 */
        <div key={t.side} className={t.won ? 'v3-board-win' : 'v3-board-lose'} style={{ border: `1px solid ${t.won ? WIN_LOSS.winLine : WIN_LOSS.loseLine}`, borderRadius: V3.radiusBlock, background: t.won ? WIN_LOSS.winBg : WIN_LOSS.loseBg }}>
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
          <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ display: 'grid', gridTemplateColumns: showSaves ? 'minmax(0,1fr) 108px 64px 78px' : 'minmax(0,1fr) 108px 78px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 9.5, color: '#3f4c66', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
            <span>플레이어</span><span>K / D / A</span>{showSaves ? <span style={{ textAlign: 'right' }}>세이브</span> : null}<span style={{ textAlign: 'right' }}>포지션</span>
          </div>
          {t.stats.length === 0 ? <div style={{ padding: '10px 14px', fontSize: 11, color: V3.textGhost }}>기록이 없습니다</div> : null}
          {t.stats.map((row) => <PlayerRow key={row.player_id} row={row} mvp={row.mvp === true && t.won} weaponKnown={row.weapon !== null} clanSlug={t.snap.clan.slug} showSaves={showSaves} leagueSlug={leagueSlug} />)}
          </>
          )}
        </div>
      ))}
      {/* ★PC 는 가운데에 경기분석 육각형이 늘 떠 있다★ (2026-09-12 사장님). 폰에서는 안 그린다 */}
      {canAnalyze ? (
        <div className="v3-board-hex" style={{ padding: '4px 0 0' }}>
          <MatchHexagonV3
            won={wonTeam ? hexOf(wonTeam.side) : null}
            lost={lostTeam ? hexOf(lostTeam.side) : null}
            wonName={wonTeam?.snap.clan.name ?? '승리'}
            lostName={lostTeam?.snap.clan.name ?? '패배'}
            id={`mhexPc-${detail.id}`}
          />
        </div>
      ) : null}
    </div>
  )
}

function HeadToHeadCard({ data, opp, vsMatches, expanded, onExpand }: { data: LeagueClanShow; opp: ClanHeadToHead; vsMatches: readonly MatchListItem[] | null; expanded: Readonly<Record<string, MatchDetail>>; onExpand: (m: MatchListItem) => void }) {
  const theme = clanThemeOf(data.clan.slug)
  const oppTheme = clanThemeOf(opp.clan.slug)
  const total = opp.win + opp.lose
  const share = total > 0 ? (opp.win / total) * 100 : 50
  const [open, setOpen] = useState<string | null>(null)
  const [folded, setFolded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const vsAll = vsMatches ?? []
  const vs = showAll ? vsAll : vsAll.slice(0, 10)
  const oppClan = { id: opp.clan.id, slug: opp.clan.slug, name: opp.clan.name, mark: { bg: opp.clan.mark_bg_url, front: opp.clan.mark_front_url } }
  return (
    <Card style={{ marginTop: 14 }} edge={V3.blue}>
      <CardHead title="상대전적" right={
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>시즌 Cloud 0 · {fmt(total)}전</span>
          <span onClick={() => setFolded((v) => !v)} style={{ fontSize: 11.5, fontWeight: 700, color: '#a9c3ff', cursor: 'pointer', whiteSpace: 'nowrap' }}>{folded ? '펼치기 ▼' : '접기 ▲'}</span>
        </span>
      }>
        <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>{data.clan.name} vs {opp.clan.name}</span>
      </CardHead>
      {folded ? null : <>
      <div className="v3-setscore" style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, padding: '26px 18px 22px', flexWrap: 'wrap' }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${share}%`, background: `linear-gradient(100deg, ${theme.light}42, ${theme.main}29 40%, ${theme.deep}0f 78%, transparent)`, pointerEvents: 'none' }} />
        <span aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${100 - share}%`, background: `linear-gradient(260deg, ${oppTheme.light}3d, ${oppTheme.main}29 40%, ${oppTheme.deep}0f 78%, transparent)`, pointerEvents: 'none' }} />
        {hasFitMark(data.clan.slug) ? <span aria-hidden className="v3-setscore-bg" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 150, height: 150, backgroundImage: `url(${fitMarkUrl(data.clan.slug)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.15, pointerEvents: 'none' }} /> : null}
        {hasFitMark(opp.clan.slug) ? <span aria-hidden className="v3-setscore-bg" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 150, height: 150, backgroundImage: `url(${fitMarkUrl(opp.clan.slug)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.15, pointerEvents: 'none' }} /> : null}
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: `${share}%`, height: 2, background: `linear-gradient(90deg,${theme.light},${theme.main} 55%,${theme.main}40)`, pointerEvents: 'none' }} />
        <span aria-hidden style={{ position: 'absolute', right: 0, top: 0, width: `${100 - share}%`, height: 2, background: `linear-gradient(270deg,${oppTheme.main},${oppTheme.main}33)`, pointerEvents: 'none' }} />
        <span aria-hidden style={{ position: 'absolute', left: `${share}%`, top: 0, bottom: 0, width: 1, background: 'linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,.04))', pointerEvents: 'none' }} />
        <span className="v3-setscore-team" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: theme.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{data.clan.name}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}><TierText division={data.division} leagueCategory={data.league.category} size={11} />{data.rank !== null ? <span style={{ fontSize: 11, color: rankColor(data.rank) }}>{data.rank}위</span> : null}</span>
          </span>
          <MarkCircle clan={data.clan} size={52} className="v3-setscore-mark" />
        </span>
        <span className="v3-setscore-num" style={{ position: 'relative', fontSize: 40, fontWeight: 600, lineHeight: 1, color: theme.ink, letterSpacing: '-.02em' }}>{opp.win}</span>
        <span className="v3-setscore-mid" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 88 }}>
          <span style={{ fontSize: 10.5, color: V3.textFaint, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>SET SCORE</span>
          <span style={{ fontSize: 11, color: V3.textGhost2, whiteSpace: 'nowrap' }}>Cloud0 시즌</span>
        </span>
        <span className="v3-setscore-num" style={{ position: 'relative', fontSize: 40, fontWeight: 600, lineHeight: 1, color: oppTheme.ink, letterSpacing: '-.02em' }}>{opp.lose}</span>
        <span className="v3-setscore-team" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <MarkCircle clan={oppClan} size={52} className="v3-setscore-mark" />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: oppTheme.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{opp.clan.name}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}><TierText division={opp.division} leagueCategory={data.league.category} size={11} /></span>
          </span>
        </span>
      </div>
      <div style={{ padding: '0 18px 14px' }}>
        <div style={{ display: 'flex', height: 8, gap: 4, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${share}%`, borderTop: `2px solid ${theme.edge}`, background: `linear-gradient(100deg, ${theme.light}6b, ${theme.main}3d 46%, ${theme.deep}1a)` }} />
          <div style={{ width: `${100 - share}%`, borderTop: `2px solid ${oppTheme.edge}`, background: `linear-gradient(260deg, ${oppTheme.light}6b, ${oppTheme.main}3d 46%, ${oppTheme.deep}1a)` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 7 }}>
          <span style={{ fontSize: 11.5, color: '#8f9bb5', whiteSpace: 'nowrap' }}>SET WIN RATE <span style={{ fontWeight: 700, color: theme.ink }}>{total > 0 ? `${share.toFixed(1)}%` : '-'}</span></span>
          <span style={{ fontSize: 11.5, color: '#8f9bb5', whiteSpace: 'nowrap' }}><span style={{ fontWeight: 700, color: oppTheme.ink }}>{total > 0 ? `${(100 - share).toFixed(1)}%` : '-'}</span> · {fmt(total)}전 기준</span>
        </div>
      </div>
      {H2H_CHART_LEGACY ? (
        <H2HChartLegacy opp={opp} theme={theme} oppTheme={oppTheme} mine={data.clan} oppSlug={opp.clan.slug} />
      ) : (
        /* 이 상대와의 경기 전부(vsMatches · 60판까지) — 아직 안 왔으면 요약의 최근 판 */
        <H2HChartV3
          games={vsMatches ? vsMatches.map((m) => ({ at: m.start_at, won: m.win })) : opp.recent.filter((g) => g.won !== null).map((g) => ({ at: g.start_at, won: g.won as boolean }))}
          theme={theme}
          oppTheme={oppTheme}
          mineName={data.clan.name}
          mineSlug={data.clan.slug}
          oppName={opp.clan.name}
          oppSlug={opp.clan.slug}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: `1px solid ${V3.rowDivider}` }}>
        <div style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>맞대결 기록</span>
        <div style={spacerStyle} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 11.5, color: V3.textFaint }}>{opp.win}승 {opp.lose}패</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: total > 0 ? statColor(share) : V3.textGhost }}>{total > 0 ? `${share.toFixed(1)}%` : '-'}</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {vsMatches === null ? <div style={{ padding: '12px 18px 16px', fontSize: 11.5, color: V3.textGhost }}>불러오는 중…</div> : vs.length === 0 ? <div style={{ padding: '12px 18px 16px', fontSize: 11.5, color: V3.textGhost }}>이 상대와의 경기가 없습니다</div> : null}
        {vs.map((m) => {
          const isOpen = open === m.id
          const edge = m.win ? V3.blue : V3.red
          const mvpEntry = m.mvp_player_id === null ? null : [...m.red, ...m.blue].find((p) => p.player_id === m.mvp_player_id) ?? null
          const mvpName = mvpEntry?.name ?? null
          const detail = expanded[m.id]
          const pending = m.red.length === 0 && m.blue.length === 0
          const rounds = detail && detail.red_rounds !== null && detail.blue_rounds !== null ? (ourSideOf(detail) === 'red' ? [detail.red_rounds, detail.blue_rounds] : [detail.blue_rounds, detail.red_rounds]) : listRoundsOf(m)
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${V3.rowDivider}`, borderRadius: V3.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: (m.win ? 'rgba(91,141,255,.13)' : 'rgba(255,90,99,.13)'), opacity: pending ? 0.75 : 1 }}>
              <div onClick={() => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }} className="v3-match-row v3-vs-row" style={{ display: 'grid', gridTemplateColumns: '46px 110px minmax(0,1fr) minmax(0,210px) 108px 70px', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: V3.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
                  <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{relativeKst(m.start_at)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <MarkCircle clan={data.clan} size={20} />
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: theme.ink, whiteSpace: 'nowrap' }}>{data.clan.name}</span>
                  <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: oppTheme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.clan.name}</span>
                  <MarkCircle clan={oppClan} size={20} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0, overflow: 'hidden' }}>
                  {mvpName ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 1 230px', minWidth: 0, overflow: 'hidden' }}>
                      {/* ★마크 · 닉네임 · MVP배지★ 순 (2026-09-11 사장님: 모든 경기카드 통일) */}
                      <MarkCircle clan={mvpEntry?.match_time_clan ? { slug: mvpEntry.match_time_clan.slug, mark: mvpEntry.match_time_clan.mark } : null} size={16} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#ffe89a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mvpName}</span>
                      <MvpBadge size={8.5} />
                    </span>
                  ) : null}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0, overflow: 'hidden' }}>
                  {pending ? <span style={{ fontSize: 11.5, color: '#8fa9d8', whiteSpace: 'nowrap' }}>킬데스 수집중</span> : null}
                  {rounds ? (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none', minWidth: 64 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '.02em', lineHeight: 1, whiteSpace: 'nowrap', color: edge }}>{rounds[0]}:{rounds[1]}</span>
                      <span style={{ fontSize: 9, color: '#4e5b76', letterSpacing: '.09em', whiteSpace: 'nowrap' }}>ROUND SCORE</span>
                    </span>
                  ) : null}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? '#3f4c66' : isOpen ? '#a9c3ff' : V3.textGhost }}>{pending ? '수집중' : <>경기상세 <span style={{ fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span></>}</span>
              </div>
              {isOpen ? (detail ? <Scoreboard detail={detail} leagueCategory={data.league.category} leagueSlug={data.league.slug} /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.rowDivider}` }}>불러오는 중…</div>) : null}
            </div>
          )
        })}
        {!showAll && vsAll.length > 10 ? (
          <div onClick={() => setShowAll(true)} style={{ padding: '11px 0', textAlign: 'center', fontSize: 12, color: '#a9c3ff', cursor: 'pointer' }}>맞대결 전부 보기 · {vsAll.length}판{total > vsAll.length ? ` (최근 ${vsAll.length}판까지)` : ''}</div>
        ) : null}
      </div>
      </>}
    </Card>
  )
}

/* ── 최근 경기 ─────────────────────────────────────────────────── */

/* 2026-09-11 QA 회차 2: 최근 경기도 줄을 누르면 스코어보드가 펼쳐진다 (선수 상세·경기 목록과 같은 규칙). 명단 없는 경기는 잠근다 */
/**
 * ★최근 경기★ — 선수 기록실 카드와 ★같은 2칸×3줄★ 이다 (2026-09-11 사장님: «경기카드 전부 이 형식으로 통일»).
 *
 *   ┌──────────────────────────────┬───────────────────────┐
 *   │ 승리 · 제3보급창고 · 1시간 전  │ 마크 닉네임 [MVP]     │  ← 오른쪽 위에 MVP (사장님)
 *   │ igloo VS reBellion            │ 래더 +12점 / 수집중    │
 *   │ vs CHALLENGER 1               │ 상세 ▼                │
 *   └──────────────────────────────┴───────────────────────┘
 *
 * 줄을 누르면 스코어보드가 펼쳐진다 (선수 상세·경기 목록과 같은 규칙). 명단 없는 경기는 잠근다.
 * 옛 5칸 한 줄판은 `matchRowStyle` 그대로 두었다 — 맞대결 기록카드가 아직 쓴다 (`CLAUDE.md` 1-4).
 */
function RecentRows({ data, matches, expanded, onExpand }: { data: LeagueClanShow; matches: readonly MatchListItem[]; expanded: Readonly<Record<string, MatchDetail>>; onExpand: (m: MatchListItem) => void }) {
  /* 클랜 색은 이제 승패 색이 대신한다 (2026-09-12 사장님) — 지우지 않고 void 로 남긴다 */
  const theme = clanThemeOf(data.clan.slug)
  void theme
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {matches.map((m) => {
        const edge = m.win ? V3.blue : V3.red
        const delta = m.rating_update
        const pending = m.red.length === 0 && m.blue.length === 0
        /* ★그 경기 MVP★ — 명단에서 찾는다. 아직 안 박혔으면 안 그린다 (지어내지 않는다) */
        const mvp = m.mvp_player_id === null ? null : [...m.red, ...m.blue].find((p) => p.player_id === m.mvp_player_id) ?? null
        const isOpen = open === m.id
        return (
          <div key={m.id} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: (m.win ? 'rgba(91,141,255,.13)' : 'rgba(255,90,99,.13)'), opacity: pending ? 0.75 : 1 }}>
          <div onClick={() => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }} style={{ ...prowStyle, cursor: pending ? 'default' : 'pointer' }} className="v3-prow">
            {/* 1줄 — 승패 · 맵 · 시각 / 오른쪽 위엔 MVP */}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>
              <span style={{ fontSize: 12, color: V3.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
              <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{relativeKst(m.start_at)}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0, overflow: 'hidden' }}>
              {mvp ? (
                /* ★마크 · 닉네임 · MVP배지★ 순 — 배지가 제일 오른쪽 끝 (2026-09-11 사장님) */
                <>
                  <MarkCircle clan={mvp.match_time_clan ? { slug: mvp.match_time_clan.slug, mark: mvp.match_time_clan.mark } : null} size={16} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ffe89a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mvp.name}</span>
                  <MvpBadge size={8.5} />
                </>
              ) : null}
            </span>
            {/* 2줄 — 양 팀 / 오른쪽엔 래더 증감 */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              {/* ★클랜명은 승패 색★ (2026-09-12 사장님) */}
              <MarkCircle clan={data.clan} size={20} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.clan.name}</span>
              <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
              <MarkCircle clan={m.opponent.clan} size={20} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.loseInk : WIN_LOSS.winInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.opponent.clan.name}</span>
            </span>
            <span className="v3-match-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
              {pending ? (
                <span style={{ fontSize: 11.5, color: '#8fa9d8', whiteSpace: 'nowrap' }}>킬데스 수집중</span>
              ) : delta === null && data.league.category !== 'independent' ? (
                /* 래더 리그(SPL)인데 이 판은 래더에 안 실렸다 — 티어로 바꿔치기하지 않는다 (QA 회차 3) */
                <><span style={{ fontSize: 10.5, color: '#4e515d', whiteSpace: 'nowrap' }}>래더</span><span style={{ fontSize: 12, color: V3.textGhost, whiteSpace: 'nowrap' }} title="래더 합계에는 반영됐지만 이 판의 증감은 저장돼 있지 않습니다">증감 미기록</span></>
              ) : delta === null ? null : (
                <>
                  <span style={{ fontSize: 10.5, color: '#4e515d', whiteSpace: 'nowrap' }}>래더</span>
                  <span style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', color: delta > 0 ? V3.green : delta < 0 ? V3.red : V3.textMuted }}>{delta > 0 ? '+' : ''}{delta}점</span>
                </>
              )}
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
            expanded[m.id] ? <Scoreboard detail={expanded[m.id] as MatchDetail} leagueCategory={data.league.category} leagueSlug={data.league.slug} /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
          ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ── 페이지 본문 ──────────────────────────────────────────────── */


/* ── 클랜별 전적 (2026-09-11 사장님: 선수 페이지와 같은 방식으로) ─────────── */

/**
 * 구간마다 한 칸. 밑의 마크 줄에서 상대를 누르면 ★제목이 그 클랜으로 바뀌고★ 숫자가 그 상대와의 기록이 된다.
 * 마크 줄은 ★그 구간의 모든 클랜★ (내 클랜 제외 · 2026-09-11 사장님) — 많이 붙은 순, 안 붙어 본 클랜은 뒤.
 * 고른 상대는 아래 «상대전적» 카드(그래프·맞대결 기록)도 같이 따라간다.
 */
/**
 * ★한 번에 한 구간만 편다★ (2026-09-11 사장님).
 *
 * > «자기 구간 아닌 부분은 그냥 접어놔 (…) 얇은 띠로 그리고 오른쪽에 전체 승률 적고
 * >  펼치기 접기 만들어줘 이 파트가 세로로 너무 넓어서 밑에 그래프가 한눈에 안보여
 * >  그리고 다른 구간 누르면 원래 펼쳐놨던 구간은 접히게 해줘»
 *
 * 처음 펴 두는 것은 ★자기 구간★ 이다. 접힌 띠는 제목 줄 + 오른쪽에 ★구간 전체★ 승률만 —
 * 고른 상대의 숫자가 아니다 (접어 두면 누구를 골랐는지 안 보이니까).
 */
function ClanVsTiersCard({ data, h2h, tierClansOf, selected, onSelect }: {
  data: LeagueClanShow
  h2h: readonly ClanHeadToHead[]
  tierClansOf: (division: number) => readonly ClanRankRow[] | null
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const theme = clanThemeOf(data.clan.slug)
  const tiered = data.league.division_count >= 2
  const tiers = useMemo(() => {
    const set = new Set<number>()
    for (let d = 1; d <= Math.max(1, data.league.division_count); d += 1) set.add(d)
    for (const r of h2h) if (r.division !== null) set.add(r.division)
    return [...set].sort((a, b) => a - b)
  }, [h2h, data.league.division_count])
  /* 처음에는 ★자기 구간★ 만 펴 둔다 */
  const [open, setOpen] = useState<number | null>(data.division ?? null)
  return (
    <div style={{ marginTop: 14, ...cardStyle }}>
      <CardHead title="클랜별 전적" right={
        <span style={{ fontSize: 10.5, color: V3.textGhost2, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>시즌 Cloud 0 · {fmt(data.win + data.lose)}전 기준</span>
      } />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px 16px' }}>
        {tiers.map((t) => {
          const rows = h2h.filter((r) => r.division === t)
          const byId = new Map(rows.map((r) => [r.league_clan_id, r]))
          /* 그 구간의 모든 클랜 — 많이 붙은 순, 안 붙어 본 클랜은 뒤 */
          const all = (tierClansOf(t) ?? [])
            .filter((c) => c.league_clan_id !== data.id)
            .map((c) => ({ id: c.league_clan_id, clan: c.clan, games: (byId.get(c.league_clan_id)?.win ?? 0) + (byId.get(c.league_clan_id)?.lose ?? 0) }))
            .sort((a, b) => b.games - a.games || (a.clan.name < b.clan.name ? -1 : 1))
          /* ★구간 전체★ — 접힌 띠에 적는 숫자다 */
          const tierWin = rows.reduce((n, r) => n + r.win, 0)
          const tierLose = rows.reduce((n, r) => n + r.lose, 0)
          const tierRate = tierWin + tierLose === 0 ? null : Math.round((tierWin / (tierWin + tierLose)) * 1000) / 10
          const opened = open === t
          const toggle = () => {
            /* 다른 구간을 펴면 골라 둔 상대는 푼다 — 안 보이는 칸의 선택이 남지 않게 */
            onSelect(null)
            setOpen((now) => (now === t ? null : t))
          }
          if (!opened) {
            return (
              <div
                key={t}
                onClick={toggle}
                style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'pointer', border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, background: V3.card, padding: '8px 12px' }}
              >
                <MarkCircle clan={data.clan} size={18} />
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.clan.name}</span>
                <span style={{ fontSize: 9.5, color: '#3a4560', flex: 'none' }}>VS</span>
                {tiered ? (
                  <TierText division={t} leagueCategory={data.league.category} size={11} />
                ) : (
                  <span style={{ fontSize: 11.5, color: V3.textMuted }}>전체</span>
                )}
                <div style={spacerStyle} />
                <span style={{ fontSize: 10.5, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(tierWin)}승 {fmt(tierLose)}패</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: tierRate === null ? V3.textGhost : statColor(tierRate) }}>{pct1(tierRate)}</span>
                <span style={{ fontSize: 9, color: V3.textGhost, flex: 'none' }}>▼</span>
              </div>
            )
          }
          const pick = selected === null ? null : byId.get(selected) ?? null
          const pickedHere = pick !== null || all.some((c) => c.id === selected)
          const win = pickedHere && pick ? pick.win : tierWin
          const lose = pickedHere && pick ? pick.lose : tierLose
          const rate = win + lose === 0 ? null : Math.round((win / (win + lose)) * 1000) / 10
          const pickedClan = pickedHere ? all.find((c) => c.id === selected) ?? null : null
          return (
            <div key={t} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, background: V3.card, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <MarkCircle clan={data.clan} size={22} />
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.clan.name}</span>
                <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
                {pickedClan ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 700, color: clanThemeOf(pickedClan.clan.slug).ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pickedClan.clan.name}</span>
                    <MarkCircle clan={pickedClan.clan} size={22} />
                    <div style={spacerStyle} />
                    <span onClick={() => onSelect(null)} style={{ fontSize: 10.5, color: V3.textGhost, cursor: 'pointer', whiteSpace: 'nowrap' }}>구간 전체</span>
                  </>
                ) : (
                  <>
                    {tiered ? (
                      <TierText division={t} leagueCategory={data.league.category} size={12} />
                    ) : (
                      <span style={{ fontSize: 12.5, color: V3.textMuted }}>전체</span>
                    )}
                    <div style={spacerStyle} />
                  </>
                )}
                <span onClick={toggle} style={{ fontSize: 9, color: V3.textGhost, cursor: 'pointer', flex: 'none', marginLeft: 8 }}>▲</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(win)}승 {fmt(lose)}패</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: rate === null ? V3.textGhost : statColor(rate) }}>{pct1(rate)}</span>
              </div>
              {all.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                  {all.map((c) => (
                    <span
                      key={c.id}
                      onClick={() => onSelect(selected === c.id ? null : c.id)}
                      title={`${c.clan.name} · ${c.games}전`}
                      style={{ display: 'inline-flex', cursor: 'pointer', borderRadius: '50%', padding: 2, opacity: c.games === 0 ? 0.45 : 1, background: c.id === selected ? 'rgba(91,141,255,.28)' : 'transparent', boxShadow: c.id === selected ? '0 0 0 1px rgba(127,169,255,.8)' : undefined }}
                    >
                      <MarkCircle clan={c.clan} size={26} />
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

/* 옛 구간 줄(TierStrip)은 지우지 않았다 — ClanVsTiersCard 가 대신 그린다 (CLAUDE.md 1-4) */
void TierStrip

export function ClanDetailV3(props: ClanDetailV3Props) {
  const { data, matches, matchesLoading, hasMore, loadingMore, onLoadMore } = props
  const h2h = data.head_to_head
  const tiers = useMemo(() => {
    const set = new Set<number>()
    for (let d = 1; d <= Math.max(1, data.league.division_count); d += 1) set.add(d)
    for (const r of h2h) if (r.division !== null) set.add(r.division)
    return [...set].sort((a, b) => a - b)
  }, [h2h, data.league.division_count])
const [tier] = useState<number>(() => {
    /* 내 티어에 맞대결 기록이 있으면 내 티어. 없으면(승격·강등 직후 등) 가장 많이 뛴 티어 — 칩·구간 승률·상대전적이 같은 티어를 보게 (QA 교차검토 15) */
    if (h2h.some((r) => r.division === data.division)) return data.division
    const games = new Map<number, number>()
    for (const r of h2h) if (r.division !== null) games.set(r.division, (games.get(r.division) ?? 0) + r.win + r.lose)
    const best = [...games.entries()].sort((a, b) => b[1] - a[1])[0]
    return best ? best[0] : tiers.includes(data.division) ? data.division : tiers[0] ?? data.division
  })
  const [selected, setSelectedState] = useState<string | null>(() => h2h.find((r) => r.division === tier)?.league_clan_id ?? h2h[0]?.league_clan_id ?? null)
  const setSelected = (id: string | null) => { setSelectedState(id); props.onSelectOpponent(id) }
  useEffect(() => { props.onSelectOpponent(selected) }, [])  // 첫 상대를 페이지에 알린다
  const tierClans = props.tierClansOf(tier)
  const opp: ClanHeadToHead | null = (() => {
    if (selected === null) return null
    const known = h2h.find((r) => r.league_clan_id === selected)
    if (known) return known
    const row = tierClans?.find((r) => r.league_clan_id === selected)
    if (!row) return null
    /* 아직 안 붙어 본 클랜 — 0전 (지어내지 않는다 · 경기 없음이 사실이다) */
    return { league_clan_id: row.league_clan_id, clan: { id: row.clan.id, slug: row.clan.slug, name: row.clan.name, mark_bg_url: row.clan.mark.bg, mark_front_url: row.clan.mark.front }, division: row.division, win: 0, lose: 0, last_played_at: null, recent: [] }
  })()
  const tiered = data.league.division_count >= 2
  void tiered
  /* ★탭 둘★ (2026-09-11 사장님: «클랜별전적 · 플레이스타일 이렇게 나눠서 최대한 개인 페이지랑 비슷한 형식으로») */
  const [tab, setTab] = useState<'vs' | 'style'>('vs')
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 18 }}>
        {([['vs', '클랜별전적'], ['style', '플레이스타일']] as const).map(([key, label]) => (
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
      {tab === 'style' ? (
        <Card style={{ marginTop: 14 }}>
          <CardHead title={<span style={{ letterSpacing: '.06em' }}>PLAY STYLE</span>} right={
            <span style={{ fontSize: 10.5, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>시즌 Cloud 0 · {fmt(data.win + data.lose)}전 기준</span>
          } />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px 18px' }}>
            <span className="v3-hex-zoom" style={{ display: 'block', width: 300 * 1.55, height: 262 * 1.55 }}>
              <span style={{ display: 'block', transform: 'scale(1.55)', transformOrigin: 'top left' }}>
                <Hexagon axes={clanHexAxes(data.hexagon_v2)} id="clanHexTab" />
              </span>
            </span>
          </div>
        </Card>
      ) : (
      <>
      {/* 2026-09-11 사장님: 선수 페이지와 같은 방식 — 구간마다 한 칸, 마크를 누르면 그 클랜과의 승률로 */}
      <ClanVsTiersCard data={data} h2h={h2h} tierClansOf={props.tierClansOf} selected={selected} onSelect={setSelected} />
      {opp ? (
        <HeadToHeadCard data={data} opp={opp} vsMatches={props.vsMatches} expanded={props.expanded} onExpand={props.onExpand} />
      ) : (
        <Card style={{ marginTop: 14, padding: 18 }}><span style={{ fontSize: 12, color: V3.textGhost }}>시즌 Cloud 0 에 붙은 상대가 아직 없습니다</span></Card>
      )}
      </>
      )}
      <SectionBar title="최근 경기" />
      {matchesLoading ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>불러오는 중…</div>
      ) : matches.length === 0 ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>아직 경기가 없습니다.</div>
      ) : (
        <RecentRows data={data} matches={matches} expanded={props.expanded} onExpand={props.onExpand} />
      )}
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} style={{ marginTop: 10, width: '100%', padding: '11px 0', fontFamily: 'inherit', fontSize: 12.5, color: '#a9c3ff', background: 'rgba(91,141,255,.08)', border: '1px solid rgba(91,141,255,.35)', borderRadius: V3.radiusCard, cursor: 'pointer' }}>
          {loadingMore ? '불러오는 중…' : '더 불러오기'}
        </button>
      ) : null}
    </div>
  )
}
