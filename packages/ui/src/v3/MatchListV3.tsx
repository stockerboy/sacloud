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
import { MarkCircle, MvpMark, TierText, relativeKst } from './primitives'
import { WIN_LOSS, V3, cardStyle } from './tokens'

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
  /* ★클랜명은 승패 색★ (2026-09-12 사장님) — 옛 판은 클랜마다 다른 색(clanThemeOf)이었다 */
  /*
   * ⚠ ★`maxWidth: 100%` 가 반드시 있어야 한다★ (2026-09-15 · 무한 QA).
   *   이 글자는 ★세로 flex★ 안에 있고 그 부모가 `align-items: flex-start` 다.
   *   그러면 자식 폭이 ★내용 크기★ 로 잡혀 부모보다 커지고, 제 `textOverflow` 가
   *   쓸 일이 없어진다 — 대신 부모의 `overflow: hidden` 이 ★말줄임 없이 싹둑★ 자른다.
   *   실측(폰 390px 홈): «plenilune» 이 «plenilun» 으로 잘렸다. 점 세 개도 없었다.
   */
  const name = <span style={{ fontSize: 13, fontWeight: won ? 700 : 600, color: won ? WIN_LOSS.winInk : WIN_LOSS.loseInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{clan.name}</span>
  const tier = <TierText division={division} leagueCategory={leagueCategory} size={10} />
  return (
    /*
     * ⚠ ★`v3-match-side` — 폰에서만 칸을 내용대로 나눈다★ (2026-09-17 무한 QA).
     *   `flex: 1 1 0` 은 두 팀에게 ★똑같은 폭★ 을 준다. PC 에서는 «VS» 가 정확히 가운데
     *   서야 하므로 그게 맞다. 그런데 폰(390px)에서는 한 줄에 326px 뿐이고 왼쪽 칸만
     *   ★WIN 배지 31px★ 를 더 짊어져서, 이름 자리가 오른쪽보다 늘 좁다.
     *   실측: «★PURPLE★» 은 77px 이 필요한데 67px 만 받아 «★PURP…» 로 잘렸다.
     *   상대는 «rNtwo-» 라 48px 만 쓰고 나머지를 남겼는데도 그 자리를 못 빌렸다.
     *   폰에서만 `1 1 auto` 로 바꾼다 — 짧은 이름이 남긴 자리를 긴 이름이 받는다.
     *   ★PC 는 한 픽셀도 안 바뀐다★ (규칙은 `tokens.css` 의 767px 아래에만 있다).
     */
    <span className="v3-match-side" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: '1 1 0', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {align === 'left' ? <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#dbe8ff', background: 'rgba(91,141,255,.22)', border: '1px solid rgba(91,141,255,.45)', borderRadius: 3, padding: '1px 4px' }}>WIN</span> : null}
      {align === 'left' ? <MarkCircle clan={clan} size={22} /> : null}
      {/*
        ★`overflow: hidden` 이 반드시 있어야 한다★ (2026-09-13 QA).
          `TierText` 는 `whiteSpace: nowrap` 이고 `overflow` 가 없다. 이 칸이 `minWidth: 0` 이라
          줄어들기는 하는데, ★줄어든 만큼 글자가 밖으로 삐져나갔다★ —
          홈 「최근 경기」(900px)에서 «CHALLENGER 1» 이 가운데 점수 위로 올라타
          «5:0» 과 «ROUND» 에 겹쳐 찍혔다. 폰에서도 같았다.
          이름(`name`)은 제 안에 말줄임이 있어서 멀쩡했다 — 티어만 새어 나간 것이다.
          여기서 잘라 두면 좁아질 때 티어가 ★겹치는 대신 잘린다.★
      */}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden', alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {name}
        {tier}
      </span>
      {align === 'right' ? <MarkCircle clan={clan} size={22} /> : null}
    </span>
  )
}

/**
 * 이 시간을 넘겨도 명단이 비어 있으면 ★기다리는 척을 그만둔다★ (2026-09-13 QA).
 * 수집 잡은 5분마다 돈다 — 6시간이면 72번 돌고도 남는다. 0 으로 두면 규칙이 꺼진다.
 */
const STALE_HOURS = 6

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
            /**
             * ★기다려도 안 오는 판★ (2026-09-13 QA).
             *
             * 명단 수집 잡은 ★5분마다★ 돈다. 그런데 화면은 명단이 비어 있으면
             * 언제까지나 «킬데스 수집중» 이라고 적었다 — 사장님이 ★14시간 전 경기★ 를
             * 보고 «이거 왜 아직도 수집중인지» 물으셨다.
             *
             * 실측으로 안 사실: 안 들어오는 판에는 까닭이 있고(클랜번호 미매핑 ·
             * 배틀로그 없음), 그런 판은 ★몇 시간을 더 기다려도 안 온다.★
             * `STALE_HOURS` 를 넘겼는데도 비어 있으면 ★기다리는 척을 그만둔다.★
             *
             * ⚠ 6시간은 ★잡이 확실히 여러 번 돌고도 남는 시간★ 이다 (5분마다 = 72번).
             *   서버가 «못 넣는다» 고 말해 주는 칸이 계약에 아직 없어서 ★시각으로 가른다★ —
             *   칸이 생기면 이 줄을 그 값으로 바꾼다. 0 으로 두면 규칙이 꺼진다.
             */
            const staleMs = STALE_HOURS * 3_600_000
            const stale =
              pending && staleMs > 0 && Date.now() - new Date(m.start_at).getTime() > staleMs
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
            /* 카드 왼쪽 세로선 — 이긴 팀 색 (2026-09-12 사장님: 승패 색으로 통일) */
            const edge = WIN_LOSS.winInk
            /* player_count 는 양 팀 합(10) — 한쪽은 반 (QA 회차 2: «10v10» 으로 찍혔다) */
            const perSide = Math.max(1, Math.round(m.player_count / 2))
            return (
              <div key={m.id} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: isOpen ? 'rgba(91,141,255,.04)' : V3.card, opacity: pending ? 0.75 : 1 }}>
                <div onClick={() => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }} style={{ ...rowStyle, cursor: pending ? 'default' : 'pointer' }} className="v3-match-row v3-match-row--list">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: V3.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.map.name}</span>
                    <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{relativeKst(m.start_at)}</span>
                  </span>
                  {/*
                    ⚠ ★2026-09-15 밤 — PC 에서 두 이름이 화면 양끝으로 벌어졌다★ (무한 QA).
                      이 칸은 격자에서 `1fr` 이라 1280px 에서는 900px 가까이 된다. 그 안에서
                      양 팀이 `flex: 1 1 0` 으로 좌우 끝에 붙으니 «누가 누구와» 가
                      ★한눈에 안 들어왔다.★ 가운데 «VS» 둘레만 텅 비었다.
                      칸은 그대로 두고 ★안쪽만 가운데로 모은다★ — 폰은 이 폭보다 좁아 그대로다.
                  */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%', maxWidth: 520, marginInline: 'auto' }}>
                    <Side clan={left.clan} division={left.division} leagueCategory={leagueCategory} won align="left" />
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none', minWidth: 44 }}>
                      {rounds ? <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap', color: V3.textStrong }}>{rounds[0]}:{rounds[1]}</span> : <span style={{ fontSize: 10.5, color: '#3a4560' }}>VS</span>}
                      <span style={{ fontSize: 9, color: '#4e5b76', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{rounds ? 'ROUND' : `${perSide}v${perSide}`}</span>
                    </span>
                    <Side clan={right.clan} division={right.division} leagueCategory={leagueCategory} won={false} align="right" />
                  </span>
                  <span className="v3-match-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                    {pending ? <span style={{ fontSize: 11.5, color: stale ? V3.textGhost : '#8fa9d8', whiteSpace: 'nowrap' }}>{stale ? '기록 없음' : '킬데스 수집중'}</span> : mvp ? (
                      /* ★마크 · 닉네임 · MVP배지★ 순 — 배지가 제일 오른쪽 끝이다 (2026-09-11 사장님: 모든 경기카드 통일) */
                      <>
                        <MarkCircle clan={mvp.match_time_clan ? { slug: mvp.match_time_clan.slug, mark: mvp.match_time_clan.mark } : null} size={16} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ffe89a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mvp.name}</span>
                        <MvpMark size={15} />
                      </>
                    ) : <span style={{ fontSize: 11, color: V3.textGhost, whiteSpace: 'nowrap' }}>{perSide === 5 ? '' : `${perSide} vs ${perSide}`}</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? '#3f4c66' : isOpen ? '#a9c3ff' : V3.textGhost }}>
                    {/*
                      ⚠ ★2026-09-15 밤 — 같은 말을 두 번 하고 있었다★ (무한 QA).
                        바로 왼쪽 칸이 이미 «킬데스 수집중» / «기록 없음» 이라고 말하는데
                        여기서 또 «수집중» / «—» 을 적어 한 줄에 같은 말이 두 번 나왔다.
                        칸은 남긴다 (격자가 어긋나면 안 된다) — ★글자만★ 지운다.
                    */}
                    {pending ? null : <>상세 <span style={{ fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span></>}
                  </span>
                </div>
                {isOpen ? (
                  detail ? <ClanScoreboardV3 detail={detail} leagueCategory={leagueCategory} leagueSlug={props.leagueSlug} winnerFirst /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
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
