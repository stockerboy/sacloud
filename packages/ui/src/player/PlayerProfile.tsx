'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlayerLeagueEntry } from '@sacloud/contract'
import { isOfficialLeague } from '@sacloud/contract'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
/* 「알」 (`docs/EGG_SYSTEM_SPEC.md`) — 클랜마크는 클랜 알이, 기록은 개인 알이 덮는다 */
import { Egg } from '../egg/Egg'
import { useClanEgg, usePlayerEgg } from '../egg/EggContext'
import { EggVeil } from '../egg/EggVeil'
import { RelativeTime } from '../common/RelativeTime'
import { formatCount, formatRate } from '../common/format'
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
  WinBar,
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
              <Link href={`/clan/${clan.slug}`} className="group flex items-center gap-1.5">
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
    <Link
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
          ) : (
            <div className="mt-1 font-num text-[26px] leading-none tabular-nums text-text-strong">
              {formatCount(entry.rating)}
              <span className="ml-1 text-[12px] text-meta">점</span>
            </div>
          )}
        </div>
      </div>

      {/* 승/패 비율 막대도 N승N패를 그대로 보여 주는 그림이라 알이 덮는다 */}
      {sealed ? null : (
        <div className="mt-4">
          <WinBar win={entry.win} lose={entry.lose} />
        </div>
      )}

      <div className="mt-3.5 grid grid-cols-4 gap-4 max-md:grid-cols-2 max-md:gap-y-3">
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
          /* 무소속리그 — 누적 킬뎃을 내보내지 않는 리그다 (D-107). 빈칸 대신 이유를 적는다 */
          <Stat label="킬뎃" value="집계 안함" muted />
        ) : (
          <Stat label="킬뎃" value="기록 없음" muted />
        )}
      </div>
    </Link>
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

  if (!entries || entries.length === 0) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="참여중인 리그" />
        <div className="mt-4">
          <ProfileEmpty message="참여중인 리그가 없습니다." />
        </div>
      </section>
    )
  }

  const hidden = entries.length - VISIBLE_LEAGUES
  const shown = expanded ? entries : entries.slice(0, VISIBLE_LEAGUES)

  return (
    <section className="mt-[40px]">
      <SectionTitle
        title="참여중인 리그"
        note={`${formatCount(entries.length)}개`}
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
      </div>
      <p className="mt-4 text-[12px] text-faint">
        리그를 누르면 그 리그의 기록실로 갑니다 — 전투력 육각형 · 플레이스타일 · 오늘 기록은
        리그마다 따로 쌓입니다.
      </p>
    </section>
  )
}
