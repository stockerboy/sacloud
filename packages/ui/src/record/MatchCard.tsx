'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import type {
  MatchClanSnapshot,
  MatchDetail,
  MatchListItem,
  MatchPlayerStat,
} from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'

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
import { lineupPlayerHref } from './lineupCopy'
import {
  UNKNOWN,
  damageBarPercent,
  firstSideLabel,
  formatMatchStartAt,
  headshotView,
  kdaView,
  matchFirstSideLabel,
  matchWeaponLabel,
  maxDamage,
  mvpBadgeVisible,
  ratingCellView,
  teamIsViewerClan,
  teamWon,
} from './matchDetailView'

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
 *  플레이어              kda        무기      딜량
 *  [마크] spearr      7 / 9 / 5     라플   ▇▇▇ 1,504
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
    <span className="inline-flex items-center gap-0.5 rounded-full bg-lose px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
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
            /* 모바일에서만 1.5rem → 1.25rem 으로 조금 줄인다 (2026-08-28 사용자 지시) */
            className="mr-1 shrink-0 max-md:h-5 max-md:w-5"
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
        <div className="text-sm text-meta max-md:hidden">
          {snapshot.division}부리그{' '}
          {snapshot.placement ? (
            '배치고사'
          ) : snapshot.rating === null ? (
            /* 래더에 반영되지 않은 경기는 그 시점 클랜 점수 자체가 없다 (D-146).
               `0점` 으로 그리면 클랜 점수가 0이었던 것처럼 읽힌다.
               표기는 `알수없음` 하나로 통일한다 (2026-08-28 사용자 지시 — 예전 `미반영`).
               왜 값이 없는지는 툴팁으로만 알린다 */
            <span className="text-unknown" title={NOT_RATED_INLINE_TITLE}>
              {UNKNOWN}
            </span>
          ) : (
            `${formatCount(snapshot.rating)}점`
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
}) {
  const [open, setOpen] = useState(false)
  const win = match.win
  const stat = match.player_stat
  const firstSide = matchFirstSideLabel(match.blue_team)

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
        /* 카드 최소 높이도 모바일에서 줄인다 — 원본 카드가 더 낮다 */
        className={`mt-2 flex min-h-28 items-stretch border-b border-r border-t max-md:mt-1.5 max-md:min-h-0 ${
          win ? 'border-win-line bg-win-bg' : 'border-lose-line bg-lose-bg'
        }`}
      >
        <div className={`w-2 shrink-0 ${win ? 'bg-win-bar' : 'bg-lose-bar'}`} />

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
                <span className={win ? 'text-win-bar' : 'text-lose'}>
                  {formatRatingUpdate(match.rating_update)}
                </span>
              ) : (
                /* 5v5 가 아니라 래더에 반영되지 않은 경기다.
                   표기는 `알수없음` 하나로 통일한다 (2026-08-28 사용자 지시 — 예전 `미반영`) */
                <span className="text-unknown" title={NOT_RATED_INLINE_TITLE}>
                  {UNKNOWN}
                </span>
              )}
            </div>
          </div>

          {/* 2행 — 승패 · 본인 kda · 양 팀 클랜 · 꺾쇠 */}
          <div className="flex flex-grow items-center">
            {/* 사용자에게 필요한 상태는 **래더에 반영됐는가** 하나다 (D-149).
                `공식/비공식` 배지는 없앴다 — D-145 에서 `official` 은 래더 자격도
                가중치도 아니게 됐는데, 배지로 남겨 두면 "비공식이라 점수를 덜 준다"는
                폐기된 규칙을 화면이 계속 말하게 된다.
                `official` 값 자체는 출처·관리자용으로 DB 에 그대로 남는다. */}
            {isRated(match.participant_completeness) ? null : (
              <div className="flex w-16 shrink-0 flex-col items-center justify-center">
                <div
                  className="rounded border border-lose-line px-1 py-0.5 text-center text-[10px] leading-tight text-lose"
                  title={NOT_RATED_BADGE_TITLE}
                >
                  {NOT_RATED_BADGE}
                </div>
              </div>
            )}

            <div className={`w-14 shrink-0 text-center font-bold ${win ? 'text-win' : 'text-lose'}`}>
              {win ? '승리' : '패배'}
            </div>

            {/* 개인 기록실에서만 본인 K/D/A가 표시된다 (클랜 기록실에서는 null) */}
            {stat ? (
              <div className="flex w-32 shrink-0 items-center justify-center text-meta max-md:w-28">
                <div className="text-center">
                  {/* MVP 는 kda **위**의 빨간 알약이다 (원본 모바일 관측) */}
                  {stat.mvp ? (
                    <div className="mb-0.5 flex justify-center">
                      <MvpPill />
                    </div>
                  ) : null}
                  {stat.kill === null && stat.death === null && stat.assist === null ? (
                    /* 명단만 복원된 참가자다 — K/D/A 를 **모른다** (D-148).
                       표기는 `알수없음` 하나로 통일한다 (CLAUDE.md 6장 · UI_PARITY_AUDIT 6-6).
                       예전의 `- / - / -` 는 도메인 용어에 없는 표기였고, 같은 결측을
                       펼친 상세에서는 `알수없음` 으로 적고 있어 화면마다 말이 달랐다. */
                    <div
                      className="text-sm text-unknown"
                      title="넥슨이 이 참가자의 K/D/A를 주지 않았습니다"
                    >
                      {UNKNOWN}
                    </div>
                  ) : (
                    <>
                      {/* 모바일 kda 는 원본이 더 작다 (2026-08-28 원본 화면과 나란히 대조).
                          `text-xl`(1.25rem) 로 두니 원본보다 약 35% 커 보였다.
                          PC 는 원본 실측값 그대로 두고 좁은 화면에서만 줄인다. */}
                      <div className="text-xl font-semibold max-md:text-lg">
                        {stat.kill ?? '-'} / <span className="text-lose">{stat.death ?? '-'}</span> /{' '}
                        {stat.assist ?? '-'}
                      </div>
                      {stat.kd_rate === null ? null : (
                        <div className={`text-sm ${rateClass(stat.kd_rate)}`}>
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

            {/* 클랜 기록실 카드에만 있는 칸 — 선공 진영 + 양 팀 인원 (UI_PARITY_AUDIT 5-8 · 5-9).
                선공 진영은 넥슨이 주지 않아 실제로는 대부분 `알수없음` 이다 (D-034).
                플레이시간과 같은 규칙으로 **자리는 남기고** 모른다고 적는다 —
                예전에는 항목을 통째로 지워서, 같은 성격의 결측을 서로 다르게 다루고 있었다. */}
            {variant === 'clan' ? (
              <div className="flex w-24 shrink-0 items-center justify-center text-center text-sm text-meta">
                <div>
                  <div>
                    {firstSide === null ? (
                      <span className="text-unknown">{UNKNOWN}</span>
                    ) : (
                      firstSide
                    )}
                  </div>
                  <div className="mt-1">{formatTeamCounts(match.red.length, match.blue.length)}</div>
                </div>
              </div>
            ) : null}

            <div className="ml-auto flex shrink-0 items-center">
              <button
                type="button"
                onClick={toggle}
                aria-label="상세보기"
                aria-expanded={open}
                className="cursor-pointer px-2 py-2 text-meta"
              >
                <Chevron open={open} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {open ? <MatchDetailPanel match={match} detail={detail} leagueSlug={leagueSlug} /> : null}
    </div>
  )
}

/* --------------------------------------------------------------- 펼친 상세 --- */

/**
 * 팀 블록 하나 (원본 모바일 관측).
 *
 * ```
 *  패배 [마크] hilarious-                            선레드
 *  플레이어              kda        무기      딜량
 * ```
 * 진영 표기(`선레드`/`선블루`)는 **오른쪽 끝**이다.
 * 부리그·클랜 점수는 원본 모바일 팀 헤더에 **없다** — 모바일에서만 감춘다(`max-md:hidden`).
 * PC 헤더에는 예전 관측(`- 2부리그 1,149점`)이 있어 지우지 않았다. PC 원본을 다시 보고
 * 없다면 그때 통째로 지운다 `[미확인]`.
 *
 * 팀마다 **자체 배경색**을 깐다 — 승리는 sky, 패배는 red 계열.
 * 색은 매치 카드가 이미 쓰는 토큰(`win-bg` / `lose-bg`)을 그대로 쓴다. 새로 만들지 않는다.
 * 승패를 모르면(참가자가 비어 있음) 색을 고르지 않고 기본 배경으로 둔다 — 찍지 않는다.
 */
function TeamBlock({
  side,
  stats,
  snapshot,
  mvpPlayerId,
  matchMaxDamage,
  leagueSlug,
  viewerPlayerId,
}: {
  side: 'red' | 'blue'
  stats: readonly MatchPlayerStat[]
  /** 이 진영의 클랜. 어느 클랜인지 잇지 못했으면 `null` — 지어내지 않는다 */
  snapshot: MatchClanSnapshot | null
  mvpPlayerId: string | null
  /** 딜량 막대의 기준값 (경기 전체 최대). 아무도 모르면 `null` */
  matchMaxDamage: number | null
  leagueSlug: string
  /** 이 기록실의 주인. 그 행에 옅은 배경을 준다. 클랜 기록실이면 `null` */
  viewerPlayerId: string | null
}) {
  const won = teamWon(stats)
  /* 이 블록이 어느 진영인가로 정한다 — 레드 블록은 `선레드`, 블루 블록은 `선블루`.
     예전에는 `blue_team` 이 null 이면(= 넥슨 미제공, 대부분) 표기를 통째로 지웠다 */
  const first = firstSideLabel(side)

  const tone =
    won === null
      ? 'border-line bg-card'
      : won
        ? 'border-win-line bg-win-bg'
        : 'border-lose-line bg-lose-bg'

  /* 컬럼을 `플레이어 / kda / 무기 / 딜량` 으로 줄이고(래더는 플레이어 칸 아랫줄로 합쳤다)
     `헤드샷` 은 모바일에서만 감췄기 때문에(`.mobile-hide`) 이제 가로로 넘치지 않는다.
     예전의 `.mobile-scroll-x` + `w-max` 조합은 뺐다. */
  return (
    <div className={`mt-2 border ${tone}`}>
      <div className="flex items-center px-2 py-1.5 text-sm">
        {won === null ? null : (
          <span className={`font-bold ${won ? 'text-win' : 'text-lose'}`}>
            {won ? '승리' : '패배'}
          </span>
        )}
        {snapshot ? (
          <>
            <Link
              className="ml-2 inline-flex min-w-0 items-center"
              href={leagueClanPath(leagueSlug, snapshot.clan.slug)}
            >
              <ClanMark
                clan={snapshot.clan}
                size="xs"
                className="mr-1 shrink-0"
                alt={snapshot.clan.name}
              />
              <span className="max-w-[160px] truncate text-base">{snapshot.clan.name}</span>
            </Link>
            <span className="ml-2 text-meta max-md:hidden">
              - {snapshot.division}부리그 <SnapshotRating snapshot={snapshot} />
            </span>
          </>
        ) : null}
        <span className="ml-auto shrink-0 pl-2 text-meta">{first}</span>
      </div>

      {/* 컬럼 헤더는 팀 블록마다 반복한다 (원본 구조).
          `헤드샷` 은 원본 모바일에 없다 — PC 는 그대로 두고 모바일에서만 감춘다 */}
      <div className="flex items-center border-t border-t-line py-1 text-sm text-meta">
        <div className="w-52 px-2 max-md:w-auto max-md:min-w-0 max-md:flex-1">플레이어</div>
        <div className="w-28 text-center max-md:w-20">kda</div>
        <div className="w-20 text-center max-md:w-12">무기</div>
        <div className="w-36 text-center max-md:w-24">딜량</div>
        <div className="mobile-hide w-24 text-center">헤드샷</div>
      </div>

      {stats.map((stat) => (
        <StatRow
          key={stat.player_id}
          stat={stat}
          mvpPlayerId={mvpPlayerId}
          matchMaxDamage={matchMaxDamage}
          leagueSlug={leagueSlug}
          viewerPlayerId={viewerPlayerId}
        />
      ))}
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
      <span className="text-unknown" title={NOT_RATED_INLINE_TITLE}>
        {UNKNOWN}
      </span>
    )
  }
  return <>{formatCount(snapshot.rating)}점</>
}

function StatRow({
  stat,
  mvpPlayerId,
  matchMaxDamage,
  leagueSlug,
  viewerPlayerId,
}: {
  stat: MatchPlayerStat
  mvpPlayerId: string | null
  matchMaxDamage: number | null
  leagueSlug: string
  viewerPlayerId: string | null
}) {
  const kda = kdaView(stat)
  const rating = ratingCellView(stat)
  const weapon = matchWeaponLabel(stat.weapon)
  const bar = damageBarPercent(stat.damage, matchMaxDamage)
  const headshot = headshotView(stat.headshot, stat.kill)
  /* 보고 있는 선수의 행 (원본은 옅은 배경을 준다).
     `[미확인]` — 원본 하이라이트 색은 실측하지 못했다. 새 토큰을 만들지 않고
     랭킹 표가 이미 쓰는 행 배경(`--color-row`)을 그대로 쓴다. */
  const isViewer = viewerPlayerId !== null && viewerPlayerId === stat.player_id

  return (
    <div
      className={`flex items-center border-t border-t-line py-1 text-sm ${
        isViewer ? 'bg-row' : ''
      }`}
    >
      {/* 플레이어 칸은 **한 칸 2줄**이다 — 위 `[마크] 닉네임`, 아래 작은 글씨로 그 시점 래더.
          예전에는 `플레이어` 칸과 `래더` 칸이 따로였다 (원본 모바일에는 래더 컬럼이 없다) */}
      <div className="flex w-52 items-center px-2 max-md:w-auto max-md:min-w-0 max-md:flex-1">
        {/* 경기 당시 소속 클랜 (D-131). 무소속·미등록이면 fallback 마크가 그려진다 (D-146).
            크기는 `xxs`(1rem) 에서 `xs`(1.5rem) 로 올렸다 — 정확히 1.5배다.
            사용자가 원본과 대조해 "마크가 너무 작다, 1.5배로" 라고 지정했다 (2026-08-28). */}
        <ClanMark
          clan={stat.match_time_clan}
          alt={stat.match_time_clan?.name ?? ''}
          size="xs"
          className="mr-1 shrink-0"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center">
            <div className="min-w-0 truncate">
              <PlayerLink leagueSlug={leagueSlug} playerId={stat.player_id}>
                {/* 무기는 옆 컬럼에 그대로 적히므로 이름 옆 `[S]` 는 붙이지 않는다 (원본에 없다) */}
                <span className={stat.dropout ? 'line-through' : ''}>{stat.name}</span>
              </PlayerLink>
            </div>
            {/* MVP 는 **닉네임 오른쪽 빨간 원 안의 별**이다 (원본 모바일 관측).
                예전에는 금색 별 하나였다. 색만으로는 뜻이 전달되지 않으므로
                `title`·`aria-label` 로 MVP 임을 남긴다.
                `[미확인]` — 원본 원의 정확한 빨강 값은 실측하지 못했다. `lose` 토큰을 쓴다 */}
            {mvpBadgeVisible(stat.player_id, stat.mvp, mvpPlayerId) ? (
              <span
                className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-lose text-[9px] leading-none text-white"
                title="MVP"
                aria-label="MVP"
              >
                <span aria-hidden="true">★</span>
              </span>
            ) : null}
          </div>
          {/* 그 시점 래더 점수. 색 등급은 랭킹·프로필과 같은 `ratingClass` 를 쓴다 —
              원본 관측값(1,696 초록 / 1,806·1,853 파랑 / 2,252 주황 / 3,367 빨강)이
              그 구간과 정확히 일치한다. 새 구간을 만들지 않는다 */}
          <div className="text-xs">
            {rating.kind === 'placement' ? (
              <span className="text-meta">배치고사</span>
            ) : rating.kind === 'rating' ? (
              <span className={ratingClass(rating.value)}>{formatCount(rating.value)}점</span>
            ) : (
              <span className="text-unknown">{UNKNOWN}</span>
            )}
          </div>
        </div>
      </div>

      <div className="w-28 text-center max-md:w-20">
        {kda.kind === 'unknown' ? (
          /* 3rd.supply 라인업으로 명단만 복원한 참가자다 — K/D/A 를 **모른다** (D-148).
             0 으로 채우면 "0킬을 했다"는 거짓 정보가 된다 */
          <span className="text-unknown" title="넥슨이 이 참가자의 K/D/A를 주지 않았습니다">
            {UNKNOWN}
          </span>
        ) : (
          <>
            <div>
              {kda.kill ?? '-'} / <span className="text-lose">{kda.death ?? '-'}</span> /{' '}
              {kda.assist ?? '-'}
            </div>
            {kda.rate === null ? null : (
              <div className={`text-xs ${rateClass(kda.rate)}`}>({formatRate(kda.rate)}%)</div>
            )}
          </>
        )}
      </div>

      <div className="w-20 text-center max-md:w-12">
        {weapon === null ? <span className="text-unknown">{UNKNOWN}</span> : weapon}
      </div>

      {/* 딜량 — 가로 막대 + 숫자. 막대 길이는 **그 경기 최대 딜량 대비**다.
          막대 색은 빨강이다 (원본 관측). 예전에는 남색(`bg-accent`)이었다.
          상대 클랜 소속은 딜량이 결측돼 내려오므로(원본 노출 한계) `알수없음` 이 자주 나온다 */}
      <div className="w-36 px-2 max-md:w-24 max-md:px-1">
        {stat.damage === null ? (
          <div className="text-center text-unknown">{UNKNOWN}</div>
        ) : (
          <div className="flex items-center">
            <div className="mr-2 h-2 min-w-0 flex-grow rounded bg-line max-md:mr-1">
              {bar === null ? null : (
                <div className="h-full rounded bg-lose" style={{ width: `${bar}%` }} />
              )}
            </div>
            <div className="w-12 shrink-0 text-right">{formatCount(stat.damage)}</div>
          </div>
        )}
      </div>

      <div className="mobile-hide w-24 text-center">
        {headshot.kind === 'unknown' ? (
          <span className="text-unknown">{UNKNOWN}</span>
        ) : (
          <>
            <div>{formatCount(headshot.headshot)}</div>
            {/* 비율은 킬 대비다. 킬을 모르거나 0킬이면 만들지 않는다 */}
            {headshot.rate === null ? null : (
              <div className="text-xs text-meta">({formatRate(headshot.rate)}%)</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 펼친 경기 상세.
 *
 * 원본 구조는 **맵·인원·플레이시간 한 줄 + 가운데 정렬된 게임시작 줄 + 팀 블록 2개**가 전부다.
 * 구성 보정·래더 반영 같은 **설명·안내 문구는 여기에 그리지 않는다** — 원본에 없다.
 * 예전에 남겨 두었던 상수(`ladderNotice` · `COMPOSITION_NOTICE`)도 지웠다
 * (2026-08-28 사용자 지시). 규칙 설명은 화면이 아니라 `docs/` 가 한다.
 * `확인 N` 배지도 원본에 없어 지웠다 (2026-08-28) — 확인 수준은 접힌 카드의
 * `래더 미반영` 배지와 그 툴팁으로 이미 알린다.
 */
function MatchDetailPanel({
  match,
  detail,
  leagueSlug,
}: {
  match: MatchListItem
  detail?: MatchDetail
  /** 참가자 표의 닉네임을 **어느 리그의** 기록실로 보낼지 (경로에 리그 slug 가 들어간다) */
  leagueSlug: string
}) {
  /* 딜량 막대의 기준은 **경기 전체**의 최대 딜량이다. 팀별로 따로 잡으면
     같은 딜량이 팀에 따라 다른 길이로 보인다 */
  const matchMaxDamage = detail ? maxDamage([...detail.red_stats, ...detail.blue_stats]) : null

  /* 응답은 팀을 `league_clan` / `opponent`(보는 쪽 기준)로 주고 참가자는 진영으로 준다.
     둘을 이어야 팀 헤더에 클랜명을 적을 수 있다 (`teamIsViewerClan` 주석 참조) */
  const redIsViewer = detail ? teamIsViewerClan(detail.red_stats, match.win) : null
  const redSnapshot = redIsViewer === null ? null : redIsViewer ? match.league_clan : match.opponent
  const blueSnapshot = redIsViewer === null ? null : redIsViewer ? match.opponent : match.league_clan

  /* 이 기록실의 주인이 누구인지는 **응답이 이미 알려 준다** — 개인 기록실에서만
     `player_stat` 에 본인 스탯이 담긴다 (계약 주석). 별도 prop 을 받지 않는다.
     클랜 기록실에서는 `null` 이라 아무 행도 강조하지 않는다. */
  const viewerPlayerId = match.player_stat?.player_id ?? null

  return (
    <div className="border-x border-b border-line bg-card px-4 py-3 max-md:px-2">
      {/* 1행 — 맵 · 인원 (왼쪽) / 플레이시간 (오른쪽 끝) */}
      <div className="flex items-center text-sm text-meta">
        <div className="text-base font-semibold text-ink">{match.map.name}</div>
        {/* **양 팀 실제 인원**을 쓴다 (D-152).
            `player_count` 는 **총원**이다. 그걸 양쪽에 그대로 쓰면 정상 5대5 경기가
            `10 vs 10` 으로 보인다 — 운영에서 실제로 그렇게 보였다.
            `player_count / 2` 로 나누지도 않는다. 인원이 어긋난 경기(5대4)를
            반올림해 5대5 인 척하게 되기 때문이다. 라인업 배열의 길이가 사실이다. */}
        <div className="ml-3">{formatTeamCounts(match.red.length, match.blue.length)}</div>
        {/* 플레이시간은 **여기**가 자리다 (원본). 접힌 카드에서 옮겨 왔다.
            모르면 `알수없음` — 넥슨이 주지 않는 값이다 (D-034) */}
        <div className="ml-auto shrink-0 pl-2">
          {match.play_time === null ? (
            <span className="text-unknown">{UNKNOWN}</span>
          ) : (
            formatPlayTime(match.play_time)
          )}
        </div>
      </div>

      {/* 2행 — 가운데 정렬. 문구는 `게임시작 - …` 이다 (원본) */}
      <div className="mt-1 text-center text-sm text-meta">
        게임시작 - {formatMatchStartAt(match.start_at)}
      </div>

      {detail ? (
        <>
          {/* 원본은 레드 팀을 먼저 그린다 */}
          <TeamBlock
            side="red"
            stats={detail.red_stats}
            snapshot={redSnapshot}
            mvpPlayerId={match.mvp_player_id}
            matchMaxDamage={matchMaxDamage}
            leagueSlug={leagueSlug}
            viewerPlayerId={viewerPlayerId}
          />
          <TeamBlock
            side="blue"
            stats={detail.blue_stats}
            snapshot={blueSnapshot}
            mvpPlayerId={match.mvp_player_id}
            matchMaxDamage={matchMaxDamage}
            leagueSlug={leagueSlug}
            viewerPlayerId={viewerPlayerId}
          />
        </>
      ) : (
        <div className="py-4 text-center text-sm text-meta">불러오는 중…</div>
      )}
    </div>
  )
}
