'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlayerLeagueEntry } from '@sacloud/contract'
import { isLeagueListed, isOfficialLeague } from '@sacloud/contract'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
/* 「알」 (`docs/EGG_SYSTEM_SPEC.md`) — 클랜마크는 클랜 알이, 기록은 개인 알이 덮는다 */
import { Egg } from '../egg/Egg'
import { useClanEgg, usePlayerEgg } from '../egg/EggContext'
import { EggVeil } from '../egg/EggVeil'
import { RelativeTime } from '../common/RelativeTime'
import { formatCount, formatRate } from '../common/format'
import {
  SHOW_SCORE_BONUS,
  formatPlayerScore,
  playerScoreOf,
} from '../common/scoreDisplay'
import { leaguePlayerPath } from '../common/paths'
import type { RefreshState } from '../profile/ProfileHeader'
import {
  IdentityBand,
  MetaDot,
  OfficialTag,
  PANEL,
  ProfileEmpty,
  ProfileSkeleton,
  SectionTitle,
  Stat,
} from './profileKit'

/**
 * 플레이어 프로필 `/player/{playerId}` — `적진` 팔레트.
 *
 * 읽는 순서를 위에서 아래로 하나로 만들었다.
 *
 * ```
 * 1) 누구인가        신원 띠 — 마크 · 닉네임 · 소속 · 최근갱신 · 정보갱신
 * 2) 어디서 뛰는가    참여중인 리그 — 리그마다 래더 하나를 크게, 나머지는 눌러서
 * 3) 더 있으면       4번째부터는 접어 둔다 (`덜 중요한 표는 접어라`)
 * ```
 *
 * 이 화면이 가진 데이터는 `playerShow` + `playerLeagues` 뿐이다.
 * 전투력 육각형 · 플레이스타일 · 오늘 기록은 **리그 기록실**(`/league/{slug}/player/{id}`)
 * 응답에만 들어 있다. 여기서 지어내지 않고, 리그 행을 눌러 그리로 보낸다.
 */

/** 접기 전에 펼쳐 두는 리그 수 */
const VISIBLE_LEAGUES = 3

/* ------------------------------------------------------------------ 신원 --- */

export function PlayerIdentity({
  name,
  clan,
  renewedAt,
  refreshState,
  onRefresh,
}: {
  name: string
  /**
   * 소속 클랜. **무소속이면 `null` 을 그대로 넘긴다** — 마크를 통째로 지우지 않는다 (D-146).
   * `is_official_clan` 이 빠지면 `ClanMark` 가 전부 fallback 으로 떨어진다.
   */
  clan: {
    slug: string
    name: string
    mark: ClanMarkSource
    is_official_clan?: boolean | null
  } | null
  renewedAt: string | null
  refreshState: RefreshState
  onRefresh: () => void
}) {
  /* 클랜마크는 **클랜 알**이 덮는다. 깨진 클랜은 마크가 은은하게 계속 빛난다 (사양 3장) */
  const clanEgg = useClanEgg(clan?.slug)

  return (
    <IdentityBand
      mark={
        <Egg state={clanEgg} size="sm" label={clan?.name ?? name}>
          <ClanMark clan={clan} size="max" alt={clan?.name ?? ''} />
        </Egg>
      }
      name={name}
      meta={
        <>
          <span className="flex items-center gap-2">
            <span className="text-faint">소속</span>
            {clan ? (
              /* 색은 안쪽 `<span>` 에 준다 — `a { color: inherit }` 가 레이어 밖이라
                 `<a>` 에 직접 준 색 유틸리티를 눌러 버린다 */
              <Link prefetch={false} href={`/clan/${clan.slug}`} className="group flex items-center gap-1.5">
                <ClanMark clan={clan} size="xs" alt={clan.name} />
                <span className="text-text transition-colors group-hover:text-accent">
                  {clan.name}
                </span>
              </Link>
            ) : (
              <span className="text-faint">없음</span>
            )}
          </span>
          <MetaDot />
          <span className="flex items-center gap-2">
            <span className="text-faint">최근갱신</span>
            {renewedAt ? (
              <span className="text-text">
                <RelativeTime value={renewedAt} />
              </span>
            ) : (
              <span className="text-faint">기록 없음</span>
            )}
          </span>
        </>
      }
      action={
        <RenewControl
          label="정보갱신"
          state={refreshState}
          onClick={onRefresh}
        />
      }
    />
  )
}

