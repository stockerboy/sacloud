'use client'

/**
 * ★★경기 카드 — 하나★★ (2026-09-22 밤 · 사장님)
 *
 * > 「경기카드는 무조건 통일이다 / Pc에서도 한가지 형식 / 모바일에서도 한가지 형식 /
 * >  총 두가지 형식으로 통일이다」
 *
 * ── 왜 이 파일이 있나
 *   같은 「경기 한 판」 을 세 화면이 ★각자 다른 카드★ 로 그리고 있었다 —
 *   리그홈·경기목록(`MatchListV3` · 한 줄 4칸) · 선수 상세(`PlayerDetailV3.MatchRows` ·
 *   6칸) · 클랜 상세(`ClanDetailV3.RecentRows` · 2칸×3줄). 화면을 옮길 때마다 카드가
 *   달라져 「같은 사이트가 맞나」 가 됐다. ★여기 하나로 모은다.★
 *
 * ── 두 판뿐이다
 *   PC   `mc-pc`    ① 맵·길이·승패·시각 ② 래더 ③ 내 K/D/A(선수) 또는 MVP(리그홈·클랜)
 *                   ④ 양 팀(마크·이름·티어·점수) ⑤ 명단 두 열 ⑥ 상세
 *   폰   `mc-phone` 머리줄(맵·시각·래더) / 승패 · K/D/A 또는 MVP · 양 팀 세로 · 펼치기
 *   갈림목은 `SB_PHONE_MAX`(700px) — 스코어보드와 ★같은 값★ 이다.
 *
 * ── 화면마다 다른 것은 「보는 사람」 뿐이다
 *   선수 상세는 ★보는 선수★ 가 있어 K/D/A 를 적고 명단에서 굵게 한다.
 *   리그홈·클랜 상세는 보는 선수가 없다 — 그 자리에 ★MVP★ 를 적는다.
 *   펼쳤을 때 무엇을 그릴지는 호출부가 `renderDetail` 로 준다 (스코어보드·경기분석 단추 포함).
 *
 * ── ★옛 카드 셋은 지우지 않았다★ (`CLAUDE.md` 1-4)
 *   각 화면의 `UNIFIED_MATCH_CARD` 를 `false` 로 두면 그 화면의 옛 카드가 돌아온다.
 *
 * ── 오른쪽이 비면 비워 둔다
 *   사장님: 「최근경기 경기카드 삽입할때 오른쪽 공간이 비면 일단 비워놔 내가 뭐 넣을지
 *   결정해줄게」. 카드는 제 폭(840 기준)만 쓰고 남는 자리를 ★안 채운다.★
 */
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import type { MatchDetail, MatchLineupEntry, MatchListItem } from '@sacloud/contract'
import { formatRating } from '../common/format'
import { Kda, MarkCircle, MvpMark, TierText, matchShownAt } from './primitives'
import { statColor } from './rankColors'
import { WIN_LOSS, V3, fmt } from './tokens'

/** 폰/PC 갈림목 — `PlayerDetailV3.SB_PHONE_MAX` 와 같은 값. 두 곳이 갈라지면 카드가 반쪽씩 바뀐다 */
export const MATCH_CARD_PHONE_MAX = 700

/** 카드가 쓰는 최대 폭 — 서플라이 본문 칸(840). 더 넓은 자리에서는 오른쪽을 비운다 */
export const MATCH_CARD_MAX_WIDTH = 840

export interface MatchCardLeague {
  category: string
  slug: string
}

export interface MatchCardViewer {
  /** 보는 선수 — 있으면 K/D/A 를 적고 명단에서 굵게 한다 */
  playerId: string
}

export interface MatchCardV3Props {
  match: MatchListItem
  league: MatchCardLeague
  viewer?: MatchCardViewer | null
  /**
   * ★기준 클랜이 없는 목록★ (리그홈 · 경기목록 · 홈). 거기서는 「승리/패배」 라는 말이
   * 거짓이다 — 누구 편에서 본 승리인가가 없다. 대신 ★이긴 클랜을 왼쪽에 WIN 표★ 로 둔다.
   * 선수·클랜 상세는 보는 쪽이 있으니 그대로 승리/패배다. 배치는 두 경우 ★똑같다★ — 칸 ①의 말만 다르다.
   */
  neutral?: boolean
  open: boolean
  onToggle: () => void
  /** 펼친 상세 — 아직 안 왔으면 `undefined` */
  detail: MatchDetail | undefined
  /** 펼쳤을 때 그릴 것 (스코어보드 · 경기분석 단추). 호출부가 준다 */
  renderDetail: (detail: MatchDetail) => ReactNode
}

