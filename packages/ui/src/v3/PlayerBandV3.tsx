'use client'

/**
 * ★선수 카드 v3★ — 띠(마크 + 닉 + 무기칩 | 리그 | 공식·기본정보) + KPI 4칸 (2026-09-10 시안)
 *
 * KPI 줄 배경은 **소속 클랜 마크에서 뽑은 색**(`clanThemeOf`) 이다. 무소속이면 회색 기본 테마.
 * 래더 자리는 **실력 점수**(`hex.score`) 다 — 사장님 확정 (2026-09-10). 점수가 아직 없으면
 * 옛 래더를 «래더» 라벨로 그대로 보여 준다. 지어내지 않는다.
 */
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import type { LeaguePlayerDetail } from '@sacloud/contract'
import { rankColor, statColor } from './rankColors'
import { MarkCircle, clanThemeOf, hasFitMark, fitMarkUrl, RankText, type ClanTheme } from './primitives'
import { V3, cardStyle, fmt, pct1 } from './tokens'
import { formatRating } from '../common/format'

const WEAPON_LABEL: Readonly<Record<number, string>> = { 0: '라플', 1: '스나' }

const bandStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
  alignItems: 'center',
  gap: 13,
  padding: '14px 18px',
  borderBottom: `1px solid ${V3.divider}`,
}
const kpiRowStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
  borderTop: '1px solid #18233a',
}