/**
 * 갱신 버튼.
 *
 * 하는 일은 그대로다 — 누르면 `playerRenew` / `clanRenew` 를 부른다.
 * 겉만 바꿨다: 파란 채움 버튼 → 진홍 테두리의 각진 고스트 버튼.
 */
export function RenewControl({
  label,
  state,
  onClick,
}: {
  label: string
  state: RefreshState
  onClick: () => void
}) {
  return (
    <div className="text-right max-md:text-left">
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={onClick}
        className="h-9 rounded-[2px] border border-line px-4 text-[13px] text-text transition-colors hover:border-accent hover:text-accent focus:outline-none disabled:opacity-50"
      >
        {state === 'pending' ? '갱신중' : label}
      </button>
      {state === 'failed' ? (
        <div className="mt-1.5 text-[12px] text-accent">갱신에 실패했습니다</div>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- 리그 목록 --- */

/**
 * 리그 한 줄.
 *
 * 왼쪽 위에 리그 이름, 오른쪽에 **래더 하나만** 크게 둔다.
 * 나머지(전적 · 승률 · 킬뎃 · 순위)는 아래 줄에 같은 크기로 눕힌다 — 값끼리 싸우지 않게.
 */
function PlayerLeagueRow({
  entry,
  playerId,
}: {
  entry: PlayerLeagueEntry
  playerId: string
}) {
  const games = entry.win + entry.lose
  /* 무소속리그는 누적 킬·데스·킬뎃이 아예 없다 (D-107). 0 으로 채우지 않는다 */
  const hasKd =
    entry.kill !== null &&
    entry.death !== null &&
    entry.kd_rate !== null &&
    entry.kill + entry.death > 0
  /*
   * 한 판도 안 뛴 참가자에게 `승률 0%` 를 적지 않는다.
   * 계약상 값은 0 으로 오지만 그건 "0% 로 졌다" 가 아니라 **표본이 없다** 는 뜻이다.
   * 0 으로 그리지 않는다는 규칙이 여기에도 그대로 걸린다.
   */
  const rated = games > 0
  /* 개인 알 — 승률 · 승패 · 킬뎃을 가린다. **전적(판수)과 래더는 가리지 않는다** (사양 2장) */
  const egg = usePlayerEgg(playerId)
  const sealed = egg === 'sealed'

  return (
    <Link prefetch={false}
      /**
       * 기록실 경로에는 **`playerId`** 를 넣는다 (`common/paths.ts`).
       * `league_player_id` 를 넣으면 API 가 404 를 돌려주고 빈 화면이 된다 — 실제 버그였다.
       */
      href={leaguePlayerPath(entry.league.slug, playerId)}
      className={`${PANEL} block px-5 py-4 transition-colors hover:border-accent`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] text-text-strong">{entry.league.name}</span>
            {/* 공식 표기는 계약의 표가 정한다 (#17). 옛 값: `entry.league.official` */}
            {isOfficialLeague(entry.league.slug) ? <OfficialTag /> : null}
          </div>
          <div className="mt-1.5 text-[12px] text-meta">
            {entry.rank !== null && entry.rank_count !== null ? (
              <span className="font-num tabular-nums">
                {formatCount(entry.rank_count)}명중 {formatCount(entry.rank)}위
              </span>
            ) : (
              <span className="text-faint">순위 없음</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] leading-none text-meta">래더</div>
          {/* 이 시즌 창에 0판이면 래더 자리에 `기록 없음`. 점수를 지어내지 않는다.
              배치고사는 폐지됐다 (2026-09-01) — `placement` 플래그의 뜻만 바뀌었다 */}
          {entry.placement ? (
            <div className="mt-1.5 text-[15px] leading-none text-meta">기록 없음</div>
          ) : playerScoreOf(entry) === null ? (
            /*
             * ★아직 안 잰 사람은 「측정 중」★ — 점수를 지어내지 않는다 (D-106).
             *   문턱(20경기)을 못 넘겼거나 재계산이 아직 안 닿은 사람이다.
             * ⚠ ★옛 Elo 를 대신 적지 않는다★ — 그 값은 33,567명 중 29,533명이
             *   ★아무도 안 건드린 3000★ 이라, 적으면 「다들 3,000점」 이 된다.
             */
            <div className="mt-1.5 text-[15px] leading-none text-meta">측정 중</div>
          ) : (
            /*
             * ⚠ ★2026-09-21 — 랭킹과 같은 값을 적는다★ (사장님: 「랭킹에 있는 점수로」).
             *   옛 판은 `formatScoreLadder(entry.score_rating)` 라 ★13.4점★ 이 나왔다.
             *   잣대는 `scoreDisplay.ts` 한 곳이 정한다 — 화면마다 고르지 않는다.
             */
            <div className="mt-1 font-num text-[26px] leading-none tabular-nums text-text-strong">
              {formatPlayerScore(playerScoreOf(entry) as number)}
            </div>
          )}
          {/*
            ★★보정 받은 사람은 그렇다고 적는다★★ (2026-09-20 사장님:
              「★보정대상은 보정후의 점수로 써줘★」)

              위 숫자에 ★보정이 이미 들어 있다.★ 그런데 아무 말도 없으면
              ★보정을 받았는지 알 수 없고★, 사장님이 「보정 후 점수로 쓰라」 고
              하신 뜻이 화면에 안 드러난다. ★얼마를 받았는지 한 줄로 적는다.★
          */}
          {SHOW_SCORE_BONUS && !entry.placement && entry.score_rating !== null && entry.score_bonus > 0 ? (
            <div className="mt-1 text-[10.5px] leading-none text-accent">
              상위권 보정 +{entry.score_bonus}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        ⚠ ★막대(WinBar)는 뺐다★ (2026-09-20 사장님: 「이상한 바 같은거 집어치우고」).
          승률은 바로 아래 숫자로 적혀 있다 — 같은 값을 두 번 그릴 이유가 없었고,
          카드 높이만 먹었다.
          ★부품은 안 지웠다★ (`WinBar` · CLAUDE.md 1-4) — 이 블록을 되살리면 돌아온다:

            {sealed ? null : (<div className="mt-4"><WinBar win={entry.win} lose={entry.lose} /></div>)}
      */}

      {/*
        * ★값을 왼쪽에 모은다★ (2026-09-20 사장님: 「가독성도 떨어지고」)
        *
        * 옛 판은 `grid-cols-4` 라 넓은 화면에서 네 값이 ★화면 끝까지 벌어졌다.★
        * 「전적」 과 「킬뎃」 사이가 한 뼘이라 ★한눈에 안 읽혔다.★
        * 흐르는 배치로 바꿔 ★값끼리 붙여 놓는다.★ 폰에서는 두 줄로 접힌다.
        */}
      {/*
        ★★칸으로 나눈다★★ (2026-09-20 사장님 — 선수 기록실 머리카드와 같은 모양으로)
        > 「기본정보에 있는 리그별 카드 오른쪽 사진처럼 만들어 이상한 바 같은거 집어치우고」

        ── 왜 칸인가
          흐르는 배치는 값이 ★몇 개인지에 따라 자리가 달라진다.★ 카드가 여럿 쌓이면
          같은 「승률」 이 카드마다 다른 자리에 서서 ★위아래로 눈이 흔들린다.★
          칸을 고정하면 여러 카드를 훑을 때 ★같은 값이 같은 자리★ 에 온다.
        ⚠ 폰에서는 두 줄로 접힌다 — 네 칸을 390px 에 넣으면 숫자가 붙는다.
      */}
      {/*
        ★★무기 칸을 하나 더 둔다★★ (2026-09-21 사장님: 「★스나수인지 라플수인지★ 써주고」)

          선수 머리 카드가 「스나 킬뎃 ★11판★」 으로 적는 것과 ★같은 값★ 이다.
        ⚠ ★둘 다 0 이면 칸을 안 그린다★ — 「스나 0판 · 라플 0판」 은 기록이 아니라
          ★안 재어졌다는 뜻★ 이라 0 으로 적지 않는다 (D-106).
      */}
      <div className="mt-3.5 grid grid-cols-4 gap-x-3 gap-y-3 border-t border-line-soft pt-3.5 max-md:grid-cols-2">
        {/* 판수는 **가리지 않는다** — 있다는 것은 보여 주고 얼마나 잘하는지를 가린다 (사양 2장) */}
        <Stat label="전적" value={`${formatCount(games)}전`} />
        {sealed ? (
          <Stat label="승 · 패" value={<EggVeil state={egg}>{null}</EggVeil>} />
        ) : (
          <Stat
            label="승 · 패"
            value={`${formatCount(entry.win)} · ${formatCount(entry.lose)}`}
          />
        )}
        {sealed ? (
          <Stat label="승률" value={<EggVeil state={egg}>{null}</EggVeil>} />
        ) : rated ? (
          <Stat label="승률" value={`${formatRate(entry.win_rate)}%`} strong />
        ) : (
          <Stat label="승률" value="기록 없음" muted />
        )}
        {sealed ? (
          <Stat label="킬뎃" value={<EggVeil state={egg}>{null}</EggVeil>} />
        ) : hasKd ? (
          <Stat
            label="킬뎃"
            value={
              <>
                {formatRate(entry.kd_rate as number)}%
                <span className="ml-2 text-[12px] text-meta">
                  {formatCount(entry.kill as number)} / {formatCount(entry.death as number)}
                </span>
              </>
            }
          />
        ) : entry.kill === null ? (
          /*
           * ⚠ ★「집계 안함」 은 거짓말이었다★ (2026-09-20 사장님: 「킬뎃 집계안함은 뭐고」)
           *
           *   IPL 은 ★개인랭킹 100위까지만★ 누적 킬뎃을 보여 준다
           *   (2026-09-02 사장님: 「IPL은 top100만 킬뎃이 보인다고」).
           *   ★집계는 한다. 안 보여 줄 뿐이다.★ 그런데 화면이 「집계 안함」 이라고 적어
           *   ★기록이 없는 것처럼★ 읽혔다.
           *
           *   ★사실대로 적는다.★ 왜 안 보이는지 알면 사람이 납득한다.
           * ⚠ 옛 문구는 「집계 안함」 이었다 — 되돌리려면 이 줄만 바꾼다 (CLAUDE.md 1-4).
           */
          <Stat label="킬뎃" value="100위까지만 공개" muted />
        ) : (
          <Stat label="킬뎃" value="기록 없음" muted />
        )}
        {entry.sniper_games + entry.rifle_games > 0 ? (
          <Stat
            label="무기"
            value={
              <>
                <span className="text-[15px]">스나 {formatCount(entry.sniper_games)}판</span>
                <span className="ml-2 text-[15px] text-meta">
                  라플 {formatCount(entry.rifle_games)}판
                </span>
              </>
            }
          />
        ) : null}
      </div>
    </Link>
  )
}

/**
 * ★아직 안 뛴 리그 — 한 줄로 접는다★ (2026-09-20 사장님)
 *
 * 큰 카드에 「기록 없음」 을 네 번 적는 대신 ★이름만 한 줄★ 로 적는다.
 * ⚠ ★감추는 것이 아니다★ — 눌러서 펼치면 지금까지와 똑같은 카드가 나온다.
 *   그 리그에 참가해 있다는 사실 자체는 ★언제나 보인다.★
 */
function IdleLeagues({
  entries,
  playerId,
}: {
  entries: readonly PlayerLeagueEntry[]
  playerId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-[2px] border border-line-soft px-5 py-3 text-left transition-colors hover:border-accent"
      >
        <span className="min-w-0 truncate text-[13px] text-meta">
          아직 기록이 없는 리그
          <span className="ml-2 text-text-strong">
            {entries.map((e) => e.league.name).join(' · ')}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[11px] text-faint">
          {open ? '접기' : '펼치기'}
        </span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          {entries.map((entry) => (
            <PlayerLeagueRow key={entry.league.id} entry={entry} playerId={playerId} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PlayerLeagueList({
  playerId,
  entries,
  loading,
}: {
  /** 기록실 경로에 쓰인다. 리그 참가 ID 가 아니라 **플레이어 ID** 다 */
  playerId: string
  entries?: readonly PlayerLeagueEntry[]
  loading?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="참여중인 리그" />
        <div className="mt-4">
          <ProfileSkeleton rows={2} height={148} />
        </div>
      </section>
    )
  }

  /* 닫힌 리그(대룰리그 · 지시 #22)는 목록에서 뺀다. 데이터는 그대로다 — 화면에서만 거른다 */
  const listed = entries?.filter((entry) => isLeagueListed(entry.league.slug))
  if (!listed || listed.length === 0) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="참여중인 리그" />
        <div className="mt-4">
          <ProfileEmpty message="참여중인 리그가 없습니다." />
        </div>
      </section>
    )
  }

  /*
   * ★★뛴 리그를 먼저 보여 준다★★ (2026-09-20 사장님: 「이 카드들 너무 별로야 가독성도 떨어지고」)
   *
   * ── 무엇이 문제였나
   *   한 판도 안 뛴 리그가 ★큰 카드를 그대로 차지★ 했다. 실제 화면에서 —
   *   ```
   *     PL      0전 · 기록없음 · 기록없음 · 기록없음   ← 큰 카드
   *     열산    0전 · 기록없음 · 기록없음 · 기록없음   ← 큰 카드
   *     IPL     34전 · 25승9패 · 73.5% · 3,058점      ← ★볼 것이 맨 아래★
   *   ```
   *   「기록 없음」 이 ★여섯 번★ 나오고, 정작 볼 기록은 두 화면 밑에 있었다.
   *
   * ── 어떻게 고쳤나
   *   ★뛴 리그만 카드로 그린다★ (판수 많은 순). 안 뛴 리그는 ★맨 아래 한 줄★ 로 접는다.
   *   ⚠ ★지우는 것이 아니다★ — 한 줄에 이름을 다 적고, 눌러서 펼치면 카드가 나온다.
   *     «참여중인 리그 3개» 라는 셈도 그대로다 (CLAUDE.md 1-4).
   */
  const played = listed.filter((e) => e.win + e.lose > 0)
  const idle = listed.filter((e) => e.win + e.lose === 0)
  /* 판수 많은 리그가 위로 — 그 사람의 «주 무대» 가 먼저 온다 */
  const sorted = [...played].sort((a, b) => b.win + b.lose - (a.win + a.lose))

  const hidden = sorted.length - VISIBLE_LEAGUES
  const shown = expanded ? sorted : sorted.slice(0, VISIBLE_LEAGUES)

  return (
    <section className="mt-[40px]">
      <SectionTitle
        title="참여중인 리그"
        note={`${formatCount(listed.length)}개`}
        action={
          hidden > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-[12px] text-meta transition-colors hover:text-accent"
            >
              {expanded ? '접기' : `${formatCount(hidden)}개 더 보기`}
            </button>
          ) : null
        }
      />
      <div className="mt-4 flex flex-col gap-3">
        {shown.map((entry) => (
          <PlayerLeagueRow key={entry.league.id} entry={entry} playerId={playerId} />
        ))}
        {sorted.length === 0 ? (
          <ProfileEmpty message="아직 기록이 쌓인 리그가 없습니다." />
        ) : null}
      </div>

      {/* ★안 뛴 리그는 한 줄★ — 이름은 다 적는다. 누르면 카드가 펼쳐진다 */}
      {idle.length > 0 ? <IdleLeagues entries={idle} playerId={playerId} /> : null}
      <p className="mt-4 text-[12px] text-faint">
        리그를 누르면 그 리그의 기록실로 갑니다 — 전투력 육각형 · 플레이스타일 · 오늘 기록은
        리그마다 따로 쌓입니다.
      </p>
    </section>
  )
}