const CSS = `
.mc-phone { display: none; }
@media (max-width: ${MATCH_CARD_PHONE_MAX}px) {
  .mc-pc { display: none !important; }
  .mc-phone { display: block; }
}
`

/** 「5달 전」 — 서플라이는 달까지 센다 (`relativeKst` 는 다른 화면이 쓰므로 안 건드린다) */
export function shortAgo(iso: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const min = Math.floor((Date.now() - at) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 31) return `${d}일 전`
  const mo = Math.floor(d / 30)
  return mo < 12 ? `${mo}달 전` : `${Math.floor(mo / 12)}년 전`
}

/** 경기 길이 — 「10분 36초」. 끝난 때를 모르면 `null` (지어내지 않는다) */
function durationOf(startAt: string, endAt: string | null): string | null {
  if (!endAt) return null
  const ms = Date.parse(endAt) - Date.parse(startAt)
  if (!Number.isFinite(ms) || ms <= 0) return null
  const sec = Math.round(ms / 1000)
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

/** 래더 증감 — 「+9점」 파랑 · 「-14점」 빨강. 0 이나 모르면 안 적는다 */
function RatingDelta({ value, size = 12 }: { value: number | null | undefined; size?: number }) {
  if (value === null || value === undefined || value === 0) return null
  return (
    <span style={{ fontSize: size, fontWeight: 700, whiteSpace: 'nowrap', color: value > 0 ? WIN_LOSS.winInk : WIN_LOSS.loseInk }}>
      {value > 0 ? '+' : ''}{fmt(value)}점
    </span>
  )
}

/** 접힌 줄의 한쪽 클랜 — 마크 + 이름, 그 밑에 「1부리그 1,508점」 */
function ClanSide({ snap, ink, league }: { snap: MatchListItem['league_clan']; ink: string; league: MatchCardLeague }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: '1 1 0' }}>
      <MarkCircle clan={snap.clan} size={20} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        {/* ★클랜명은 클랜 페이지로★ (2026-09-24 사장님 「클랜명 클릭해도 그 클랜페이지로 안가지는것들이 너무 많아」) — 줄 클릭(펼치기)로 안 번진다 */}
        <Link prefetch={false} href={`/clan/${snap.clan.slug}`} onClick={stopRow} style={{ fontSize: 12.5, fontWeight: 600, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, textDecoration: 'none' }}>{snap.clan.name}</Link>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
          {snap.division !== null ? <TierText division={snap.division} leagueCategory={league.category} leagueSlug={league.slug} size={10} /> : null}
          {snap.rating !== null ? <span style={{ fontSize: 10.5, color: V3.textFaint }}>{formatRating(snap.rating)}</span> : null}
        </span>
      </span>
    </span>
  )
}

/** 카드 줄의 onClick(펼치기)으로 안 번지게 — 링크는 링크만 한다 */
const stopRow = (e: MouseEvent) => { e.stopPropagation() }

/** 명단 한 열 — 보는 선수는 굵게. 스나이퍼는 `[S]` */
function LineupCol({ rows, meId }: { rows: readonly MatchLineupEntry[]; meId: string | null }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {rows.map((r) => {
        const me = meId !== null && r.player_id === meId
        return (
          <span key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <MarkCircle clan={r.match_time_clan ? { slug: r.match_time_clan.slug, mark: r.match_time_clan.mark } : null} size={14} />
            {/* ★명단 이름은 그 선수 페이지로★ (2026-09-24 사장님 「카드 안 펼치고 명단에서 바로 개인페이지로」) — 줄 클릭(펼치기)로 안 번진다 */}
            <Link prefetch={false} href={`/player/${r.player_id}`} onClick={stopRow} title={r.name} style={{ fontSize: 11, fontWeight: me ? 700 : 400, color: me ? V3.textStrong : V3.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, textDecoration: 'none' }}>{r.name}</Link>
            {r.weapon === 1 ? <span style={{ fontSize: 9, fontWeight: 700, color: V3.red, flex: 'none' }}>[S]</span> : null}
          </span>
        )
      })}
    </span>
  )
}

