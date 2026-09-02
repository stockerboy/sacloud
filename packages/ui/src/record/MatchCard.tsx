'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import type {
  MatchClanSnapshot,
  MatchDetail,
  MatchListItem,
  MatchPlayerStat,
} from '@sacloud/contract'
import { showsDivision } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { ClanHexagonV2 } from './ClanHexagonV2'

/**
 * 경기 당시 소속 클랜 (D-131).
 *
 * **현재 소속이 아니다.** 선수가 이적해도 과거 경기 화면은 변하지 않아야 한다.
 * 근거가 없으면 `null`이고, 그때는 마크를 그리지 않는다 — 현재 소속으로 메우지 않는다.
 */
export interface MatchTimeClan {
  name: string
  mark: { bg: string | null; front: string | null }
}
import { RelativeTime } from '../common/RelativeTime'
import { formatCount, formatRate, formatTeamCounts } from '../common/format'
import { rateClass } from '../common/rate'
import { ratingClass } from '../common/rating'
import { leagueClanPath } from '../common/paths'
import {
  NOT_RATED_BADGE,
  NOT_RATED_BADGE_TITLE,
  NOT_RATED_INLINE_TITLE,
  isRated,
} from './officialCopy'
import {
  SNIPER_MARK,
  SNIPER_MARK_TITLE,
  lineupPlayerHref,
  usedSniper,
} from './lineupCopy'
import {
  UNKNOWN,
  teamFirstSideLabel,
  formatMatchStartAt,
  formatRatingDelta,
  headshotView,
  kdaView,
  matchFirstSideLabel,
  matchWeaponLabel,
  mvpBadgeVisible,
  ratingCellView,
  ratingDeltaCellView,
  teamIsViewerClan,
  teamWon,
} from './matchDetailView'

/* ------------------------------------------------------------------ 재질 --- */

/**
 * 기록카드의 **재질** (D-250).
 *
 * - `holo`   홀로그램 유리판. **기본값이다.**
 * - `legacy` 2026-09-01 이전의 검정 카드(`bg-card` + `border-line`) 그대로.
 *
 * 옛 모습을 지우지 않고 남겨 둔다 (CLAUDE.md 10-4). `legacy` 는 재질뿐 아니라
 * 라인업 표의 **포지션 칸**도 함께 되살린다 — 그때 화면이 통째로 그것이었기 때문이다.
 * 새 화면(`holo`)에서는 그 자리가 **이 경기 래더 변동**이다.
 */
export type MatchCardLook = 'supply' | 'holo' | 'legacy'

interface LookClasses {
  /**
   * 카드·상세 패널 바깥 (테두리 + 면).
   *
   * `supply` 재질에서는 **승패에 따라 달라진다** — 그래서 문자열이 아니라 함수다.
   * 나머지 재질은 승패와 무관하므로 인자를 무시한다.
   */
  panel: (win: boolean) => string
  /** 패널 안쪽 표 상자의 테두리 */
  box: string
  /** 행 구분선 (`border-t` 와 같이 쓴다) */
  divider: string
}

const LOOK: Record<MatchCardLook, LookClasses> = {
  /*
    ★기본 재질 (2026-09-02 사장님 지시)★

    > "그냥 홀로그램 없애고 아예 서플라이랑 똑같이 카드 복제"
    > "경기상세카드도 전체색을 이긴건 파랑 진건 빨강으로 해야지"

    원본 3rd.supply 는 카드 **면 전체**를 칠한다 — 승리 연파랑 · 패배 연분홍.
    `적진` 때는 반대로 «면을 칠하지 않고 좌측 막대와 테두리로만» 갈랐다.
    그 판단을 되돌린다. 색값과 근거는 `styles.css` 의 `--color-win-bg` 주석에 있다.

    ⚠ 원본의 CSS 를 가져온 것이 아니다. **보고 새로 썼다** (`CLAUDE.md` 3장 4번).
  */
  supply: {
    panel: (win) => (win ? 'bg-win-bg border-win-line' : 'bg-lose-bg border-lose-line'),
    box: 'border-line',
    divider: 'border-t-line-soft',
  },
  /* 면은 `.holo-panel` 한 클래스가 만든다 — 그라데이션 한 겹, 추가 DOM 없음.
     **지우지 않는다** (`CLAUDE.md` 10-4) — `look="holo"` 로 그대로 돌아온다 */
  holo: {
    panel: () => 'holo-panel border-holo-edge',
    box: 'border-holo-edge-soft',
    divider: 'border-t-holo-line',
  },
  legacy: {
    panel: () => 'bg-card border-line',
    box: 'border-line',
    divider: 'border-t-line-soft',
  },
}

/**
 * 매치 카드 (기록실 목록의 한 줄, 아코디언).
 *
 * ── 원본 관측 구조 — 접힌 상태 (2026-08-28 원본 **모바일** 화면)
 * ```
 * ┃ 제3보급창고 - 8달 전                              +6점
 * ┃           ⭐MVP
 * ┃  승리    10 / 1 / 1          [마크] hing            ⌄
 * ┃         (90.9%)                 vs
 * ┃                            [마크] Celebrity
 * ```
 * - 맨 윗줄은 **`맵이름 - 상대시간` 한 줄**이다. 예전 구현은 맵·플레이시간·승패·상대시간을
 *   `w-24` 세로 칸에 쌓아 두었다. 플레이시간은 **펼친 상세의 첫 줄**로 옮겼다.
 * - 오른쪽 위는 래더 증감 하나뿐이다. `래더` 라벨 칸(`w-20`)은 없앴다.
 * - MVP 는 kda **위**의 빨간 알약(`★ MVP`)이다. 금색 글자가 아니다.
 * - **접힌 카드에는 라인업 10명이 없다.** 펼치면 나오는 표가 그 역할을 한다.
 * - 오른쪽 끝은 꺾쇠다. `상세보기` 글자 버튼이 아니다 (접근성 라벨로만 남는다).
 *
 * 위 다섯은 **원본이 PC 에서도 같은 구조**라고 보고 공통으로 고쳤다 —
 * 항목의 존재 여부와 배치 순서에 대한 변경이지 폭·여백에 대한 것이 아니다.
 * 반대로 **폭만 좁히는 것은 `max-md:`(= `@media (width < 48rem)`) 로만** 한다.
 *
 * 실측 색 — 승: 배경 #E0F2FE · 테두리 #BAE6FD · 막대 #0EA5E9 · 글자 #0284C7 · 래더 #0EA5E9
 *          패: 배경 #FEE2E2 · 테두리 #FECACA · 막대 #F87171 · 글자/래더 #EF4444
 * 카드 최소 높이 7rem.
 *
 * ── 원본 관측 구조 — 펼친 상태 (2026-08-28 원본 **모바일** 화면)
 * ```
 * 제3보급창고  5 vs 5                              14분 46초
 *         게임시작 - 2026년 6월 7일 오후 10시 41분
 * ─────────────────────────────────────────────────
 *  패배 [마크] hilarious-                            선레드
 *  플레이어              kda        무기      래더
 *  [마크] spearr      7 / 9 / 5     라플         -4
 *         1,696점      (43.8%)
 * ```
 * 팀 블록은 **레드 먼저, 블루 나중**이고 컬럼 헤더는 블록마다 반복된다.
 *
 * 픽셀 단위 간격·폰트 크기는 원본과 동일함이 검증되지 않았다 `[미확인]`.
 */

