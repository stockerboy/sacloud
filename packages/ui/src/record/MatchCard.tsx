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
import { leagueClanPath } from '../common/paths'
import {
  NOT_RATED_BADGE,
  NOT_RATED_BADGE_TITLE,
  NOT_RATED_INLINE_TITLE,
  isRated,
} from './officialCopy'
import { SNIPER_MARK, SNIPER_MARK_TITLE, lineupPlayerHref, usedSniper } from './lineupCopy'
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
 * 원본 실측 구조 — 접힌 상태 (2026-08-20)
 * ```
 * <div class="flex items-stretch min-h-28 mt-2 border-t border-r border-b
 *             bg-sky-100 border-sky-200">              승리 (패배는 red 계열)
 *   <div class="w-2 bg-sky-500"></div>                 왼쪽 색 막대
 *   <div class="w-24 text-center text-gray-700">       맵 / 플레이시간 / 승패 / 상대시간
 *   <div class="w-20">래더 <span class="text-sky-500">+9점</span>
 *   <div class="w-32">7 / <span class="text-red-500">5</span> / 4  (58.3%)
 *   <div class="w-88">                                 양팀 클랜 (마크·이름·부리그·래더)
 *   <div class="w-40"> × 2                             양팀 라인업 (스나이퍼는 [S])
 *   <div class="flex flex-row-reverse flex-grow">상세보기</div>
 * ```
 * 실측 색 — 승: 배경 #E0F2FE · 테두리 #BAE6FD · 막대 #0EA5E9 · 글자 #0284C7 · 래더 #0EA5E9
 *          패: 배경 #FEE2E2 · 테두리 #FECACA · 막대 #F87171 · 글자/래더 #EF4444
 * 카드 최소 높이 7rem(98px), 실측 렌더 높이 105px.
 *
 * 원본 관측 구조 — 펼친 상태
 * ```
 * 제3보급창고  5 vs 5                     게임시작시간: 2026년 7월 28일 오전 3시 40분
 * ── 패배 블록 (옅은 red 배경) ────────────────────────────────────────────────
 * 패배 (마크)e2stro-  (선레드)  -  2부리그 1,149점
 * 플레이어        래더      kda        무기      딜량            헤드샷
 * (마크)sexgod    1,540점   9 / 9 / 4  라플      ▬▬ 1,438        1
 *                           (50%)                                (11.1%)
 * ── 승리 블록 (옅은 blue 배경) ───────────────────────────────────────────────
 * ```
 * 팀 블록은 **레드 먼저, 블루 나중**이고 컬럼 헤더는 블록마다 반복된다.
 *
 * 픽셀 단위 간격·폰트 크기는 원본과 동일함이 검증되지 않았다 `[미확인]`.
 * 자동화로 아코디언을 열 수 없어(클릭이 전달되지 않음) 화면 캡처가 아닌 관측 기록을 기준으로 했다.
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
 * 스나이퍼 표기 `[S]`.
 *
 * **그 경기의 무기**로만 정한다 — 선수의 포지션(스나이퍼/라이플/멀티)과는 무관하다.
 * 빨간색으로 두는 이유는 라인업이 5명씩 두 덩어리라 검은 글자에 섞인 `[S]` 가
 * 실제로 안 읽혔기 때문이다. 색은 이 화면이 이미 쓰는 빨강(`text-lose`)을 그대로 쓴다 —
 * 패배를 뜻하는 게 아니라 토큰을 새로 만들지 않으려는 것이다.
 */