/** MVP 한 조각 — 마크 · 닉네임 · 배지 (배지가 제일 오른쪽 · 2026-09-11 사장님) */
function MvpChip({ entry }: { entry: MatchLineupEntry }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <MarkCircle clan={entry.match_time_clan ? { slug: entry.match_time_clan.slug, mark: entry.match_time_clan.mark } : null} size={16} />
      {/* ⚠ 2026-09-23 새벽 — MVP 이름이 금색('#8a6a12')이었다. MVP 는 빨강 배지 하나로 말한다 (사장님: 노랑→빨강 통일) · 이름은 본문색 */}
      <span style={{ fontSize: 12, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{entry.name}</span>
      {/* ⚠ 2026-09-23 — 배지가 flex 로 줄어들어 「★MV」 가 됐다(리그홈 「enanthate」). 배지는 안 줄고 이름이 양보한다 */}
      <span style={{ flex: 'none', display: 'inline-flex' }}><MvpMark size={15} /></span>
    </span>
  )
}

const pcGrid: CSSProperties = {
  display: 'grid',
  /* ⚠ 2026-09-22 밤 — ④ 를 넓혔다. 옛 값 '108px 62px 92px minmax(180px,1fr) minmax(210px,260px) 52px' 에서는
     840 카드에서 ④ 가 ~180 이라 클랜명이 「Celebr…」 로 잘렸다 (운영 화면을 찍어서 잡았다) */
  /* 2026-09-22 밤 두 번째 — 경기 상세(840)에서도 「Celebri…」 가 잘렸다. ④ 에 288px 이 가도록 ③·⑤ 를 한 단 더 양보 */
  /* ⚠ 2026-09-23 새벽 세 번째 — 운영 PC(840)를 재 보니 ③ 100px 에 「중정백기턔 ★MVP」 칩이 잘리고(「★MV」),
     ⑤ 명단 이름칸이 46px 라 「온몸던찌기」「육덕미시애호가」 가 «…» 였다. ③ 은 내용만큼(최대 140) ·
     ⑤ 200~230 · ④ 는 그만큼 양보(최소 220). 840 = 28 여백 + 60 간격 + 96+52+③+④+⑤+44 → ③+④+⑤ ≤ 560.
     옛 값 '96px 52px 100px minmax(240px,1fr) minmax(170px,200px) 44px' */
  /* 2026-09-23 네 번째 — 운영 재측정: 기준 없는 카드(WIN 칩)에서 ④ 클랜명 47px(「Poker…」), ③ MVP 칩 이름 38px.
     ④ 250 · ③ 132 · ⑤ 190, 간격 12→10 · 여백 14→12 로 574 확보 (132+250+190 = 572) */
  /* 다섯 번째 — 리그홈 「enanthate ★MVP」 가 132 를 넘어 배지가 잘렸다 → ③ 150 · ④ 244 · ⑤ 180 (합 574) */
  /* 여섯 번째 — ④ 244 에서 「PokerFa…」 (클랜명 55px). ①②⑥ 을 8·4·4 씩 줄여 ④ 260 (합 590) */
  /* 일곱 번째 — 선수 상세 ⑤ 「육덕미시애호가」 71>69 (2px) → ⑤ 186 · ③ 144 (enanthate 칩 141 은 든다) */
  /* 여덟 번째 — 열산 「methodcrew」 71>67 (2026-09-23 오후) → ⑤ 194 · ③ 140 */
  gridTemplateColumns: '88px 48px minmax(100px,140px) minmax(260px,1fr) minmax(194px,220px) 40px',
  alignItems: 'center',
  gap: 10,
  padding: '11px 12px',
}

export function MatchCardV3({ match: m, league, viewer = null, neutral = false, open, onToggle, detail, renderDetail }: MatchCardV3Props) {
  const edge = m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk
  const my = viewer ? m.player_stat : null
  /* 명단이 아직 안 들어온 경기 — 펼치지 않는다 (2026-09-10 사장님: «킬데스 수집중») */
  const pending = m.red.length === 0 && m.blue.length === 0
  const toggle = () => { if (pending) return; onToggle() }
  /* 명단 두 열 — 왼쪽이 ★보는 쪽★ (선수면 내 팀 · 아니면 league_clan 쪽) */
  const ourSide = my?.side ?? m.league_clan_side ?? 'red'
  const ours = ourSide === 'red' ? m.red : m.blue
  const theirs = ourSide === 'red' ? m.blue : m.red
  const mvpEntry = m.mvp_player_id === null ? null : [...m.red, ...m.blue].find((p) => p.player_id === m.mvp_player_id) ?? null
  const mvpIsViewer = viewer !== null && m.mvp_player_id !== null && m.mvp_player_id === viewer.playerId
  const line = neutral ? V3.cardBorder : m.win ? V3.winFaceLine : V3.loseFaceLine
  const face = neutral ? V3.card : m.win ? V3.winFace : V3.loseFace
  /* 기준이 없는 목록은 ★이긴 클랜을 왼쪽★ 에 (옛 MatchListV3 규칙 그대로) */
  const leftSnap = neutral && !m.win ? m.opponent : m.league_clan
  const rightSnap = neutral && !m.win ? m.league_clan : m.opponent
  const leftInk = neutral ? WIN_LOSS.winInk : m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk
  const rightInk = neutral ? WIN_LOSS.loseInk : m.win ? WIN_LOSS.loseInk : WIN_LOSS.winInk
  const winChip = <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: WIN_LOSS.winInk, background: 'rgba(91,141,255,.22)', border: '1px solid rgba(91,141,255,.45)', borderRadius: 3, padding: '1px 4px' }}>WIN</span>

  const kda = my
    ? <Kda kill={my.kill} death={my.death} assist={my.assist} size={16} />
    : null
  const kdPct = my && my.kd_rate !== null
    ? <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', color: statColor(my.kd_rate) }}>({my.kd_rate.toFixed(1)}%)</span>
    : null
  /* ★폰 가운데 칸★ — MVP 표를 ★머리줄 오른쪽(래더 점수 앞)★ 으로 옮겼다 (2026-09-23 사장님 사진 「엠브이피뱃지는 형광펜 친 곳으로」).
     그래서 폰에서는 K/D/A 와 % 만 남는다. PC 는 `middle` 그대로 */
  /* 2026-09-23 밤 사장님 「MVP 킬데스 위로 올리고 (PC·폰 둘 다)」 — 표를 K/D/A ★위★ 에. 옛 판: PC 는 아래 · 폰은 머리줄 오른쪽 */
  const middlePhone = !pending && my
    ? <>{mvpIsViewer ? <MvpMark size={13} /> : null}{kda ?? <span style={{ fontSize: 11, color: V3.textGhost }}>기록 없음</span>}{kdPct}</>
    : null
  /* ③ 칸 — 보는 선수가 있으면 K/D/A, 없으면 MVP. 둘 다 없으면 비운다 (지어내지 않는다) */
  const middle = pending
    ? <span style={{ fontSize: 11.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>킬데스 수집중</span>
    : viewer
      ? <>{mvpIsViewer ? <MvpMark size={15} /> : null}{kda ?? <span style={{ fontSize: 11, color: V3.textGhost }}>기록 없음</span>}{kdPct}</>
      : mvpEntry
        ? <MvpChip entry={mvpEntry} />
        : null
  const chevron = <span style={{ fontSize: 13, color: pending ? V3.textGhost : edge }}>{open ? '⌃' : '⌄'}</span>

  return (
    <div className={neutral ? 'mc-card' : m.win ? 'mc-card mc-card--win' : 'mc-card mc-card--lose'} style={{ border: `1px solid ${line}`, borderRadius: V3.radiusCard, overflow: 'hidden', background: face, opacity: pending ? 0.75 : 1, maxWidth: MATCH_CARD_MAX_WIDTH }}>
      <style>{CSS}</style>

      {/* ══ 폰 ══ */}
      <div className="mc-phone" onClick={toggle} style={{ cursor: pending ? 'default' : 'pointer' }}>
        {/*
          2026-09-23 낮 — 서플라이 폰 카드와 대조 (사장님 사진 · 393px 기준 사진 배율 2.34 로 잰 것 · docs/SUPPLY_MEASURED.md 8절)
            서플라이  카드 94 · 머리줄 ~20 (글자 16/700 · 시각 16/400 · 점수 16/700) · 몸통 ~75 · 승리 16 · K/D/A ~18/700 · % 13 · 클랜명 15 · 왼쪽 색띠 8px
            우리(전)  카드 122 · 머리줄 39 (13/11.5/12.5) · 몸통 83 · 승리 14 · 클랜명 12.5
          MVP 표는 머리줄 오른쪽(점수 앞)으로. 옛 값은 위 주석에 남긴다
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 12px 3px 13px', borderBottom: `1px solid ${line}` }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{m.map.name}</span>
          <span style={{ fontSize: 14, color: V3.textFaint, whiteSpace: 'nowrap' }}>- {shortAgo(matchShownAt(m))}</span>
          <span style={{ flex: 1 }} />
          {/* MVP 표는 K/D/A 위로 옮겼다 (2026-09-23 밤) */}
          <RatingDelta value={m.rating_update} size={15.5} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto 30px', alignItems: 'center', gap: 8, padding: '8px 4px 8px 13px' }}>
          {neutral ? winChip : <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>}
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>{middlePhone ?? middle}</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <MarkCircle clan={leftSnap.clan} size={19} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: leftInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{leftSnap.clan.name}</span>
            </span>
            <span style={{ fontSize: 11.5, color: V3.textGhost, paddingLeft: 25 }}>vs</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <MarkCircle clan={rightSnap.clan} size={19} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: rightInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{rightSnap.clan.name}</span>
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', borderLeft: `1px solid ${line}` }}>{pending ? null : chevron}</span>
        </div>
      </div>

      {/* ══ PC ══ */}
      <div className="mc-pc" onClick={toggle} style={{ ...pcGrid, cursor: pending ? 'default' : 'pointer' }}>
        {/* ① 맵 · 경기길이 · 승패 · N달 전 */}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
          {m.end_at ? <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>{durationOf(m.start_at, m.end_at) ?? ''}</span> : null}
          {neutral ? null : <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>}
          <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>{shortAgo(matchShownAt(m))}</span>
        </span>
        {/* ② 래더 증감 */}
        {/* 값이 없으면 「래더」 라벨도 안 적는다 — 라벨만 덩그러니 남던 것 (운영 리그홈 사진) */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
          {m.rating_update ? <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>래더</span> : null}
          <RatingDelta value={m.rating_update} size={12.5} />
        </span>
        {/* ③ 내 K/D/A 또는 MVP */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0, overflow: 'hidden' }}>{middle}</span>
        {/* ④ 양 팀 — 이름 밑에 티어·점수 */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {neutral ? winChip : null}
          <ClanSide snap={leftSnap} ink={leftInk} league={league} />
          <span style={{ fontSize: 10.5, color: V3.textGhost, flex: 'none' }}>vs</span>
          <ClanSide snap={rightSnap} ink={rightInk} league={league} />
        </span>
        {/* ⑤ 명단 두 열 — 왼쪽이 보는 쪽 */}
        {/* ⚠ 「수집중」 은 ③ 이 한 번만 말한다 — 여기와 ⑥ 은 비운다 (한 줄에 같은 말 세 번이었다) */}
        {pending ? <span /> : (
          <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, minWidth: 0 }}>
            <LineupCol rows={ours} meId={viewer?.playerId ?? null} />
            <LineupCol rows={theirs} meId={viewer?.playerId ?? null} />
          </span>
        )}
        {/* ⑥ 상세보기 */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? V3.textGhost : open ? WIN_LOSS.winInk : V3.textDim }}>
          {pending ? null : <><span>상세</span><span>보기</span>{chevron}</>}
        </span>
      </div>

      {open ? (
        detail ? renderDetail(detail) : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
      ) : null}
    </div>
  )
}

