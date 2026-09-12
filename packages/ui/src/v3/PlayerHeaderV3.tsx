'use client'

/**
 * ★선수 상세 머리 카드★ (2026-09-11 사장님 목업 — PC 먼저, 폰은 목업 그대로)
 *
 * 옛 판은 두 장이었다 — 띠(`PlayerBandV3`) + 구간 카드(`PlayerDetailV3` 안 `TierRecordCard`).
 * 사장님 목업은 ★한 장★ 이다:
 *
 * ```
 *            플레이구간  [ASTRA ▼]
 *   ⬤ starry [라플]                                 3,519점
 *     sometimes · 1위 / 697명                      [기본정보]
 *   ───────────────────────────────────────────────────────
 *   승률 65.7%        킬뎃 57.7% [라플][스나]     판킬 10.6
 *   44승 23패
 *   ───────────────────────────────────────────────────────
 *   ★ MVP 11회 19.3%                        🚨 핵의심 0회
 * ```
 *
 * ★숫자는 전부 «고른 구간 · 고른 무기» 다★ (사장님 2026-09-11):
 *   «여기 나오는 승률 킬뎃은 통합이 아니라 라플수이면 그 구간 라플킬뎃 스나수이면 그 구간 스나킬뎃»
 *   → 승률·킬뎃·판킬 셋 다 `tier_breakdown[구간]` 의 무기 칸을 읽는다. 통합(시즌 전체)이 아니다.
 *   무기를 모르는 판은 어느 무기에도 안 들어간다 — 그래서 «무기 합 ≠ 구간 전체» 일 수 있다.
 *
 * 값이 없으면 `-` 다. 지어내지 않는다.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { LeaguePlayerDetail } from '@sacloud/contract'
import { rankColor, statColor } from './rankColors'
import { GhostButton, LeagueCenter, OfficialPill } from './PlayerBandV3'
import { MarkCircle, RankText, TierText, clanThemeOf } from './primitives'
import { V3, cardStyle, fmt, pct1, spacerStyle } from './tokens'
import { formatRating } from '../common/format'
import { floorColor } from './rankColors'

const WEAPON_LABEL: Readonly<Record<number, string>> = { 0: '라플', 1: '스나' }

export interface PlayerHeaderV3Props {
  data: LeaguePlayerDetail
  infoHref: string
  seasonLabel: string
  /** 주무기 (0 라플 · 1 스나) — 첫 화면의 무기 칩이 이것부터 선다 */
  mainWeapon: number | null
  /** 핵의심 — 없으면 그 칸을 안 그린다 */
  report?: { count: number; reported: boolean; pending: boolean; message: string | null; onReport: () => void }
}

type Row = LeaguePlayerDetail['tier_breakdown'][number]

const cellStyle: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 20px', minWidth: 0 }

function Kpi({ label, value, sub, color, extra }: { label: string; value: string; sub?: ReactNode; color: string; extra?: ReactNode }) {
  return (
    <div style={{ ...cellStyle, borderRight: `1px solid ${V3.rowDivider}` }} className="v3-phead-cell">
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 10.5, color: V3.textGhost, letterSpacing: '.08em', whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
        {sub ? <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span> : null}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', color }}>{value}</span>
        {extra}
      </span>
    </div>
  )
}