function SniperMark({ weapon }: { weapon: number | null }) {
  if (!usedSniper(weapon)) return null
  return (
    <span className="font-bold text-lose" title={SNIPER_MARK_TITLE}>
      {SNIPER_MARK}
    </span>
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

function Lineup({
  entries,
  leagueSlug,
}: {
  entries: readonly {
    player_id: string
    name: string
    /** 수집원이 무기를 주지 않으면 null — `[S]`를 붙일 근거가 없다 (D-034) */
    weapon: number | null
    dropout: boolean | null
    /** **그 경기 당시** 소속 클랜. 현재 소속이 아니다 (D-131) */
    match_time_clan: MatchTimeClan | null
  }[]
  leagueSlug: string
}) {
  return (
    <div className="flex w-48 items-center py-1 text-sm text-meta">
      <div>
        {entries.map((entry) => (
          <div key={entry.player_id} className="flex items-center">
            {/* 경기 당시 소속 클랜마크 (D-131). 현재 소속으로 채우지 않는다.
                **무소속·미등록이어도 자리를 비우지 않는다** — 클랜 객체를 그대로 넘기면
                `ClanMark` 가 fallback 마크를 그린다 (D-146). 예전에는 여기서 통째로
                걸러 버려 미등록 선수 옆에만 마크가 없었다 */}
            <ClanMark
              clan={entry.match_time_clan}
              alt={entry.match_time_clan?.name ?? ''}
              size="xxs"
              className="mr-1"
            />
            <PlayerLink leagueSlug={leagueSlug} playerId={entry.player_id}>
              <span className={entry.dropout ? 'line-through' : ''}>{entry.name}</span>
              <SniperMark weapon={entry.weapon} />
            </PlayerLink>
          </div>
        ))}
      </div>
    </div>
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
    <div className={`w-42 ${align === 'right' ? 'flex flex-row-reverse' : ''}`}>
      <div className={`text-base ${align === 'right' ? 'text-right' : ''}`}>
        <Link className="inline-block" href={leagueClanPath(leagueSlug, snapshot.clan.slug)}>
          {/* 등록 클랜 판정은 마크 URL 이 아니라 클랜 객체가 한다 (D-146) */}
          <ClanMark
            clan={snapshot.clan}
            size="xs"
            className="mr-1 inline-block align-middle"
            alt={snapshot.clan.name}
          />
          <span className="inline-block max-w-[100px] truncate align-middle">
            {snapshot.clan.name}
          </span>
        </Link>
        <div className="text-sm text-meta">
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
      {/* 접힌 카드는 고정폭 칸의 합이 1,100px 을 넘어 모바일에서 화면 밖으로 나간다.
          **칸을 감추지 않는다** — 원본 모바일이 무엇을 감추는지 확인되지 않았다 `[미확인]`.
          대신 카드 안에서만 가로로 스크롤한다 (`.mobile-scroll-x` 는 767px 이하에만 정의돼 있고,
          `max-md:` 규칙도 md 이상에는 아예 생성되지 않으므로 PC 는 그대로다).
          자식에 `shrink-0` 을 주지 않으면 칸이 눌려 찌그러진다 — 스크롤이 아니라 압축이 된다. */}
      <div
        className={`mobile-scroll-x mt-2 flex min-h-28 items-stretch border-b border-r border-t max-md:[&>*]:shrink-0 ${
          win ? 'border-win-line bg-win-bg' : 'border-lose-line bg-lose-bg'
        }`}
      >
        <div className={`w-2 ${win ? 'bg-win-bar' : 'bg-lose-bar'}`} />

        {/* 사용자에게 필요한 상태는 **래더에 반영됐는가** 하나다 (D-149).
            `공식/비공식` 배지는 없앴다 — D-145 에서 `official` 은 래더 자격도
            가중치도 아니게 됐는데, 배지로 남겨 두면 "비공식이라 점수를 덜 준다"는
            폐기된 규칙을 화면이 계속 말하게 된다.
            `official` 값 자체는 출처·관리자용으로 DB 에 그대로 남는다. */}
        {isRated(match.participant_completeness) ? null : (
          <div className="flex w-16 flex-col items-center justify-center">
            <div
              className="rounded border border-lose-line px-1 py-0.5 text-center text-[10px] leading-tight text-lose"
              title={NOT_RATED_BADGE_TITLE}
            >
              {NOT_RATED_BADGE}
            </div>
          </div>
        )}

        <div className="flex items-center">
          <div className="w-24 text-center text-meta">
            <div className="text-sm font-semibold">{match.map.name}</div>
            <div className="mb-1 text-sm">
              {match.play_time === null ? (
                <span className="text-unknown">알수없음</span>
              ) : (
                formatPlayTime(match.play_time)
              )}
            </div>
            <div className={`font-bold ${win ? 'text-win' : 'text-lose'}`}>
              {win ? '승리' : '패배'}
            </div>
            <div className="text-sm">
              <RelativeTime value={match.start_at} />
            </div>
          </div>
        </div>

        <div className="flex w-20 items-center justify-center">
          <div className="text-center text-sm">
            <div className="mb-1">래더</div>
            {/* 배치고사 중이면 래더 증감 대신 `배치고사` (원본 규칙) */}
            {match.placement ? (
              <div className="font-semibold">배치고사</div>
            ) : match.rating_update !== null ? (
              <div className={`font-semibold ${win ? 'text-win-bar' : 'text-lose'}`}>
                {formatRatingUpdate(match.rating_update)}
              </div>
            ) : (
              /* 5v5 가 아니라 래더에 반영되지 않은 경기다.
                 표기는 `알수없음` 하나로 통일한다 (2026-08-28 사용자 지시 — 예전 `미반영`) */
              <div className="font-semibold text-unknown" title={NOT_RATED_INLINE_TITLE}>
                {UNKNOWN}
              </div>
            )}
          </div>
        </div>

        {/* 개인 기록실에서만 본인 K/D/A가 표시된다 (클랜 기록실에서는 null) */}
        {stat ? (
          <div className="flex w-32 items-center justify-center text-meta">
            <div className="text-center">
              <div className="h-5">{stat.mvp ? <span className="text-mvp">MVP</span> : null}</div>
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
                  <div className="text-xl font-semibold">
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
              <div className="h-5">
                {stat.dropout ? <span className="text-sm text-lose">탈주</span> : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex w-88 items-center">
          <ClanSide snapshot={match.league_clan} leagueSlug={leagueSlug} align="right" />
          <div className="px-2 text-sm text-meta">vs</div>
          <ClanSide snapshot={match.opponent} leagueSlug={leagueSlug} align="left" />
        </div>

        {/* 클랜 기록실 카드에만 있는 칸 — 선공 진영 + 양 팀 인원 (UI_PARITY_AUDIT 5-8 · 5-9).
            선공 진영은 넥슨이 주지 않아 실제로는 대부분 `알수없음` 이다 (D-034).
            플레이시간과 같은 규칙으로 **자리는 남기고** 모른다고 적는다 —
            예전에는 항목을 통째로 지워서, 같은 성격의 결측을 서로 다르게 다루고 있었다. */}
        {variant === 'clan' ? (
          <div className="flex w-24 items-center justify-center text-center text-sm text-meta">
            <div>
              <div>
                {firstSide === null ? <span className="text-unknown">{UNKNOWN}</span> : firstSide}
              </div>
              <div className="mt-1">{formatTeamCounts(match.red.length, match.blue.length)}</div>
            </div>
          </div>
        ) : null}

        <Lineup entries={match.red} leagueSlug={leagueSlug} />
        <Lineup entries={match.blue} leagueSlug={leagueSlug} />

        <div className="flex flex-grow flex-row-reverse">
          <button
            type="button"
            onClick={toggle}
            className="mb-2 cursor-pointer self-end whitespace-nowrap px-2 text-sm"
          >
            {open ? '접기' : '상세보기'}
          </button>
        </div>
      </div>

      {open ? <MatchDetailPanel match={match} detail={detail} leagueSlug={leagueSlug} /> : null}
    </div>
  )
}

/* --------------------------------------------------------------- 펼친 상세 --- */

/**
 * 팀 블록 하나 (원본 구조).
 *
 * ```
 * 패배  (마크)e2stro-   (선레드)  -  2부리그 1,149점
 * 플레이어      래더     kda        무기     딜량        헤드샷
 * ```
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
}: {
  side: 'red' | 'blue'
  stats: readonly MatchPlayerStat[]
  /** 이 진영의 클랜. 어느 클랜인지 잇지 못했으면 `null` — 지어내지 않는다 */
  snapshot: MatchClanSnapshot | null
  mvpPlayerId: string | null
  /** 딜량 막대의 기준값 (경기 전체 최대). 아무도 모르면 `null` */
  matchMaxDamage: number | null
  leagueSlug: string
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

  /* 6컬럼 합이 46rem 이라 모바일에서 넘친다. 컬럼을 감추지 않고(원본이 무엇을 감추는지 `[미확인]`)
     팀 블록 안에서만 가로 스크롤한다. 자식 행에 `w-max`(= max-content)를 줘야
     칸이 눌리지 않고 제 폭으로 이어진다. 둘 다 767px 이하 전용이라 PC 는 그대로다. */
  return (
    <div className={`mobile-scroll-x mt-2 border max-md:[&>div]:w-max ${tone}`}>
      <div className="flex items-center px-2 py-1.5 text-sm">
        {won === null ? null : (
          <span className={`font-bold ${won ? 'text-win' : 'text-lose'}`}>
            {won ? '승리' : '패배'}
          </span>
        )}
        {snapshot ? (
          <>
            <Link
              className="ml-2 inline-flex items-center"
              href={leagueClanPath(leagueSlug, snapshot.clan.slug)}
            >
              <ClanMark
                clan={snapshot.clan}
                size="xs"
                className="mr-1"
                alt={snapshot.clan.name}
              />
              <span className="max-w-[160px] truncate text-base">{snapshot.clan.name}</span>
            </Link>
            <span className="ml-2 text-meta">({first})</span>
            <span className="mx-2 text-meta">-</span>
            <span className="text-meta">
              {snapshot.division}부리그 <SnapshotRating snapshot={snapshot} />
            </span>
          </>
        ) : (
          <span className="ml-2 text-meta">({first})</span>
        )}
      </div>

      {/* 컬럼 헤더는 팀 블록마다 반복한다 (원본 구조) */}
      <div className="flex items-center border-t border-t-line py-1 text-sm text-meta">
        <div className="w-52 px-2">플레이어</div>
        <div className="w-24 text-center">래더</div>
        <div className="w-28 text-center">kda</div>
        <div className="w-20 text-center">무기</div>
        <div className="w-36 text-center">딜량</div>
        <div className="w-24 text-center">헤드샷</div>
      </div>

      {stats.map((stat) => (
        <StatRow
          key={stat.player_id}
          stat={stat}
          mvpPlayerId={mvpPlayerId}
          matchMaxDamage={matchMaxDamage}
          leagueSlug={leagueSlug}
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
}: {
  stat: MatchPlayerStat
  mvpPlayerId: string | null
  matchMaxDamage: number | null
  leagueSlug: string
}) {
  const kda = kdaView(stat)
  const rating = ratingCellView(stat)
  const weapon = matchWeaponLabel(stat.weapon)
  const bar = damageBarPercent(stat.damage, matchMaxDamage)
  const headshot = headshotView(stat.headshot, stat.kill)

  return (
    <div className="flex items-center border-t border-t-line py-1 text-sm">
      <div className="flex w-52 items-center px-2">
        {/* 경기 당시 소속 클랜 (D-131). 무소속·미등록이면 fallback 마크가 그려진다 (D-146) */}
        <ClanMark
          clan={stat.match_time_clan}
          alt={stat.match_time_clan?.name ?? ''}
          size="xxs"
          className="mr-1"
        />
        <PlayerLink leagueSlug={leagueSlug} playerId={stat.player_id}>
          {/* 무기는 옆 컬럼에 그대로 적히므로 이름 옆 `[S]` 는 붙이지 않는다 (원본에 없다) */}
          <span className={stat.dropout ? 'line-through' : ''}>{stat.name}</span>
        </PlayerLink>
        {/* MVP 는 **별 하나**로 표시한다 (2026-08-28 사용자 지시).
            글자 배지(`MVP`)는 닉네임 칸에서 자리를 크게 먹어 긴 닉네임을 밀어냈다.
            색만으로는 뜻이 전달되지 않으므로 `title`·`aria-label` 로 MVP 임을 남긴다.
            `[미확인]` — 원본의 MVP 표시가 정확히 어떤 모양인지는 관찰하지 못했다
            (`docs/UI_PARITY_AUDIT.md` 7 — 경기 상세 펼침 관찰 실패) */}
        {mvpBadgeVisible(stat.player_id, stat.mvp, mvpPlayerId) ? (
          <span className="ml-1 leading-none text-mvp" title="MVP" aria-label="MVP">
            ★
          </span>
        ) : null}
      </div>

      <div className="w-24 text-center">
        {rating.kind === 'placement' ? (
          '배치고사'
        ) : rating.kind === 'rating' ? (
          `${formatCount(rating.value)}점`
        ) : (
          <span className="text-unknown">{UNKNOWN}</span>
        )}
      </div>

      <div className="w-28 text-center">
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

      <div className="w-20 text-center">
        {weapon === null ? <span className="text-unknown">{UNKNOWN}</span> : weapon}
      </div>

      {/* 딜량 — 가로 막대 + 숫자. 막대 길이는 **그 경기 최대 딜량 대비**다.
          상대 클랜 소속은 딜량이 결측돼 내려오므로(원본 노출 한계) `알수없음` 이 자주 나온다 */}
      <div className="w-36 px-2">
        {stat.damage === null ? (
          <div className="text-center text-unknown">{UNKNOWN}</div>
        ) : (
          <div className="flex items-center">
            <div className="mr-2 h-2 flex-grow rounded bg-line">
              {bar === null ? null : (
                <div className="h-full rounded bg-accent" style={{ width: `${bar}%` }} />
              )}
            </div>
            <div className="w-12 text-right">{formatCount(stat.damage)}</div>
          </div>
        )}
      </div>

      <div className="w-24 text-center">
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
 * 원본 구조는 **맵·인원·게임시작시간 한 줄 + 팀 블록 2개**가 전부다.
 * 구성 보정·래더 반영 같은 **설명·안내 문구는 여기에 그리지 않는다** — 원본에 없다.
 * 예전에 남겨 두었던 상수(`ladderNotice` · `COMPOSITION_NOTICE`)도 지웠다
 * (2026-08-28 사용자 지시). 규칙 설명은 화면이 아니라 `docs/` 가 한다.
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
  const redSnapshot =
    redIsViewer === null ? null : redIsViewer ? match.league_clan : match.opponent
  const blueSnapshot =
    redIsViewer === null ? null : redIsViewer ? match.opponent : match.league_clan

  return (
    <div className="border-x border-b border-line bg-card px-4 py-3 max-md:px-2">
      {/* 맵 · 인원 · 확인 · 게임시작시간 한 줄. 모바일에서는 시작시각(`ml-auto`)까지 한 줄에
          들어가지 않아 넘친다 — 항목을 빼지 않고 줄만 넘긴다 */}
      <div className="flex items-center text-sm text-meta max-md:flex-wrap max-md:gap-y-1">
        <div className="text-base font-semibold text-ink">{match.map.name}</div>
        {/* **양 팀 실제 인원**을 쓴다 (D-152).
            `player_count` 는 **총원**이다. 그걸 양쪽에 그대로 쓰면 정상 5대5 경기가
            `10 vs 10` 으로 보인다 — 운영에서 실제로 그렇게 보였다.
            `player_count / 2` 로 나누지도 않는다. 인원이 어긋난 경기(5대4)를
            반올림해 5대5 인 척하게 되기 때문이다. 라인업 배열의 길이가 사실이다. */}
        <div className="ml-3">{formatTeamCounts(match.red.length, match.blue.length)}</div>
        {/* 재구성 경기는 **우리가 몇 명을 확인했는지**를 숨기지 않는다 (D-068).
            5명 전원을 확인한 경기와 3명만 확인한 경기는 신뢰도가 다르다. */}
        {match.participant_completeness === null ? null : (
          <div
            className="ml-3 rounded border border-line px-1.5 py-0.5 text-xs text-meta"
            title="넥슨이 참가자 전원을 주지 않아, 확인된 인원만 표기한다"
          >
            확인 {match.participant_completeness}
            {match.evidence_confidence === 'low' ? ' · 일부' : null}
          </div>
        )}
        <div className="ml-auto">게임시작시간: {formatMatchStartAt(match.start_at)}</div>
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
          />
          <TeamBlock
            side="blue"
            stats={detail.blue_stats}
            snapshot={blueSnapshot}
            mvpPlayerId={match.mvp_player_id}
            matchMaxDamage={matchMaxDamage}
            leagueSlug={leagueSlug}
          />
        </>
      ) : (
        <div className="py-4 text-center text-sm text-meta">불러오는 중…</div>
      )}
    </div>
  )
}