/** 초 → `10분 36초` (원본 표기) */
export function formatPlayTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

/** 래더 증감 → `+9점` / `-16점` (원본 표기) */
export function formatRatingUpdate(value: number): string {
  return `${value > 0 ? '+' : ''}${value}점`
}

/**
 * 접힌 카드의 MVP 표기 — **빨간 알약 안에 별 + `MVP`** (원본 모바일 관측).
 *
 * 예전에는 금색 글자 `MVP` 하나였다. 색은 이 화면이 이미 쓰는 빨강(`lose`) 토큰을 그대로 쓴다 —
 * 패배를 뜻하는 게 아니라 새 토큰을 만들지 않으려는 것이다.
 * `[미확인]` — 원본 알약의 정확한 빨강 값은 실측하지 못했다.
 */
function MvpPill() {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-[var(--radius)] border border-mvp px-1.5 py-0.5 text-[10px] leading-none text-mvp"
      title="MVP"
    >
      <span aria-hidden="true">★</span>
      MVP
    </span>
  )
}

/**
 * 아코디언 꺾쇠 (원본은 글자 버튼이 아니라 `⌄` 하나다).
 *
 * 아이콘만 남기면 스크린리더가 읽을 것이 없으므로 호출부가 `aria-label` 로 `상세보기` 를 남긴다.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={`h-4 w-4 ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 닉네임 → 리그 기록실 링크.
 *
 * 연결할 근거(canonical Player ID)가 없으면 **링크를 걸지 않고 이름만 그린다**.
 * 닉네임으로 사람을 찾아 잇지 않는다 — 동명이인이 있고, 그러면 남의 기록실로 보내게 된다.
 */
function PlayerLink({
  leagueSlug,
  playerId,
  children,
}: {
  leagueSlug: string
  playerId: string | null
  children: ReactNode
}) {
  const href = lineupPlayerHref(leagueSlug, playerId)
  if (href === null) return <span className="inline-block">{children}</span>
  return (
    <Link className="inline-block cursor-pointer hover:underline" href={href}>
      {children}
    </Link>
  )
}