export function PlayerHeaderV3({ data, infoHref, seasonLabel, mainWeapon, report }: PlayerHeaderV3Props) {
  const theme = clanThemeOf(data.clan?.slug)
  const hex = data.hex
  /* ★특성 배지★ — 열 위 안에 든 축 (2026-09-12 사장님). STRENGTH POINT 카드와 같은 값이다 */
  const badges = hex ? hex.axes.filter((a) => a.badge !== null && a.rank !== null) : []
  const rank = hex ? hex.score_rank : data.rank
  const rankTotal = hex ? hex.score_total : data.rank_count
  const rows = data.tier_breakdown
  const tiered = data.league.division_count >= 2

  /* ★플레이구간★ — 가장 많이 뛴 구간이 기본. 누르면 그것이 우선 */
  const [pickedTier, setPickedTier] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const mostPlayed = useMemo(() => {
    const played = rows.filter((r) => r.games > 0)
    if (played.length === 0) return rows[0]?.tier ?? 1
    return played.reduce((a, b) => (b.games > a.games ? b : a)).tier
  }, [rows])
  const tier = pickedTier ?? mostPlayed
  const sel: Row | null = rows.find((r) => r.tier === tier) ?? null

  /* ★무기★ — 그 구간에서 뛴 무기만 고를 수 있다. 주무기부터, 없으면 많이 뛴 쪽 */
  const [pickedWeapon, setPickedWeapon] = useState<number | null>(null)
  const weapons = useMemo(() => {
    const list: number[] = []
    if ((sel?.rifle_games ?? 0) > 0) list.push(0)
    if ((sel?.sniper_games ?? 0) > 0) list.push(1)
    return list
  }, [sel])
  const weapon = (() => {
    if (pickedWeapon !== null && weapons.includes(pickedWeapon)) return pickedWeapon
    if (mainWeapon !== null && weapons.includes(mainWeapon)) return mainWeapon
    if (weapons.length > 0) return (sel?.sniper_games ?? 0) > (sel?.rifle_games ?? 0) ? 1 : 0
    return null
  })()

  /* 고른 구간 · 고른 무기의 숫자 (무기가 없으면 구간 전체) */
  const rifle = weapon === 0
  /* ★승률은 그 구간의 통합 승률로 고정★ · ★킬뎃·판킬만 무기를 따라간다★ (2026-09-11 사장님) */
  const win = sel === null ? null : sel.win
  const lose = sel === null ? null : sel.lose
  const winRate = win === null || lose === null || win + lose === 0 ? null : Math.round((win / (win + lose)) * 1000) / 10
  const kd = sel === null ? null : weapon === null ? sel.kd : rifle ? sel.rifle_kd : sel.sniper_kd
  /* 판킬은 2026-09-11 에 순위 칸으로 바뀌었다 — 값은 남겨 둔다 (되돌릴 때 쓴다) */
  const perMatch = sel === null ? null : weapon === null ? null : rifle ? sel.rifle_kill_per_match : sel.sniper_kill_per_match
  void perMatch
  const kill = sel === null ? 0 : rifle ? sel.rifle_kill : sel.sniper_kill
  const death = sel === null ? 0 : rifle ? sel.rifle_death : sel.sniper_death
  const mvpRate = sel && sel.games > 0 ? (sel.mvp / sel.games) * 100 : null

  const weaponChips = weapons.length === 0 ? null : (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {weapons.map((w) => (
        <span
          key={w}
          onClick={() => setPickedWeapon(w)}
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.02em', padding: '3px 10px', borderRadius: 5, lineHeight: 1.45, cursor: 'pointer', whiteSpace: 'nowrap',
            color: w === weapon ? '#dbe8ff' : V3.textGhost,
            background: w === weapon ? 'rgba(91,141,255,.18)' : 'transparent',
            border: `1px solid ${w === weapon ? 'rgba(91,141,255,.5)' : V3.chipBorder}`,
          }}
        >
          {WEAPON_LABEL[w]}
        </span>
      ))}
    </span>
  )

  return (
    <section style={{ ...cardStyle, position: 'relative', overflow: 'hidden', marginTop: 22, borderTop: `2px solid ${theme.edge}` }} className="v3-phead">
      {/* 사장님이 준 구름성 그림 — 카드 위쪽에 은은하게 */}
      <span aria-hidden className="v3-phead-art" />
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 200, background: `linear-gradient(180deg, ${theme.main}1f, transparent 70%)`, pointerEvents: 'none' }} />

      {/* 1 · 플레이구간 · 무기 — 카드의 모든 숫자가 이 둘을 따른다 */}
      {tiered || weapons.length > 0 ? (
        <div className="v3-phead-tier" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '11px 16px 9px', flexWrap: 'wrap' }}>
          {tiered ? <span style={{ fontSize: 11, color: '#b9c6de', letterSpacing: '.06em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}>플레이구간</span> : null}
          <span style={{ position: 'relative', display: tiered ? 'inline-block' : 'none' }}>
            <span
              onClick={() => setOpen((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 8px', borderRadius: 5, background: 'rgba(10,16,28,.45)', border: `1px solid ${V3.chipBorder}` }}
            >
              <TierText division={tier} leagueCategory={data.league.category} size={13} />
              <span style={{ fontSize: 8, color: V3.textGhost }}>▼</span>
            </span>
            {open ? (
              <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 5, zIndex: 30, display: 'flex', flexDirection: 'column', minWidth: 132, padding: 4, gap: 2, borderRadius: 7, background: '#0d1524', border: `1px solid ${V3.cardBorder}`, boxShadow: '0 10px 26px rgba(0,0,0,.5)' }}>
                {rows.map((r) => (
                  <span
                    key={r.tier}
                    onClick={() => { setPickedTier(r.tier); setPickedWeapon(null); setOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', background: r.tier === tier ? 'rgba(91,141,255,.14)' : 'transparent' }}
                  >
                    <TierText division={r.tier} leagueCategory={data.league.category} size={12} />
                    <div style={spacerStyle} />
                    <span style={{ fontSize: 11, color: r.games > 0 ? V3.textFaint : '#3f4c66' }}>{fmt(r.games)}판</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          {weaponChips}
        </div>
      ) : null}

      {/* 2 · 신원 */}
      <div className="v3-phead-id" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '4px 18px 14px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
          <MarkCircle clan={data.clan} size={46} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.ink, textShadow: `0 0 16px ${theme.main}80`, overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.player.name}</span>
              {weapon !== null ? (
                <span style={{ fontSize: 11, color: V3.textMuted, border: `1px solid ${V3.chipBorder}`, borderRadius: V3.radiusChip, background: V3.chip, padding: '3px 8px', whiteSpace: 'nowrap' }}>{WEAPON_LABEL[weapon]}</span>
              ) : null}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, color: '#6f93b4', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ color: theme.ink, fontWeight: 500 }}>{data.clan?.name ?? '무소속'}</span>
              {rank !== null ? (
                <>
                  <span style={{ color: '#3a4560' }}>·</span>
                  <RankText rank={rank} color={rankColor(rank) ?? V3.textMuted} />
                  {rankTotal !== null ? <span style={{ color: V3.textGhost2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>/ {fmt(rankTotal)}명</span> : null}
                </>
              ) : null}
            </span>
          </span>
        </span>
        <LeagueCenter name={data.league.name} season={seasonLabel} />
        <span className="v3-phead-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
            {/* ★층수마다 색★ (2026-09-11 사장님). 아직 못 잰 «측정 중» 은 흐린 글자 그대로 */}
            <span style={{ fontSize: 21, fontWeight: 700, color: hex?.score !== null && hex?.score !== undefined ? floorColor(hex.score) : '#fff', whiteSpace: 'nowrap' }}>
              {hex?.score !== null && hex?.score !== undefined ? formatRating(hex.score) : hex ? '측정 중' : formatRating(data.rating)}
            </span>
            <span style={{ fontSize: 10, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{hex?.score !== null && hex?.score !== undefined ? '실력 점수' : hex ? `${fmt(hex.games)}판` : '래더'}</span>
            {/* ★미참여 감점★ (2026-09-11 사장님) */}
            {(data.activity_penalty ?? 0) > 0 ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#ff8a90', whiteSpace: 'nowrap' }}>미참여 −{Math.round(data.activity_penalty as number)}점</span>
            ) : null}
          </span>
          {data.clan?.is_official_clan ? <OfficialPill theme={theme} /> : null}
          <GhostButton href={infoHref}>기본정보</GhostButton>
        </span>
      </div>

      {/*
       * ★특성 배지★ (2026-09-12 사장님: «빈 공간에 뱃지 있는 선수는 여기에 진열해줘»).
       * 열 위 안에 든 축만 배지를 받는다 — 아래 STRENGTH POINT 카드가 쓰는 것과 ★같은 값★ 이다.
       * 배지가 없는 선수는 이 줄 자체가 안 그려져 카드가 길어지지 않는다.
       */}
      {badges.length > 0 ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '0 18px 12px' }}>
          <span style={{ fontSize: 9.5, color: V3.textGhost2, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>특성</span>
          {badges.map((a) => (
            <span key={a.key} title={a.desc ?? undefined} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', background: 'linear-gradient(100deg,rgba(255,216,61,.16),rgba(255,216,61,.04))', border: '1px solid rgba(255,216,61,.5)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ffe89a' }}>{a.badge}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#c9a94a' }}>{a.rank}위</span>
            </span>
          ))}
        </div>
      ) : null}
      {/* 3 · 승률 · 킬뎃 · 판킬 — 고른 구간 · 고른 무기 */}
      <div className="v3-phead-kpi" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderTop: '1px solid #18233a' }}>
        <Kpi
          label="승률"
          value={pct1(winRate)}
          sub={win === null || lose === null ? null : `${fmt(win)}승 ${fmt(lose)}패`}
          color={winRate === null ? V3.textMuted : statColor(winRate)}
        />
        <Kpi
          label="킬뎃"
          value={pct1(kd)}
          sub={weapon === null ? null : `${fmt(kill)} / ${fmt(death)}`}
          color={kd === null ? V3.textMuted : statColor(kd)}
        />
        {/* 2026-09-11 사장님: 판킬 자리에 ★순위★ */}
        <Kpi
          label="순위"
          value={rank === null ? '-' : `${fmt(rank)}위`}
          sub={rankTotal === null ? null : `/ ${fmt(rankTotal)}명`}
          color={rank === null ? V3.textMuted : rankColor(rank) ?? V3.textStrong}
        />
      </div>

      {/* 4 · MVP · 핵의심 */}
      <div className="v3-phead-foot" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', borderTop: `1px solid ${V3.rowDivider}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRight: `1px solid ${V3.rowDivider}`, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: V3.gold, whiteSpace: 'nowrap' }}>★</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: V3.textFaint, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>MVP</span>
          <div style={spacerStyle} />
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: (sel?.mvp ?? 0) > 0 ? '#ffe89a' : V3.textGhost }}>{fmt(sel?.mvp ?? 0)}</span>
            <span style={{ fontSize: 10.5, color: V3.textDim }}>회</span>
            <span style={{ fontSize: 11.5, color: mvpRate === null || mvpRate === 0 ? V3.textGhost : '#ffd166' }}>{mvpRate === null ? '-' : `${mvpRate.toFixed(1)}%`}</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', minWidth: 0 }}>
          <span style={{ fontSize: 13, lineHeight: 1, flex: 'none' }}>🚨</span>
          <span
            onClick={report && !report.pending ? report.onReport : undefined}
            style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: report?.reported ? '#ff6b6b' : '#c98f95', cursor: report ? (report.pending ? 'wait' : 'pointer') : 'default' }}
          >
            핵의심
          </span>
          <div style={spacerStyle} />
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: (report?.reported ? report.count : data.report_count) > 0 ? '#ff6b6b' : V3.textGhost }}>{fmt(report?.reported ? report.count : data.report_count)}</span>
            <span style={{ fontSize: 10.5, color: V3.textDim }}>회</span>
          </span>
        </div>
      </div>
      {report?.message ? <div style={{ position: 'relative', padding: '0 20px 9px', fontSize: 10.5, color: V3.textDim }}>{report.message}</div> : null}
    </section>
  )
}
