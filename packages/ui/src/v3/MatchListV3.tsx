'use client'

/**
 * ★리그 경기 목록 v3★ (2026-09-11 · QA 회차 1)
 *
 * `/league/{slug}/match` 는 옛 `MatchCard` 그대로였다 — 마크 없음 · «2티어 알수없음» · 펼쳐도 아무것도 안 나옴.
 * 사장님 «바로덮기»(사이트 전체를 v3 분위기로) 에 맞춰 선수·클랜 상세와 같은 줄·같은 스코어보드로 바꾼다.
 *
 * 이 목록은 **아무 편도 아니다.** 승/패 글자 대신 이긴 쪽을 파란 글씨로, 진 쪽을 흐리게.
 * 명단이 없는 경기는 «킬데스 수집중» 으로 잠근다 (2026-09-11 회의). 라운드 점수·MVP 는 펼친 뒤 상세에서 온다.
 * 옛 화면(`MatchListScreen` 의 legacy 분기)은 지우지 않았다 (`CLAUDE.md` 1-4).
 */
import { useState, type CSSProperties } from 'react'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { ClanScoreboardV3, listRoundsOf, ourSideOf } from './ClanDetailV3'
import { MarkCircle, MvpBadge, TierText, clanThemeOf, relativeKst } from './primitives'
import { V3, cardStyle } from './tokens'

export interface MatchListV3Props {
  leagueSlug: string
  leagueCategory: string
  matches: readonly MatchListItem[]
  matchesLoading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  expanded: Readonly<Record<string, MatchDetail>>
  onExpand: (match: MatchListItem) => void
}

const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '124px minmax(0,1fr) minmax(0,190px) 62px', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }

function Side({ clan, division, leagueCategory, won, align }: { clan: MatchListItem['league_clan']['clan']; division: number; leagueCategory: string; won: boolean; align: 'left' | 'right' }) {
  const theme = clanThemeOf(clan.slug)
  const name = <span style={{ fontSize: 13, fontWeight: won ? 700 : 500, color: won ? theme.ink : '#8d97ad', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clan.name}</span>
  const tier = <TierText division={division} leagueCategory={leagueCategory} size={10} />
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: '1 1 0', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {align === 'left' ? <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#dbe8ff', background: 'rgba(91,141,255,.22)', border: '1px solid rgba(91,141,255,.45)', borderRadius: 3, padding: '1px 4px' }}>WIN</span> : null}
      {align === 'left' ? <MarkCircle clan={clan} size={22} /> : null}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {name}
        {tier}
      </span>
      {align === 'right' ? <MarkCircle clan={clan} size={22} /> : null}
    </span>
  )
}

export function MatchListV3(props: MatchListV3Props) {
  const { matches, matchesLoading, hasMore, loadingMore, onLoadMore, expanded, onExpand, leagueCategory } = props
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div>
      {matchesLoading ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>불러오는 중…</div>
      ) : matches.length === 0 ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>아직 경기가 없습니다.</div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matches.map((m) => {
            const isOpen = open === m.id
            const detail = expanded[m.id]
            const pending = m.red.length === 0 && m.blue.length === 0
            /* 목록의 `league_clan` 이 이긴 쪽에 서 있다 (`win` 은 그 편 기준) — 왼쪽에 이긴 팀 */
            const left = m.win ? m.league_clan : m.opponent
            const right = m.win ? m.opponent : m.league_clan
            const mvp = m.mvp_player_id === null ? null : [...m.red, ...m.blue].find((p) => p.player_id === m.mvp_player_id) ?? null
            const viewerRounds = detail && detail.red_rounds !== null && detail.blue_rounds !== null && detail.red_rounds !== detail.blue_rounds ? (ourSideOf(detail) === 'red' ? [detail.red_rounds, detail.blue_rounds] : [detail.blue_rounds, detail.red_rounds]) : null
            /* 상세의 «보는 쪽» 은 목록의 league_clan 이다 — 왼쪽(이긴 팀)이 league_clan 이면 그대로, 아니면 뒤집는다 */
            const listRounds = listRoundsOf(m) /* [league_clan, 상대] */
            const rounds = viewerRounds && detail
              ? (left.league_clan_id === detail.league_clan.league_clan_id ? viewerRounds : [viewerRounds[1], viewerRounds[0]])
              : listRounds ? (left.league_clan_id === m.league_clan.league_clan_id ? listRounds : [listRounds[1], listRounds[0]]) : null
            const edge = clanThemeOf(left.clan.slug).ink
            /* player_count 는 양 팀 합(10) — 한쪽은 반 (QA 회차 2: «10v10» 으로 찍혔다) */
            const perSide = Math.max(1, Math.round(m.player_count / 2))
            return (
              <div key={m.id} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: isOpen ? 'rgba(91,141,255,.04)' : V3.card, opacity: pending ? 0.75 : 1 }}>
                <div onClick={() => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }} style={{ ...rowStyle, cursor: pending ? 'default' : 'pointer' }} className="v3-match-row v3-match-row--list">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: V3.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
                    <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{relativeKst(m.start_at)}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Side clan={left.clan} division={left.division} leagueCategory={leagueCategory} won align="left" />
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none', minWidth: 44 }}>
                      {rounds ? <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap', color: V3.textStrong }}>{rounds[0]}:{rounds[1]}</span> : <span style={{ fontSize: 10.5, color: '#3a4560' }}>VS</span>}
                      <span style={{ fontSize: 9, color: '#4e5b76', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{rounds ? 'ROUND' : `${perSide}v${perSide}`}</span>
                    </span>
                    <Side clan={right.clan} division={right.division} leagueCategory={leagueCategory} won={false} align="right" />
                  </span>
                  <span className="v3-match-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                    {pending ? <span style={{ fontSize: 11.5, color: '#8fa9d8', whiteSpace: 'nowrap' }}>킬데스 수집중</span> : mvp ? (
                      <>
                        <MvpBadge size={8.5} />
                        <MarkCircle clan={mvp.match_time_clan ? { slug: mvp.match_time_clan.slug, mark: mvp.match_time_clan.mark } : null} size={16} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ffe89a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mvp.name}</span>
                      </>
                    ) : <span style={{ fontSize: 11, color: V3.textGhost, whiteSpace: 'nowrap' }}>{perSide === 5 ? '' : `${perSide} vs ${perSide}`}</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? '#3f4c66' : isOpen ? '#a9c3ff' : V3.textGhost }}>
                    {pending ? '수집중' : <>상세 <span style={{ fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span></>}
                  </span>
                </div>
                {isOpen ? (
                  detail ? <ClanScoreboardV3 detail={detail} leagueCategory={leagueCategory} leagueSlug={props.leagueSlug} /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} style={{ marginTop: 10, width: '100%', padding: '11px 0', fontFamily: 'inherit', fontSize: 12.5, color: '#a9c3ff', background: 'rgba(91,141,255,.08)', border: '1px solid rgba(91,141,255,.25)', borderRadius: V3.radiusCard, cursor: loadingMore ? 'default' : 'pointer' }}>
          {loadingMore ? '불러오는 중…' : '더 불러오기'}
        </button>
      ) : null}
    </div>
  )
}