/** 소속 클랜 테마 배경 — 선수 카드 KPI 줄에 깔린다 (시안 §2) */
export function ClanBackdrop({ theme, markSlug, watermark }: { theme: ClanTheme; markSlug: string | null; watermark: string }) {
  return (
    <>
      {markSlug && hasFitMark(markSlug) ? (
        <span
          aria-hidden
          style={{ position: 'absolute', left: '-3%', top: '-10%', width: '34%', height: '130%', backgroundImage: `url(${fitMarkUrl(markSlug)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', opacity: 0.11, pointerEvents: 'none' }}
        />
      ) : null}
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '62%', background: `linear-gradient(180deg,${theme.light}14,${theme.main}08 60%,transparent)`, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', background: `linear-gradient(0deg,${theme.deep}1a,transparent)`, pointerEvents: 'none' }} />
      <span aria-hidden className="v3-watermark" style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', fontSize: 34, fontWeight: 900, color: '#dff2ff', opacity: 0.12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {watermark}
      </span>
    </>
  )
}

/** 리그 이름 중앙 열 — in-flow (absolute 로 두면 좌우와 겹친다 · 시안 함정 1번) */
export function LeagueCenter({ name, season }: { name: string; season: string }) {
  return (
    <span className="v3-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 26, height: 1, background: 'linear-gradient(90deg,rgba(91,141,255,0),#5b8dff)' }} />
        <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '.2em', color: '#fff', lineHeight: 1, textShadow: '0 0 18px rgba(91,141,255,.55),0 0 40px rgba(91,141,255,.22)', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <span style={{ width: 26, height: 1, background: 'linear-gradient(90deg,#5b8dff,rgba(91,141,255,0))' }} />
      </span>
      <span style={{ fontSize: 9, letterSpacing: '.34em', color: V3.textGhost2, whiteSpace: 'nowrap' }}>{season}</span>
    </span>
  )
}

export function OfficialPill({ theme }: { theme: ClanTheme }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#cfeeff', border: `1px solid ${theme.main}8c`, borderRadius: 999, background: `${theme.main}1f`, boxShadow: `0 0 14px ${theme.main}38`, padding: '5px 11px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, background: theme.edge }} />공식
    </span>
  )
}

export function GhostButton({ children, href, onClick, disabled, theme }: { children: ReactNode; href?: string; onClick?: () => void; disabled?: boolean; theme?: ClanTheme }) {
  const style: CSSProperties = theme
    ? { fontSize: 11.5, color: '#cfeeff', border: `1px solid ${theme.main}73`, borderRadius: V3.radiusCtl, background: `${theme.main}1a`, padding: '6px 13px', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'none', opacity: disabled ? 0.5 : 1 }
    : { fontSize: 11.5, color: '#a4b6c8', border: '1px solid #24384c', borderRadius: V3.radiusCtl, background: '#0e1a28', padding: '6px 13px', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'none', opacity: disabled ? 0.5 : 1 }
  if (href) return <Link href={href} style={style}>{children}</Link>
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...style, fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}

export interface PlayerBandV3Props {
  data: LeaguePlayerDetail
  infoHref: string
  /** «SEASON CLOUD 0» 같은 시즌 글자 */
  seasonLabel: string
  /** 모드 · 무기 (0 라플 · 1 스나) */
  mainWeapon: number | null
}

export function PlayerBandV3({ data, infoHref, seasonLabel, mainWeapon }: PlayerBandV3Props) {
  const theme = clanThemeOf(data.clan?.slug)
  const hex = data.hex
  /* 점수 리그(hex 가 오는 리그)는 ★래더 등수를 안 쓴다★ — 10판 미만이면 등수 없음. 옛 판(래더로 떨어짐)은 아래 주석 (QA 회차 2 · 2026-09-11)
     const rank = hex?.score_rank ?? data.rank */
  const rank = hex ? hex.score_rank : data.rank
  const rankTotal = hex ? hex.score_total : data.rank_count
  const ink = rank === null ? V3.textMuted : rankColor(rank)
  const scoreShown = hex?.score !== null && hex?.score !== undefined
  const weaponLabel = mainWeapon === null ? null : (WEAPON_LABEL[mainWeapon] ?? null)
  const kdLabel = hex?.weapon === 0 ? '라플' : hex?.weapon === 1 ? '스나' : weaponLabel ?? ''
  /* 통합 킬뎃 — 서버가 100위 밖이라 감춘(null) 경우에도 무기별 킬·데스 합으로 다시 센다 (2026-09-11 사장님: 빈 칸 «-» 이상함) */
  const kdRate = (() => {
    if (data.kd_rate !== null) return data.kd_rate
    const kill = (data.sniper_kill ?? 0) + (data.rifle_kill ?? 0)
    const death = (data.sniper_death ?? 0) + (data.rifle_death ?? 0)
    return kill + death > 0 ? Math.round((kill / (kill + death)) * 1000) / 10 : null
  })()
  const kpis: { label: string; value: string; sub: string; color: string }[] = [
    scoreShown
      ? { label: '실력 점수', value: formatRating(hex.score as number), sub: hex.measuring ? '측정 중' : '', color: '#ffffff' }
      : hex
        ? { label: '실력 점수', value: '측정 중', sub: `${fmt(hex.games)}판 · 한 무기 10판부터`, color: V3.textMuted }
        : { label: '래더', value: formatRating(data.rating), sub: data.placement ? '배치 중' : '', color: '#ffffff' },
    { label: '승률', value: pct1(data.win_rate), sub: `${data.win}승 ${data.lose}패`, color: data.win_rate === null ? V3.textMuted : statColor(data.win_rate) },
    { label: '킬뎃', value: pct1(kdRate), sub: kdLabel, color: kdRate === null ? V3.textMuted : statColor(kdRate) },
    { label: '판킬', value: data.kill_per_match.toFixed(1), sub: '킬 / 판', color: V3.text },
  ]
  return (
    <section style={{ ...cardStyle, marginTop: 22, borderTop: `2px solid ${theme.edge}` }}>
      <div style={bandStyle} className="v3-band">
        <span style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
          <MarkCircle clan={data.clan} size={46} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.ink, textShadow: `0 0 16px ${theme.main}80`, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data.player.name}
              </span>
              {weaponLabel ? (
                <span style={{ fontSize: 11, color: V3.textMuted, border: `1px solid ${V3.chipBorder}`, borderRadius: V3.radiusChip, background: V3.chip, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                  {weaponLabel}
                </span>
              ) : null}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, color: '#6f93b4', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ color: theme.ink, fontWeight: 500 }}>{data.clan?.name ?? '무소속'}</span>
              {rank !== null ? (
                <>
                  <span style={{ color: '#3a4560' }}>·</span>
                  <RankText rank={rank} color={ink} />
                  {rankTotal !== null ? (
                    <span style={{ color: V3.textGhost2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>/ {fmt(rankTotal)}명</span>
                  ) : null}
                </>
              ) : null}
            </span>
          </span>
        </span>
        <LeagueCenter name={data.league.name} season={seasonLabel} />
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, minWidth: 0 }}>
          {data.clan?.is_official_clan ? <OfficialPill theme={theme} /> : null}
          <GhostButton href={infoHref}>기본정보</GhostButton>
        </span>
      </div>
      <div style={kpiRowStyle} className="v3-kpi">
        <ClanBackdrop theme={theme} markSlug={data.clan?.slug ?? null} watermark="Cloud 0" />
        {kpis.map((k) => (
          <div key={k.label} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: '15px 20px', borderRight: `1px solid ${V3.rowDivider}`, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, color: V3.textGhost, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{k.label}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 27, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', color: k.color }}>{k.value}</span>
              <span style={{ fontSize: 11, color: V3.textGhost, whiteSpace: 'nowrap' }}>{k.sub}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