export interface MatchCardListV3Props {
  matches: readonly MatchListItem[]
  league: MatchCardLeague
  viewer?: MatchCardViewer | null
  neutral?: boolean
  expanded: Readonly<Record<string, MatchDetail>>
  onExpand: (match: MatchListItem) => void
  renderDetail: (detail: MatchDetail) => ReactNode
  style?: CSSProperties
  /**
   * ★처음부터 펼쳐 둘 경기 id★ (2026-09-24 사장님 「여기 펼쳐놔줘」 — 「오늘 가장 치열했던 경기」
   * 카드는 눌러야 열리는 게 아니라 ★처음부터 펼쳐져 있어야★ 한다). 안 주면 옛 판(전부 접힘) 그대로.
   */
  initialOpenId?: string | null
}

/** 카드 목록 — 펼침 상태를 여기서 하나만 쥔다 (한 번에 한 장) */
export function MatchCardListV3({ matches, league, viewer = null, neutral = false, expanded, onExpand, renderDetail, style, initialOpenId = null }: MatchCardListV3Props) {
  const [open, setOpen] = useState<string | null>(initialOpenId)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {matches.map((m) => (
        <MatchCardV3
          key={m.id}
          match={m}
          league={league}
          viewer={viewer}
          neutral={neutral}
          open={open === m.id}
          onToggle={() => { const next = open === m.id ? null : m.id; setOpen(next); if (next !== null) onExpand(m) }}
          detail={expanded[m.id]}
          renderDetail={renderDetail}
        />
      ))}
    </div>
  )
}
