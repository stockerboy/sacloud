'use client'

/**
 * ★클랜 머리 카드 — 선수 머리 카드(`PlayerHeaderV3`)와 ★같은 폼★★ (2026-09-23 저녁 사장님:
 *   「클랜 페이지도 개인페이지랑 똑같은 폼과 양식으로 만들어 — 토시 하나 다른 배치 없이」)
 *
 * ```
 *   ◉ 클랜명                      IPL              3,096점
 *     시즌 Cloud 0 · 162전    SEASON CLOUD 0        래더     [전적갱신] [기본정보]
 *   ─────────────────────────────────────────────────────────  ← 폰에서만: 승률·순위·최다연승·클랜원 줄
 * ```
 *
 * 선수 카드와 다른 것은 ★값★ 뿐이다 — 닉네임 자리에 클랜명, 소속 자리에 「시즌 · n전」,
 * 무기 칩 자리에 티어(IPL 만), 병영수첩 단추 자리에 전적갱신.
 * ⚠ 옛 클랜 카드(`ClanCardV3` — KPI 넉 줄 + 육각 + 주전 다섯)는 ★그대로 남겼다★ (`CLAUDE.md` 1-4).
 *   레이아웃의 `CLAN_HEADER_LIKE_PLAYER` 를 false 로 되돌리면 그 카드가 다시 선다.
 *   육각은 본문 오른쪽(`ClanDetailV3`) 으로 · 주전 다섯은 명단 카드가 말한다.
 */
import type { ReactNode } from 'react'
import { leagueDisplayName } from '../site-config'
import { leagueScreen, showsTier, type LeagueClanShow } from '@sacloud/contract'
import { SUPPLY_INFO, supplyRankColor, supplyRateColor } from './rankColors'
import { GhostButton, LeagueCenter, OfficialPill } from './PlayerBandV3'
import { MarkCircle, TierText, clanThemeOf } from './primitives'
import { V3, cardStyle, fmt, pct1, spacerStyle } from './tokens'
import { formatRating } from '../common/format'

/* 「공식」 알약 — PlayerBandV3 와 같은 스위치 (2026-09-20 사장님 「모든 공식 표시 다 없애」) */
const OFFICIAL_PILL = false

export interface ClanHeaderV3Props {
  data: LeagueClanShow
  infoHref: string
  seasonLabel: string
  /** 클랜원 수 — 병영 명부. 모르면 null */
  memberCount: number | null
  /** 전적갱신 단추 (레이아웃이 만든다 — 상태를 안다) */
  renewAction?: ReactNode
}

export function ClanHeaderV3({ data, infoHref, seasonLabel, memberCount, renewAction }: ClanHeaderV3Props) {
  const theme = clanThemeOf(data.clan.slug)
  const games = data.win + data.lose
  const showsLadder = leagueScreen(data.league.slug).clanColumns.rating
  const tiered = showsTier(data.league.slug) && data.league.division_count >= 2
  const rank = data.rank
  return (
    <section style={{ ...cardStyle, position: 'relative', overflow: 'hidden', marginTop: 22 }} className="v3-phead v3-phead--clan">
      {/* 1 · 신원 — 선수 카드의 `.v3-phead-id` 와 같은 격자·같은 치수 (마크 64 · 이름 30 · 점수 30) */}
      <div className="v3-phead-id" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '16px 18px 16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <MarkCircle clan={data.clan} size={64} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.deep, textShadow: `0 0 16px ${theme.main}80`, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{data.clan.name}</span>
              {tiered ? <span style={{ padding: '3px 8px', border: `1px solid ${V3.chipBorder}`, borderRadius: V3.radiusChip, background: V3.chip, whiteSpace: 'nowrap' }}><TierText division={data.division} leagueCategory={data.league.category} size={11} /></span> : null}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#767f96', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ color: theme.deep, fontWeight: 500 }}>시즌 Cloud 0 · {fmt(games)}전</span>
              {memberCount !== null && memberCount > 0 ? <><span style={{ color: '#b6bece' }}>·</span><span>클랜원 {fmt(memberCount)}명</span></> : null}
            </span>
          </span>
        </span>
        <LeagueCenter name={leagueDisplayName(data.league.slug, data.league.name)} season={seasonLabel} />
        <span className="v3-phead-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
          {showsLadder ? (
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{formatRating(data.rating)}</span>
              <span style={{ fontSize: 11, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{data.placement ? '배치 중' : '래더'}</span>
            </span>
          ) : null}
          {OFFICIAL_PILL && data.clan.is_official_clan ? <OfficialPill theme={theme} /> : null}
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {renewAction}
            <GhostButton href={infoHref}>기본정보</GhostButton>
          </span>
        </span>
      </div>

      {/* 2 · ★폰에서만★ — 선수 카드의 상세정보 줄과 같은 꼴 (supply-skin.css `.v3-phead-info-phone`) */}
      <div className="v3-phead-info-phone sac-info-card" style={{ position: 'relative', borderTop: `1px solid ${V3.rowDivider}` }}>
        <Row label="승률" sub={`${fmt(data.win)}승 ${fmt(data.lose)}패`}>
          <b style={{ fontSize: 21, fontWeight: 700, color: supplyRateColor(data.win_rate), whiteSpace: 'nowrap' }}>{pct1(data.win_rate)}</b>
        </Row>
        <Row label="랭킹" sub={data.rank_count === null ? '' : `${fmt(data.rank_count)}팀 중`}>
          {rank === null ? <span style={{ fontSize: 13, color: V3.textGhost }}>{data.placement ? '배치 중' : '집계 없음'}</span> : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}><b style={{ fontSize: 21, fontWeight: 700, color: supplyRankColor(rank) }}>{fmt(rank)}</b><span style={{ fontSize: 12, color: V3.textDim }}>위</span></span>
          )}
        </Row>
        <Row label="최다연승" sub={`${fmt(games)}전 중`} last>
          {data.max_win_streak === null ? <span style={{ fontSize: 13, color: V3.textGhost }}>-</span> : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}><b style={{ fontSize: 21, fontWeight: 700, color: V3.gold }}>{fmt(data.max_win_streak)}</b><span style={{ fontSize: 12, color: V3.textDim }}>연승</span></span>
          )}
        </Row>
      </div>
    </section>
  )
}

function Row({ label, sub, last, children }: { label: string; sub?: string; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: last ? 'none' : `1px solid ${V3.rowDivider}`, minHeight: 50 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: SUPPLY_INFO.white, whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
      <div style={spacerStyle} />
      {sub ? <span style={{ fontSize: 11, color: SUPPLY_INFO.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sub}</span> : null}
      {children}
    </div>
  )
}