function ClanSide({
  snapshot,
  leagueSlug,
  align,
}: {
  snapshot: MatchListItem['league_clan']
  leagueSlug: string
  align: 'left' | 'right'
}) {
  return (
    /* 모바일에서는 양 팀을 **위아래로 쌓는다** (원본 모바일 관측 — `[마크] hing / vs / [마크] Celebrity`).
       좌우로 두면 고정폭 22rem 이 필요해 카드가 화면 밖으로 나간다. PC 는 그대로 좌우다. */
    <div
      className={`w-42 max-md:w-full max-md:min-w-0 ${
        align === 'right' ? 'flex flex-row-reverse max-md:block' : ''
      }`}
    >
      {/* 모바일은 **가운데 정렬**이다. 원본은 `[마크] afterpray / vs / [마크] ★PURPLE★` 가
          `vs` 를 축으로 위아래 가운데가 맞는다. 왼쪽 정렬로 두면 이름 길이가 달라
          축이 어긋나 보인다 (2026-08-28 사용자 지적). PC 는 좌우 배치라 그대로 둔다. */}
      {/* 모바일에서는 **한 줄을 flex 로** 만든다.
          `inline-block` + `align-middle` 로 두면 1.25rem 짜리 마크가 글자 줄높이를
          비대칭으로 늘려서, 위아래 클랜 줄 높이가 달라지고 그 사이의 `vs` 가
          네모칸 아래쪽으로 치우쳐 보인다 (2026-08-28 사용자 지적).
          flex 로 바꾸면 줄 높이가 마크 높이로 고정돼 위아래가 정확히 대칭이 된다. */}
      <div
        className={`text-base max-md:flex max-md:items-center max-md:justify-center ${
          align === 'right' ? 'text-right' : ''
        }`}
      >
        <Link
          className="inline-block max-md:flex max-md:min-w-0 max-md:items-center"
          href={leagueClanPath(leagueSlug, snapshot.clan.slug)}
        >
          {/* 등록 클랜 판정은 마크 URL 이 아니라 클랜 객체가 한다 (D-146) */}
          <ClanMark
            clan={snapshot.clan}
            size="xs"
            /* 원본 실측: 접힌 카드 클랜 마크가 **39 device px** (기기 배율 3x → 13 CSS px).
               우리는 48px 이었다. 13/14rem ≈ 0.93rem 으로 맞춘다 (2026-08-28 픽셀 대조) */
            className="mr-1 shrink-0 max-md:h-[0.93rem] max-md:w-[0.93rem]"
            alt={snapshot.clan.name}
          />
          <span className="inline-block max-w-[100px] truncate align-middle max-md:max-w-[160px]">
            {snapshot.clan.name}
          </span>
        </Link>
        {/*
          원본 모바일 접힌 카드에는 **클랜 이름만** 있다 (2026-08-28 원본 관측).
          부리그·그 시점 클랜 점수 줄이 없다. 우리는 그 줄 때문에 카드가 한 줄씩 더 높았고
          사용자가 "UI 가 너무 크다" 고 지적했다.
          PC 는 예전 관측(`- 2부리그 1,149점`)이 있어 그대로 두고 모바일에서만 감춘다.
        */}
        <div className="text-sm text-faint max-md:hidden">
          {/* 부리그를 화면에 내지 않는 리그(지시 #9)는 점수만 남긴다. 값은 응답에 그대로 있다 */}
          {showsDivision(leagueSlug) ? (
            <>
              <span className="num">{snapshot.division}</span>부리그{' '}
            </>
          ) : null}
          {snapshot.placement ? (
            '배치고사'
          ) : snapshot.rating === null ? (
            /* 래더에 반영되지 않은 경기는 그 시점 클랜 점수 자체가 없다 (D-146).
               `0점` 으로 그리면 클랜 점수가 0이었던 것처럼 읽힌다.
               표기는 `알수없음` 하나로 통일한다 (2026-08-28 사용자 지시 — 예전 `미반영`).
               왜 값이 없는지는 툴팁으로만 알린다 */
            <span className="text-faint" title={NOT_RATED_INLINE_TITLE}>
              {UNKNOWN}
            </span>
          ) : (
            <span className="num">{formatCount(snapshot.rating)}점</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function MatchCard({
  match,
  leagueSlug,
  detail,
  onExpand,
  variant = 'player',
  look = 'supply',
}: {
  match: MatchListItem
  leagueSlug: string
  /** 펼쳤을 때 지연 로드된 상세 (없으면 로딩 중) */
  detail?: MatchDetail
  /** 아코디언을 펼칠 때 상세를 요청한다. 어느 기록실에서 펼쳤는지는 매치가 알고 있다. */
  onExpand?: (match: MatchListItem) => void
  /**
   * 어느 기록실의 카드인가.
   *
   * 원본은 두 화면의 접힌 카드 구성이 **서로 다르다** (2026-08-27 실측).
   * 선수 화면은 본인 K/D/A 칸이 있고 선공 진영·대전인원이 없다.
   * 클랜 화면은 그 반대다 — K/D/A 칸이 없고 `선레드/선블루` + `5 vs 5` 가 있다.
   */
  variant?: 'player' | 'clan'
  /** 카드 재질. 기본은 `supply`(면을 칠한다). `holo` · `legacy` 는 옛 재질 — 지우지 않았다 */
  look?: MatchCardLook
}) {
  const skin = LOOK[look]
  const [open, setOpen] = useState(false)
  const win = match.win
  const stat = match.player_stat
  /* 보는 쪽(`league_clan`)이 전반에 선 진영. 근거가 없으면 `null` 이고 칸을 비운다 (D-207) */
  const firstSide = matchFirstSideLabel(match.first_side)

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) onExpand?.(match)
  }

  return (
    <div>
      {/* 고정폭 칸의 합을 줄여 **모바일에서도 카드 안 가로 스크롤이 없다** (원본 동작).
          라인업 두 덩어리(`w-48` × 2) · 래더 라벨 칸(`w-20`) · 맵 세로 칸(`w-24`) ·
          `상세보기` 글자 버튼을 없앴고, 양 팀 클랜 칸(`w-88`)은 모바일에서만 유동폭으로 쌓는다.
          그래서 예전의 `.mobile-scroll-x` 도 필요 없어져 뺐다. */}
      <div
        /*
         * 카드 높이·간격은 **원본 스크린샷 실측값**이다 (2026-08-28).
         *   원본 카드 273 device px · 카드 사이 간격 28 device px
         *   우리   234 device px ·            17 device px   ← 17% 낮고 답답했다
         * 기기 배율 3x 이므로 273/3 = 91 CSS px ≈ 6.5rem, 28/3 ≈ 9.3 CSS px ≈ 0.66rem.
         * 좌우 여백은 `.pc-container` 에서 0 으로 뺐다 — 원본은 벽 끝까지 찬다.
         */
        /* 재질만 갈아 끼운다 (D-250). 높이·여백·배치는 위 실측값 그대로다 */
        className={`mobile-bleed mt-2 flex min-h-24 items-stretch border ${skin.panel(win)} max-md:mt-[0.66rem] max-md:min-h-[6.5rem]`}
      >
        {/* 좌측 막대. `supply` 재질에서는 **면도 함께** 칠해진다 (위 `LOOK` 주석).
            `적진` 때는 이 막대와 테두리가 승패를 가르는 유일한 표시였다 */}
        <div className={`w-[3px] shrink-0 ${win ? 'bg-win' : 'bg-lose'}`} />

        <div className="flex min-w-0 flex-grow flex-col">
          {/* 1행 — 왼쪽 `맵이름 - 상대시간`, 오른쪽 래더 증감 (원본 구조) */}
          <div className="flex items-center px-2 pt-1.5 text-sm text-meta">
            <div className="min-w-0 truncate">
              <span className="font-semibold">{match.map.name}</span>
              {' - '}
              <RelativeTime value={match.start_at} />
            </div>
            <div className="ml-auto shrink-0 pl-2 font-semibold">
              {/* 배치고사 중이면 래더 증감 대신 `배치고사` (원본 규칙) */}
              {match.placement ? (
                '배치고사'
              ) : match.rating_update !== null ? (
                /* 숫자 색은 **원본(3rd.supply) 것**이다 — 파랑/빨강 (2026-09-01 사용자 지시).
                   면·막대·「승리/패배」 글자는 `적진` 그대로다. 숫자만 갈아 끼웠다 */
                <span className={`num ${win ? 'text-num-win' : 'text-num-lose'}`}>
                  {formatRatingUpdate(match.rating_update)}
                </span>
              ) : (
                /* 5v5 가 아니라 래더에 반영되지 않은 경기다.
                   표기는 `알수없음` 하나로 통일한다 (2026-08-28 사용자 지시 — 예전 `미반영`) */
                <span className="text-faint" title={NOT_RATED_INLINE_TITLE}>
                  {UNKNOWN}
                </span>
              )}
            </div>
          </div>

          {/*
            2행 — 승패 · 본인 kda · 양 팀 클랜 · 꺾쇠

            이 줄은 **1행(맵·증감)을 뺀 나머지 공간**의 가운데에 놓인다. 그래서 카드 전체로
            보면 1행 높이의 절반만큼 아래로 치우친다 — 사용자가 "박스 가운데보다 밑에 있다"
            고 지적한 것이 이것이다 (2026-08-28).

            좁은 화면에서만 그 절반만큼 끌어올려 **카드 세로 정중앙**에 맞춘다.
            1행은 `pt-1.5`(0.375rem) + `text-sm` 한 줄이라 약 1.6rem 이고, 그 절반이 0.8rem 이다.
          */}
          <div className="flex flex-grow items-center max-md:-mt-[0.8rem]">
            {/* 사용자에게 필요한 상태는 **래더에 반영됐는가** 하나다 (D-149).
                `공식/비공식` 배지는 없앴다 — D-145 에서 `official` 은 래더 자격도
                가중치도 아니게 됐는데, 배지로 남겨 두면 "비공식이라 점수를 덜 준다"는
                폐기된 규칙을 화면이 계속 말하게 된다.
                `official` 값 자체는 출처·관리자용으로 DB 에 그대로 남는다. */}
            {isRated(match.participant_completeness) ? null : (
              <div className="flex w-16 shrink-0 flex-col items-center justify-center">
                <div
                  className="rounded-[var(--radius)] border border-line px-1 py-0.5 text-center text-[10px] leading-tight text-faint"
                  title={NOT_RATED_BADGE_TITLE}
                >
                  {NOT_RATED_BADGE}
                </div>
              </div>
            )}

            <div
              className={`w-14 shrink-0 text-center font-semibold tracking-[0.08em] ${
                win ? 'text-win' : 'text-lose'
              }`}
            >
              {win ? '승리' : '패배'}
            </div>

            {/* 개인 기록실에서만 본인 K/D/A가 표시된다 (클랜 기록실에서는 null) */}
            {stat ? (
              <div className="flex w-32 shrink-0 items-center justify-center text-meta max-md:w-28">
                {/*
                  모바일에서 `vs` 가 kda 가로선과 어긋나 보였다 (2026-08-28 사용자 지적).
                  원인은 이 칸이 [MVP 알약][kda][킬뎃%] **세 줄 묶음의 가운데**를 잡는데,
                  옆 클랜 칸은 [클랜][vs][클랜] 세 줄의 가운데를 잡기 때문이다.
                  MVP 유무에 따라 묶음 중심이 오르내려서 줄이 계속 어긋난다.

                  그래서 좁은 화면에서는 MVP 알약과 킬뎃% 를 **레이아웃에서 뺀다**(absolute).
                  그러면 이 칸의 높이는 kda 한 줄뿐이라 kda 가 정확히 세로 중앙에 오고,
                  옆 칸의 `vs` 도 세로 중앙이므로 **두 줄이 항상 맞는다.**
                */}
                <div className="text-center max-md:relative">
                  {/* MVP 는 kda **위**의 빨간 알약이다 (원본 모바일 관측) */}
                  {stat.mvp ? (
                    <div className="mb-0.5 flex justify-center max-md:absolute max-md:inset-x-0 max-md:bottom-full max-md:mb-0">
                      <MvpPill />
                    </div>
                  ) : null}
                  {stat.kill === null && stat.death === null && stat.assist === null ? (
                    /* 명단만 복원된 참가자다 — K/D/A 를 **모른다** (D-148).
                       표기는 `알수없음` 하나로 통일한다 (CLAUDE.md 6장 · UI_PARITY_AUDIT 6-6).
                       예전의 `- / - / -` 는 도메인 용어에 없는 표기였고, 같은 결측을
                       펼친 상세에서는 `알수없음` 으로 적고 있어 화면마다 말이 달랐다. */
                    <div
                      className="text-sm text-faint"
                      title="넥슨이 이 참가자의 K/D/A를 주지 않았습니다"
                    >
                      {UNKNOWN}
                    </div>
                  ) : (
                    <>
                      {/* 모바일 kda 는 원본이 더 작다 (2026-08-28 원본 화면과 나란히 대조).
                          `text-xl`(1.25rem) 로 두니 원본보다 약 35% 커 보였다.
                          PC 는 원본 실측값 그대로 두고 좁은 화면에서만 줄인다. */}
                      {/* 원본 스크린샷을 픽셀로 재서 맞췄다 (2026-08-28).
                          같은 기기·같은 배율에서 kda 글자 높이가 우리 43px · 원본 38px 이었다
                          (배율 1.13). `text-lg`(1.125rem) ÷ 1.13 ≈ 1rem 이라 `text-base` 로 둔다.
                          같은 사진에서 `제3보급창고 - 5일 전` 줄은 우리 33px · 원본 32px 로
                          이미 일치했다 — 루트 폰트와 `text-sm` 은 맞다는 뜻이다. */}
                      <div className="num text-xl font-semibold text-text-strong max-md:text-base">
                        {stat.kill ?? '-'} / <span className="text-num-lose">{stat.death ?? '-'}</span>{' '}
                        / {stat.assist ?? '-'}
                      </div>
                      {stat.kd_rate === null ? null : (
                        <div
                          className={`num text-sm ${rateClass(stat.kd_rate)} max-md:absolute max-md:inset-x-0 max-md:top-full`}
                        >
                          ({formatRate(stat.kd_rate)}%)
                        </div>
                      )}
                    </>
                  )}
                  {/* `탈주` 라벨은 접힌 카드에서 빼라는 지시다 (2026-08-28).
                      탈주 여부는 펼친 상세의 닉네임 취소선으로 이미 드러난다.
                      여기 두면 줄이 하나 늘어 카드가 높아지고, 원본에도 없다. */}
                </div>
              </div>
            ) : null}

            <div className="flex w-88 items-center max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:items-stretch">
              <ClanSide snapshot={match.league_clan} leagueSlug={leagueSlug} align="right" />
              <div className="px-2 text-sm text-meta max-md:flex max-md:items-center max-md:justify-center max-md:px-0 max-md:leading-none">
                vs
              </div>
              <ClanSide snapshot={match.opponent} leagueSlug={leagueSlug} align="left" />
            </div>

            {/* 클랜 기록실 카드에만 있는 칸 — 전반 진영 + 양 팀 인원 (UI_PARITY_AUDIT 5-8 · 5-9).
                `선레드`/`선블루` 는 **배틀로그 폭탄 근거**가 있을 때만 적는다 (D-207).
                근거가 없으면 **아무것도 적지 않는다** — `알수없음` 으로도 채우지 않는다.
                예전에는 red/blue 슬롯 이름으로 라벨을 붙였는데 그것이 뒤집힌 표기였다.
                근거 없는 라벨은 결측을 감추는 것이 아니라 **틀린 사실을 만드는 것**이다 (D-106). */}
            {variant === 'clan' ? (
              <div className="flex w-24 shrink-0 items-center justify-center text-center text-sm text-meta">
                <div>
                  {firstSide === null ? null : <div>{firstSide}</div>}
                  <div className={firstSide === null ? undefined : 'mt-1'}>
                    {formatTeamCounts(match.red.length, match.blue.length)}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="ml-auto flex shrink-0 items-center">
              <button
                type="button"
                onClick={toggle}
                aria-label="상세보기"
                aria-expanded={open}
                className="cursor-pointer px-2 py-2 text-faint transition-colors duration-100 hover:text-text-strong"
              >
                <Chevron open={open} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {open ? (
        <MatchDetailPanel match={match} detail={detail} leagueSlug={leagueSlug} look={look} />
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- 펼친 상세 --- */

/* ----------------------------------------------------------- 양 팀 대비 --- */

/**
 * 펼친 상세 맨 위의 **양 팀 대비 줄** (`적진`).
 *
 * ```
 * ┃ 승리  [마크] hilarious-     선레드    1부리그 1,149점
 * ┃ 패배  [마크] Celebrity      선블루    2부리그 알수없음
 * ```
 * 두 팀을 **바로 위아래로 붙여** 같은 컬럼에 놓는다. 이 화면에서 제일 먼저 읽혀야 하는 것이
 * "누가 이겼고 누가 졌나" 라서, 표 두 덩어리로 흩어 두지 않고 여기서 한 번에 보여 준다.
 *
 * 여기 있는 값은 전부 팀 헤더가 이미 갖고 있던 것이다 —
 * **합계를 새로 계산하지 않는다.** K/D/A 가 결측인 참가자가 섞여 있어서
 * 팀 합계를 만들면 "아는 것만 더한 수"가 사실인 척하게 된다 (D-148).
 *
 * 승패는 좌측 막대로만 구분한다. 패배 쪽은 `--color-lose`(회색)로 죽인다.
 */
function TeamCompare({
  rows,
  leagueSlug,
  skin,
}: {
  /** 재질 (D-250). 안쪽 상자는 **면을 겹치지 않는다** — 테두리·구분선만 받는다 */
  skin: LookClasses
  rows: readonly {
    key: 'red' | 'blue'
    won: boolean | null
    snapshot: MatchClanSnapshot | null
    /** 전반 진영 표기. 근거가 없으면 `null` — 칸을 비운다 (D-207) */
    first: string | null
  }[]
  leagueSlug: string
}) {
  return (
    <div className={`mt-3 border ${skin.box}`}>
      {rows.map((row, index) => (
        <div
          key={row.key}
          className={`flex items-stretch ${index === 0 ? '' : `border-t ${skin.divider}`}`}
        >
          <div
            className={`w-[3px] shrink-0 ${
              row.won === null ? 'bg-line' : row.won ? 'bg-win' : 'bg-lose'
            }`}
          />
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm">
            <div
              className={`w-10 shrink-0 font-semibold tracking-[0.08em] ${
                row.won === null ? 'text-faint' : row.won ? 'text-win' : 'text-lose'
              }`}
            >
              {/* 승패를 모르면(참가자가 비어 있음) 찍지 않는다 */}
              {row.won === null ? '' : row.won ? '승리' : '패배'}
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              {row.snapshot ? (
                <Link
                  className="group flex min-w-0 items-center"
                  href={leagueClanPath(leagueSlug, row.snapshot.clan.slug)}
                >
                  <ClanMark
                    clan={row.snapshot.clan}
                    size="xs"
                    className="mr-1.5 shrink-0"
                    alt={row.snapshot.clan.name}
                  />
                  {/* 색은 안쪽 `span` 이 가진다 — `a { color: inherit }` 가 유틸리티를 누른다 */}
                  <span className="truncate text-text-strong transition-colors duration-100 group-hover:text-accent">
                    {row.snapshot.clan.name}
                  </span>
                </Link>
              ) : null}
            </div>

            <div className="w-14 shrink-0 text-right text-faint">{row.first ?? ''}</div>

            <div className="w-40 shrink-0 text-right text-faint max-md:hidden">
              {row.snapshot ? (
                <>
                  {showsDivision(leagueSlug) ? (
                    <>
                      <span className="num">{row.snapshot.division}</span>부리그{' '}
                    </>
                  ) : null}
                  <SnapshotRating snapshot={row.snapshot} />
                </>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- 팀 표 --- */

/**
 * 한 팀의 참가자 표.
 *
 * `적진` — 면을 칠하지 않는다. 승패는 **좌측 막대**(승 `--color-win` · 패 `--color-lose`)와
 * 바깥 테두리로만 구분하고, 행 구분은 `--color-line-soft` 1px 하나다. 얼룩무늬는 없다.
 *
 * 접히는 것 (`showExtra`)
 * - **헤드샷 컬럼**
 *
 * 접혀 있어도 사라지지 않는 것
 * - `[S]` 는 닉네임 옆에 그대로 붙는다. **이 판에 스나를 들었다**는
 *   사실은 남아야 한다 (CLAUDE.md 6장 · `lineupCopy` 의 `usedSniper`)
 * - `무기` 컬럼(라이플/스나이퍼/알수없음) · `MVP` · `배치고사` · `알수없음`
 */
function TeamBlock({
  first,
  stats,
  snapshot,
  mvpPlayerId,
  leagueSlug,
  viewerPlayerId,
  showExtra,
  look,
  skin,
}: {
  /** 재질 + 마지막 칸이 무엇인가 (D-250) */
  look: MatchCardLook
  skin: LookClasses
  /** 이 블록의 전반 진영 표기 (`선레드`/`선블루`). 근거가 없으면 `null` — 비워 둔다 (D-207) */
  first: string | null
  stats: readonly MatchPlayerStat[]
  /** 이 진영의 클랜. 어느 클랜인지 잇지 못했으면 `null` — 지어내지 않는다 */
  snapshot: MatchClanSnapshot | null
  mvpPlayerId: string | null
  leagueSlug: string
  /** 이 기록실의 주인. 그 행을 한 단 밝게 한다. 클랜 기록실이면 `null` */
  viewerPlayerId: string | null
  /** `자세히` 가 켜져 있는가 — 이제 헤드샷 컬럼만 여기 달려 있다 */
  showExtra: boolean
}) {
  const won = teamWon(stats)

  return (
    <div className={`mt-3 flex items-stretch border ${skin.box}`}>
      <div
        className={`w-[3px] shrink-0 ${won === null ? 'bg-line' : won ? 'bg-win' : 'bg-lose'}`}
      />

      <div className="min-w-0 flex-1">
        {/*
          이 표가 누구 것인지만 밝힌다. 승/패 · 부리그 · 클랜 점수는 위의 `양 팀 대비` 줄이
          이미 나란히 보여 줬으므로 여기서 되풀이하지 않는다.
        */}
        <div className="flex items-center px-3 py-1.5 text-sm">
          {snapshot ? (
            <Link
              className="group flex min-w-0 items-center"
              href={leagueClanPath(leagueSlug, snapshot.clan.slug)}
            >
              <ClanMark
                clan={snapshot.clan}
                size="xs"
                className="mr-1.5 shrink-0"
                alt={snapshot.clan.name}
              />
              <span className="max-w-[160px] truncate text-text-strong transition-colors duration-100 group-hover:text-accent">
                {snapshot.clan.name}
              </span>
            </Link>
          ) : null}
          {first === null ? null : (
            <span className="ml-auto shrink-0 pl-2 text-faint">{first}</span>
          )}
        </div>

        {/* 예전에 여기 있던 **포지션 줄**은 없앴다 (2026-08-30 사용자 지시).
            `lineupPositionText` 는 다른 화면이 쓰고 있어 남겨 둔다 */}

        {/* 컬럼 머리 — 표마다 반복한다. 헤드샷은 `자세히` 에 달려 있다 */}
        <div
          className={`flex items-center border-t ${skin.divider} py-1.5 text-xs tracking-[0.12em] text-faint`}
        >
          <div className="w-52 px-3 max-md:w-auto max-md:min-w-0 max-md:flex-1">플레이어</div>
          <div className="w-28 text-center max-md:w-20">kda</div>
          <div className="w-20 text-center max-md:w-12">무기</div>
          {/* 마지막 칸의 역사 (D-250)
                딜량 → 포지션 (2026-08-30) → **래더** (2026-09-01)
              사용자 지시: "포지션도 사치야 딜량도 사치고 걍 둘다 지워버려".
              그 자리에 넣은 것은 **이 경기의 래더 변동**이다 — 열 명 모두에게 있고,
              카드 머리의 팀 단위 증감이 누구 때문에 갈렸는지를 여기서 말한다.
              옛 화면은 `look="legacy"` 로 그대로 살아 있다 (CLAUDE.md 10-4) */}
          <div className="w-24 text-center max-md:w-16">
            {look === 'legacy' ? '포지션' : '래더'}
          </div>
          {showExtra ? <div className="mobile-hide w-24 text-center">헤드샷</div> : null}
        </div>

        {stats.map((stat) => (
          <StatRow
            key={stat.player_id}
            stat={stat}
            mvpPlayerId={mvpPlayerId}
            leagueSlug={leagueSlug}
            viewerPlayerId={viewerPlayerId}
            showExtra={showExtra}
            look={look}
            skin={skin}
          />
        ))}
      </div>
    </div>
  )
}

/** 팀 헤더의 클랜 점수. 배치고사·래더 미반영을 숫자로 위장하지 않는다 */
function SnapshotRating({ snapshot }: { snapshot: MatchClanSnapshot }) {
  if (snapshot.placement) return <>배치고사</>
  if (snapshot.rating === null) {
    /* 래더에 반영되지 않은 경기라 그 시점 클랜 점수가 없다.
       표기는 `알수없음` 하나로 통일한다 (2026-08-28 사용자 지시 — 예전 `미반영`) */
    return (
      <span className="text-faint" title={NOT_RATED_INLINE_TITLE}>
        {UNKNOWN}
      </span>
    )
  }
  return <span className="num">{formatCount(snapshot.rating)}점</span>
}

function StatRow({
  stat,
  mvpPlayerId,
  leagueSlug,
  viewerPlayerId,
  showExtra,
  look,
  skin,
}: {
  stat: MatchPlayerStat
  mvpPlayerId: string | null
  leagueSlug: string
  viewerPlayerId: string | null
  showExtra: boolean
  look: MatchCardLook
  skin: LookClasses
}) {
  const kda = kdaView(stat)
  const rating = ratingCellView(stat)
  /** 이 경기의 래더 변동 — 딜량·포지션이 있던 자리다 (D-250) */
  const delta = ratingDeltaCellView(stat)
  const weapon = matchWeaponLabel(stat.weapon)
  /* 딜량 칸(막대 포함)과 포지션 칸은 화면에서 뺐다 (2026-08-30 · 2026-09-01 · D-250).
     `damage` · `position_label` 값 자체는 계약·DB·수집 파이프라인에 그대로 남는다 —
     **감추는 것과 지우는 것은 다르다** (D-245 와 같은 원칙) */
  const headshot = headshotView(stat.headshot, stat.kill)
  /* 보고 있는 선수의 행. `적진` 에서는 색을 얹지 않고 **바탕을 한 단 올린다**
     (`--color-card-2`). 얼룩무늬가 아니라 한 행에만 붙는 표시다 */
  const isViewer = viewerPlayerId !== null && viewerPlayerId === stat.player_id
  /* MVP 행은 **표에서 가장 세게** 표시한다 (2026-08-30 사용자 지시 — "조금 더 화려하고 세게").
     좌측 진홍 막대 + 한 단 올린 바탕 + 바깥으로 새는 빛. 이 표에서 빛이 새는 행은 이것뿐이라
     열 줄 중 어느 것이 MVP 인지 한눈에 잡힌다. 보고 있는 선수 표시(`bg-card-2`)보다 위다 */
  const isMvp = mvpPlayerId !== null && mvpPlayerId === stat.player_id

  return (
    <div
      className={`relative flex items-center border-t ${skin.divider} py-1.5 text-sm ${
        isMvp
          ? 'bg-card-2 shadow-[inset_3px_0_0_0_var(--color-accent),0_0_18px_-8px_var(--color-accent)]'
          : isViewer
            ? 'bg-card-2'
            : ''
      }`}
    >
      {/* 플레이어 칸은 **한 칸 2줄**이다 — 위 `[마크] 닉네임 [S]`, 아래 작은 글씨로 그 시점 래더 */}
      <div className="flex w-52 items-center px-3 max-md:w-auto max-md:min-w-0 max-md:flex-1">
        {/* 경기 당시 소속 클랜 (D-131). 무소속·미등록이면 fallback 마크가 그려진다 (D-146) */}
        <ClanMark
          clan={stat.match_time_clan}
          alt={stat.match_time_clan?.name ?? ''}
          size="xs"
          className="mr-1.5 shrink-0 max-md:h-[1.1rem] max-md:w-[1.1rem]"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center">
            <div className="min-w-0 truncate">
              <PlayerLink leagueSlug={leagueSlug} playerId={stat.player_id}>
                {/* 탈주 표시는 하지 않는다 (2026-08-28 사용자 지시).
                    닉네임에 취소선을 그으면 그 선수가 지워진 것처럼 읽힌다.
                    `dropout` 값은 DB·계약에 그대로 남는다 — 표시만 안 한다. */}
                <span className="text-text">{stat.name}</span>
              </PlayerLink>
            </div>

            {/* `[S]` — **이 경기에서** 스나이퍼를 들었다는 뜻이다 (CLAUDE.md 6장).
                포지션 줄이 접혀 있어도 이 사실은 남아야 해서 닉네임 옆에 붙인다.
                무기를 모르면(`null`) 붙이지 않는다 — 안 붙은 것이 "라이플이었다"는 뜻은 아니다 */}
            {usedSniper(stat.weapon) ? (
              <span
                className="num ml-1 shrink-0 text-xs text-meta"
                title={SNIPER_MARK_TITLE}
                aria-label={SNIPER_MARK_TITLE}
              >
                {SNIPER_MARK}
              </span>
            ) : null}

            {/* MVP — 닉네임 오른쪽. 예전에는 작은 별 하나였는데
                열 줄 사이에서 눈에 안 띄었다. **채운 알약**으로 올렸다
                (2026-08-30 사용자 지시 — "조금 더 화려하고 세게").
                이 표에서 면을 채우는 것은 이것 하나뿐이라 그만큼 세게 읽힌다.
                색만으로는 뜻이 전달되지 않으므로 `title`·`aria-label` 도 남긴다 */}
            {mvpBadgeVisible(stat.player_id, stat.mvp, mvpPlayerId) ? (
              <span
                className="ml-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-mvp px-1.5 py-[1px] text-[10px] font-bold leading-none text-ink shadow-[0_0_10px_-2px_var(--color-mvp)]"
                title="MVP"
                aria-label="MVP"
              >
                <span aria-hidden="true">★</span>
                MVP
              </span>
            ) : null}
          </div>

          {/* 그 시점 래더 점수. 색 등급은 랭킹·프로필과 같은 `ratingClass` 를 쓴다 */}
          <div className="text-xs">
            {rating.kind === 'placement' ? (
              <span className="text-faint">배치고사</span>
            ) : rating.kind === 'rating' ? (
              <span className={`num ${ratingClass(rating.value)}`}>
                {formatCount(rating.value)}점
              </span>
            ) : (
              <span className="text-faint">{UNKNOWN}</span>
            )}
          </div>
        </div>
      </div>

      <div className="w-28 text-center max-md:w-20">
        {kda.kind === 'unknown' ? (
          /* 3rd.supply 라인업으로 명단만 복원한 참가자다 — K/D/A 를 **모른다** (D-148).
             0 으로 채우면 "0킬을 했다"는 거짓 정보가 된다 */
          <span className="text-faint" title="넥슨이 이 참가자의 K/D/A를 주지 않았습니다">
            {UNKNOWN}
          </span>
        ) : (
          <>
            <div className="num text-text-strong">
              {kda.kill ?? '-'} / <span className="text-num-lose">{kda.death ?? '-'}</span> /{' '}
              {kda.assist ?? '-'}
            </div>
            {kda.rate === null ? null : (
              <div className={`num text-xs ${rateClass(kda.rate)}`}>({formatRate(kda.rate)}%)</div>
            )}
          </>
        )}
      </div>

      <div className="w-20 text-center text-meta max-md:w-12">
        {weapon === null ? <span className="text-faint">{UNKNOWN}</span> : weapon}
      </div>

      {/* 마지막 칸 (D-250)
          기본(`holo`)은 **이 경기 래더 변동**이다. 부호를 반드시 보이고, 배치고사 중이면
          숫자 대신 `배치고사` 를 쓴다 (0 으로 쓰면 "0점 움직였다" 가 된다).
          값이 없으면 `알수없음` — 지어내지 않는다.

          색은 새로 만들지 않았다. 표 안의 다른 숫자(kda)와 같은 `text-text-strong` 이다.
          카드 머리의 팀 증감처럼 승패색(진홍/회색)을 얹으면 펼친 표 한 장에 진홍 숫자가
          열 개 생겨 「진홍은 아껴 쓴다」(D-204)가 무너진다.

          `legacy` 에서는 이 자리가 예전처럼 **포지션**이다 (`스나수` · `2F` · `숏`).
          판정이 없으면 비운다 — `-` 나 `알수없음` 으로 채우지 않는다 (D-106) */}
      {/* 색·글꼴은 **칸에 직접** 준다. 값마다 `<span>` 을 하나씩 씌우면 한 경기에 열 개가
          늘어난다 (실측: 264 → 273 노드). 칸이 값 하나만 갖는 자리라 감쌀 이유가 없다 */}
      <div
        className={`w-24 text-center max-md:w-16 ${
          look === 'legacy'
            ? 'text-meta'
            : delta.kind === 'delta'
              ? 'num text-text-strong'
              : 'text-faint'
        }`}
        title={look !== 'legacy' && delta.kind === 'unknown' ? NOT_RATED_INLINE_TITLE : undefined}
      >
        {look === 'legacy' ? (
          stat.position_label?.trim() ? (
            stat.position_label
          ) : (
            <span className="text-faint">·</span>
          )
        ) : delta.kind === 'placement' ? (
          '배치고사'
        ) : delta.kind === 'delta' ? (
          formatRatingDelta(delta.value)
        ) : (
          UNKNOWN
        )}
      </div>

      {showExtra ? (
        <div className="mobile-hide w-24 text-center">
          {headshot.kind === 'unknown' ? (
            <span className="text-faint">{UNKNOWN}</span>
          ) : (
            <>
              <div className="num text-text-strong">{formatCount(headshot.headshot)}</div>
              {/* 비율은 킬 대비다. 킬을 모르거나 0킬이면 만들지 않는다 */}
              {headshot.rate === null ? null : (
                <div className="num text-xs text-faint">({formatRate(headshot.rate)}%)</div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 펼친 경기 상세.
 *
 * ```
 * 제3보급창고   5 vs 5                    14분 46초
 * 게임시작 - 2026년 6월 7일 오후 10시 41분      [자세히]
 * ┃ 승리 [마크] hilarious-   선레드  1부리그 1,149점   ← 양 팀 대비
 * ┃ 패배 [마크] Celebrity    선블루  2부리그 알수없음
 * ┃ [마크] hilarious-                        선레드   ← 레드 팀 표
 * ┃ [마크] Celebrity                         선블루   ← 블루 팀 표
 * ```
 *
 * 이 화면은 사이트에서 정보가 제일 많다. 그래서 **먼저 읽혀야 하는 것**(누가 이겼나)을
 * 맨 위에 한 덩어리로 놓고, 그 다음이 참가자 표, 나머지(헤드샷)는 `자세히` 로 접는다.
 *
 * 구성 보정·래더 반영 같은 **설명·안내 문구는 그리지 않는다.** 규칙 설명은 화면이 아니라
 * `docs/` 가 한다 (2026-08-28 사용자 지시).
 */
function MatchDetailPanel({
  match,
  detail,
  leagueSlug,
  look,
}: {
  match: MatchListItem
  detail?: MatchDetail
  /** 참가자 표의 닉네임을 **어느 리그의** 기록실로 보낼지 (경로에 리그 slug 가 들어간다) */
  leagueSlug: string
  /** 재질 + 마지막 칸 (D-250). 접힌 카드와 같은 값을 그대로 물려받는다 */
  look: MatchCardLook
}) {
  const skin = LOOK[look]
  /* 접힌 것이 기본이다. 이 화면에서 제일 자주 쓰이는 것은 kda·래더이고,
     헤드샷은 그것을 다 본 다음에 찾는 값이다 */
  const [showExtra, setShowExtra] = useState(false)

  /* 응답은 팀을 `league_clan` / `opponent`(보는 쪽 기준)로 주고 참가자는 진영으로 준다.
     둘을 이어야 팀 헤더에 클랜명을 적을 수 있다 (`teamIsViewerClan` 주석 참조) */
  const redIsViewer = detail ? teamIsViewerClan(detail.red_stats, match.win) : null
  const redSnapshot = redIsViewer === null ? null : redIsViewer ? match.league_clan : match.opponent
  const blueSnapshot =
    redIsViewer === null ? null : redIsViewer ? match.opponent : match.league_clan

  /* 전반 진영 표기 (D-207). 응답의 `first_side` 는 **보는 쪽 기준**이라, 어느 슬롯이
     보는 쪽인지(`redIsViewer`)를 알아야 두 블록에 나눠 붙일 수 있다.
     슬롯 이름(red/blue)으로 적으면 안 된다 — 그것이 뒤집혀 있던 원인이다. */
  const redFirstLabel = teamFirstSideLabel(redIsViewer, match.first_side)
  const blueFirstLabel = teamFirstSideLabel(
    redIsViewer === null ? null : !redIsViewer,
    match.first_side,
  )

  /* 이 기록실의 주인이 누구인지는 **응답이 이미 알려 준다** — 개인 기록실에서만
     `player_stat` 에 본인 스탯이 담긴다 (계약 주석). 별도 prop 을 받지 않는다.
     클랜 기록실에서는 `null` 이라 아무 행도 강조하지 않는다. */
  const viewerPlayerId = match.player_stat?.player_id ?? null

  /* 경기 육각형 — 두 쪽 중 **어느 쪽이 이 기록실의 주인인지**를 `league_clan_id` 로 고른다.
     슬롯 이름으로 고르지 않는 이유는 아래 렌더 자리 주석에 있다 (D-207 의 재발 방지). */
  const ourLeagueClanId = match.league_clan?.league_clan_id ?? null
  const hexSides = [detail?.red_hexagon_v2 ?? null, detail?.blue_hexagon_v2 ?? null]
  const ourHexagon =
    ourLeagueClanId === null
      ? null
      : (hexSides.find((side) => side?.league_clan_id === ourLeagueClanId) ?? null)
  const foeHexagon =
    ourHexagon === null
      ? null
      : (hexSides.find((side) => side !== null && side !== ourHexagon) ?? null)

  return (
    /* 펼친 상세도 **접힌 카드와 같은 색**이어야 한다 — 승리 파랑 · 패배 빨강.
       (여기서 `skin.panel` 을 함수 그대로 문자열에 넣고 있었다. 클래스가 통째로 깨진다) */
    <div className={`border border-t-0 ${skin.panel(match.win)} px-4 py-3 max-md:px-2`}>
      {/* 1행 — 맵 · 인원 (왼쪽) / 플레이시간 (오른쪽 끝) */}
      <div className="flex items-center text-sm text-faint">
        <div className="display text-base text-text-strong">{match.map.name}</div>
        {/* **양 팀 실제 인원**을 쓴다 (D-152).
            `player_count` 는 **총원**이다. 그걸 양쪽에 그대로 쓰면 정상 5대5 경기가
            `10 vs 10` 으로 보인다 — 운영에서 실제로 그렇게 보였다.
            `player_count / 2` 로 나누지도 않는다. 인원이 어긋난 경기(5대4)를
            반올림해 5대5 인 척하게 되기 때문이다. 라인업 배열의 길이가 사실이다. */}
        <div className="num ml-3">{formatTeamCounts(match.red.length, match.blue.length)}</div>
        {/* 플레이시간. 모르면 `알수없음` — 넥슨이 주지 않는 값이다 (D-034) */}
        <div className="ml-auto shrink-0 pl-2">
          {match.play_time === null ? (
            <span className="text-faint">{UNKNOWN}</span>
          ) : (
            <span className="num">{formatPlayTime(match.play_time)}</span>
          )}
        </div>
      </div>

      {/* 2행 — 게임시작 + `자세히` 토글 */}
      <div className="mt-1 flex items-center text-sm text-faint">
        <div className="num min-w-0 truncate">게임시작 - {formatMatchStartAt(match.start_at)}</div>
        {detail ? (
          <button
            type="button"
            onClick={() => setShowExtra((value) => !value)}
            aria-expanded={showExtra}
            className="ml-auto shrink-0 pl-2 text-xs text-faint transition-colors duration-100 hover:text-text-strong"
          >
            {showExtra ? '자세히 접기' : '자세히'}
          </button>
        ) : null}
      </div>

      {detail ? (
        <>
          {/* 양 팀 대비 — 이 화면에서 제일 먼저 읽혀야 하는 줄 */}
          <TeamCompare
            leagueSlug={leagueSlug}
            skin={skin}
            rows={[
              {
                key: 'red',
                won: teamWon(detail.red_stats),
                snapshot: redSnapshot,
                first: redFirstLabel,
              },
              {
                key: 'blue',
                won: teamWon(detail.blue_stats),
                snapshot: blueSnapshot,
                first: blueFirstLabel,
              },
            ]}
          />

          {/* 레드 팀을 먼저 그린다 */}
          <TeamBlock
            first={redFirstLabel}
            stats={detail.red_stats}
            snapshot={redSnapshot}
            mvpPlayerId={match.mvp_player_id}
            leagueSlug={leagueSlug}
            viewerPlayerId={viewerPlayerId}
            showExtra={showExtra}
            look={look}
            skin={skin}
          />
          <TeamBlock
            first={blueFirstLabel}
            stats={detail.blue_stats}
            snapshot={blueSnapshot}
            mvpPlayerId={match.mvp_player_id}
            leagueSlug={leagueSlug}
            viewerPlayerId={viewerPlayerId}
            showExtra={showExtra}
            look={look}
            skin={skin}
          />

          {/*
            경기 육각형 — **양 클랜을 한 도형에 겹쳐 그린다** (D-217 원문 · D-235 Q7).

              > "이거를 매 판마다 비교해서 경기상세에 넣어주고싶어 양쪽 클랜의 그래프 색을
              >  다르게해서 그린다음에 크기차이로 비교하기 편하게끔"

            ── 「우리」를 슬롯 이름으로 고르지 않는다
              응답이 각 쪽에 `league_clan_id` 를 함께 준다. 그것을 **이 기록실의 주인**
              (`match.league_clan`)과 맞춰 고른다. 슬롯 이름(red/blue)으로 고르면
              보는 쪽이 블루일 때 상대가 「우리」로 그려진다 — **선레드 표기가 뒤집혀 있던
              것과 똑같은 실수다** (D-207). 그래서 여기서는 슬롯을 안 믿는다.

            ── 배틀로그가 없으면 통째로 빠진다
              전체 경기의 1.4%에만 원문이 있다 (D-205). 대부분의 경기에서 이 칸은 없다.
              **그건 결함이 아니다.**
          */}
          {ourHexagon ? (
            <div className="mt-4 border-t border-line-soft pt-3">
              <ClanHexagonV2
                hexagon={ourHexagon.hexagon}
                name={match.league_clan?.clan?.name ?? '우리'}
                foe={
                  foeHexagon
                    ? {
                        hexagon: foeHexagon.hexagon,
                        name: match.opponent?.clan?.name ?? '상대',
                      }
                    : null
                }
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="py-4 text-center text-sm text-faint">불러오는 중…</div>
      )}
    </div>
  )
}
