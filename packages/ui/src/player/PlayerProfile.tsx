'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
import { rateClass } from '../common/rate'
import {
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
} from './profileKit'

/**
 * ★리그 성격 라벨·색★ (2026-09-24 사장님 「IPL=일반 · Supply1.0/2.0=경쟁 · 색도 채우고」).
 *   nolink=IPL → 일반(파랑) · supply=PL(=Supply1.0) → 경쟁(호박). 열산(sanply)은 사장님이 안 정해 라벨 없음.
 *   Supply2.0 은 아직 우리 DB 에 없는 신규 리그다 — 만들어지면 여기 한 줄 추가한다.
 */
function leagueKindOf(slug: string): { label: string; color: string } | null {
  if (slug === 'nolink') return { label: '일반', color: '#5c80e0' }
  if (slug === 'supply') return { label: '경쟁', color: '#f59e0b' }
  /* 2026-09-24 사장님 「열산도 일반이라고 달아줘」 */
  if (slug === 'sanply') return { label: '일반', color: '#5c80e0' }
  return null
}

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
  /*
   * ★★얼마나 됐는지 보여 준다★★ (2026-09-21 사장님: 「정보갱신 눌렀을때 좀 걸리면
   *   ★0퍼센트 10퍼센트 이렇게 알려줘★ 갱신중인걸」)
   *
   * ── 왜 필요한가
   *   누르면 ★큐에 담기고 서버가 병영수첩을 읽으러 간다.★ 그 사이 화면은
   *   「갱신중」 석 자뿐이라 ★멈춘 것인지 도는 것인지 알 수 없었다.★
   *
   * ── ★거짓말을 하지 않는다★
   *   진짜 진행률을 알 길이 없다 — 서버가 몇 %까지 했는지 말해 주지 않는다.
   *   그래서 ★시간으로 센다.★ 예약이 1분마다 도니 ★60초를 100%로★ 잡고,
   *   ★95%에서 멈춰 선다★ — 끝나지 않았는데 100%라고 적지 않는다.
   *   실제로 끝나면 화면이 새 이름으로 바뀌면서 이 자리가 사라진다.
   */
  const [pct, setPct] = useState(0)
  useEffect(() => {
    if (state !== 'pending') {
      setPct(0)
      return
    }
    const startedAt = Date.now()
    const id = setInterval(() => {
      const sec = (Date.now() - startedAt) / 1000
      setPct(Math.min(95, Math.round((sec / 60) * 100)))
    }, 500)
    return () => clearInterval(id)
  }, [state])

  return (
    <div className="text-right max-md:text-left">
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={onClick}
        className="h-9 rounded-[2px] border border-line px-4 text-[13px] text-text transition-colors hover:border-accent hover:text-accent focus:outline-none disabled:opacity-50"
      >
        {state === 'pending' ? `갱신중 ${pct}%` : label}
      </button>
      {state === 'pending' ? (
        <>
          {/* 가는 막대 하나 — 글자만으로는 도는지 안 도는지 안 보인다 */}
          <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-line-soft">
            <div
              className="h-full bg-accent transition-[width] duration-500 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-faint">병영수첩에서 읽어 오는 중입니다</div>
        </>
      ) : null}
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

  /*
   * ★★2026-09-21 — 원본(3rd.supply) 개인기록 카드와 같은 꼴로 바꿨다★★
   *   (사장님: 「개인기록 카드 이거랑 ★똑같은 폰트크기 같은 카드 크기★ 로 바꿔 똑같이 바꿔」)
   *
   * ── 원본은 이렇게 생겼다 (사장님이 보내신 화면 실측)
   *   ```
   *   3부리그  ● 공식
   *
   *                          래더  2028점
   *   236전 103승 133패      승률   43.6%
   *   1,405킬 2,219데스      킬뎃   38.8%
   *   ```
   *   ★왼쪽은 원자료 · 오른쪽은 라벨 + 큰 값★ 두 칸이다.
   *   우리 옛 판은 「래더를 오른쪽 위에 크게(26px)」 + 「2×3 격자」 라 ★줄이 따로 놀았다.★
   *
   * ── 글자 크기 (원본 화면에서 재서 맞췄다)
   *   리그 이름 17px/800 · 라벨 13px · 값 19px/800 · 왼쪽 원자료 13px
   *
   * ── 원본에 없지만 우리가 더한 두 줄 (사장님이 따로 시키신 것)
   *   ★무기★ 스나 N판 라플 N판   ★순위★ N명중 N위
   *   원본의 첫 줄 왼쪽이 비어 있듯, 남는 칸은 비워 둔다.
   *
   * ⚠ ★옛 꼴을 지우지 않았다★ (`CLAUDE.md` 1-4) — 아래 `CARD_SHAPE` 를 `'grid'` 로
   *   두면 격자 판이 그대로 돌아온다.
   */
  const kdShown =
    hasKd && !sealed
      ? `${formatCount(entry.kill as number)}킬 ${formatCount(entry.death as number)}데스`
      : null

  return (
    <Link
      prefetch={false}
      /**
       * 기록실 경로에는 **`playerId`** 를 넣는다 (`common/paths.ts`).
       * `league_player_id` 를 넣으면 API 가 404 를 돌려주고 빈 화면이 된다 — 실제 버그였다.
       */
      href={leaguePlayerPath(entry.league.slug, playerId)}
      /* ★절반 크기★ (2026-09-21) — 두 장이 한 줄에 서므로 여백과 글자를 줄인다 */
      className={`${PANEL} relative block overflow-hidden px-3 py-2.5 transition-colors hover:border-accent md:px-4 md:py-3`}
    >
      {/* ★리그 성격 색 띠★ (2026-09-24 사장님 「기본정보 카드 색도 채우고 · IPL=일반 · Supply=경쟁」) — 왼쪽 3px */}
      {leagueKindOf(entry.league.slug) ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: leagueKindOf(entry.league.slug)!.color }}
        />
      ) : null}
      {/* ── 머리 — 리그 이름 + 성격 라벨(일반/경쟁) ───────────────────── */}
      <div className="flex items-center gap-2">
        <span className="truncate text-[14px] font-extrabold tracking-[-.01em] text-text-strong md:text-[15px]">
          {entry.league.name}
        </span>
        {leagueKindOf(entry.league.slug) ? (
          <span
            className="inline-flex select-none items-center rounded-[3px] border px-1.5 py-0.5 text-[10px] font-bold leading-none"
            style={{
              borderColor: `${leagueKindOf(entry.league.slug)!.color}66`,
              color: leagueKindOf(entry.league.slug)!.color,
              background: `${leagueKindOf(entry.league.slug)!.color}1f`,
            }}
          >
            {leagueKindOf(entry.league.slug)!.label}
          </span>
        ) : null}
        {/* 공식 표기는 계약의 표가 정한다 (#17). 옛 값: `entry.league.official` */}
        {isOfficialLeague(entry.league.slug) ? <OfficialTag /> : null}
      </div>

      {/* ── 본문 — 왼쪽 원자료 · 오른쪽 라벨+값 ──────────────────────── */}
      <div className="mt-2.5 flex flex-col gap-1.5">
        <CardLine
          raw={null}
          label="래더"
          value={
            entry.placement ? (
              '기록 없음'
            ) : playerScoreOf(entry) === null ? (
              '측정 중'
            ) : (
              formatPlayerScore(playerScoreOf(entry) as number)
            )
          }
          muted={entry.placement || playerScoreOf(entry) === null}
        />
        <CardLine
          raw={`${formatCount(games)}전 ${formatCount(entry.win)}승 ${formatCount(entry.lose)}패`}
          label="승률"
          value={
            sealed ? (
              <EggVeil state={egg}>{null}</EggVeil>
            ) : rated ? (
              `${formatRate(entry.win_rate)}%`
            ) : (
              '기록 없음'
            )
          }
          muted={!sealed && !rated}
          tone={!sealed && rated ? rateClass(entry.win_rate) : ''}
        />
        <CardLine
          raw={kdShown}
          label="킬뎃"
          value={
            sealed ? (
              <EggVeil state={egg}>{null}</EggVeil>
            ) : hasKd ? (
              `${formatRate(entry.kd_rate as number)}%`
            ) : entry.kill === null ? (
              /*
               * ⚠ ★「집계 안함」 은 거짓말이었다★ (2026-09-20 사장님: 「킬뎃 집계안함은 뭐고」)
               *   ★집계는 한다. 안 보여 줄 뿐이다.★ 사실대로 적는다.
               *   ⚠ 2026-09-21 에 상한을 걷어서 이 자리는 거의 안 나온다 (사장님: 「전부 다 공개해」)
               */
              '비공개'
            ) : (
              '기록 없음'
            )
          }
          muted={!sealed && !hasKd}
          tone={!sealed && hasKd ? rateClass(entry.kd_rate as number) : ''}
        />
        {/*
          ★무기 판수★ (2026-09-21 사장님: 「기본정보에 스나수인지 라플수인지 써주고」).
          ⚠ ★둘 다 0 이면 줄을 안 그린다★ — 「스나 0판 · 라플 0판」 은 기록이 아니라
            ★안 재어졌다는 뜻★ 이다 (D-106).
        */}
        {entry.sniper_games + entry.rifle_games > 0 ? (
          <CardLine
            raw={`스나 ${formatCount(entry.sniper_games)}판 라플 ${formatCount(entry.rifle_games)}판`}
            label="순위"
            value={
              entry.rank !== null && entry.rank_count !== null
                ? `${formatCount(entry.rank)}위`
                : '순위 없음'
            }
            muted={entry.rank === null}
            sub={
              entry.rank !== null && entry.rank_count !== null
                ? `${formatCount(entry.rank_count)}명중`
                : null
            }
          />
        ) : (
          <CardLine
            raw={null}
            label="순위"
            value={
              entry.rank !== null && entry.rank_count !== null
                ? `${formatCount(entry.rank)}위`
                : '순위 없음'
            }
            muted={entry.rank === null}
            sub={
              entry.rank !== null && entry.rank_count !== null
                ? `${formatCount(entry.rank_count)}명중`
                : null
            }
          />
        )}
      </div>
    </Link>
  )
}

/**
 * 카드 한 줄 — ★왼쪽 원자료 · 오른쪽 라벨 + 큰 값★ (원본 3rd.supply 와 같은 꼴).
 *
 * ⚠ ★왼쪽이 비어도 줄은 그린다★ — 원본의 첫 줄(래더)이 그렇다. 오른쪽 값들이
 *   같은 자리에 세로로 줄지어야 읽힌다.
 */
function CardLine({
  raw,
  label,
  value,
  muted = false,
  sub = null,
  tone = '',
}: {
  raw: string | null
  label: string
  value: ReactNode
  muted?: boolean
  sub?: string | null
  /** 승률·킬뎃 등급색 (2026-09-24 사장님 「기본정보 기록카드에 숫자에 색이 안들어갔어」) — 랭킹 표와 같은 rateClass */
  tone?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      {/*
        ⚠ ★폰에서는 원자료를 감춘다★ (2026-09-21 사장님: 「카드 새로 배열한거
          ★모바일에서도 그렇게 보여야한다 깔끔하게★」)

          폰 390px 에서 두 장을 놓으면 카드 하나가 ★164px★ 다.
          「236전 103승 133패」(약 130px) 와 「승률 43.6%」(약 75px) 를 한 줄에 넣으면
          ★205px★ 이라 넘친다 — 글자가 잘리거나 줄이 밀린다.
          ★라벨과 값만 남기면 깔끔하게 두 장이 선다.★ 원자료는 PC 에서 그대로 나오고,
          폰에서도 ★카드를 누르면★ 기록실에서 다 보인다.
      */}
      <span className="min-w-0 truncate font-num text-[12px] tabular-nums text-meta max-md:hidden">
        {raw ?? ' '}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        {sub ? <span className="font-num text-[11px] tabular-nums text-faint">{sub}</span> : null}
        <span className="text-[12px] text-meta">{label}</span>
        <span
          className={`font-num text-[16px] font-extrabold leading-none tabular-nums ${
            muted ? 'text-faint' : tone !== '' ? tone : 'text-text-strong'
          }`}
        >
          {value}
        </span>
      </span>
    </div>
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
        /* ★한 줄에 두 장★ (2026-09-21) — 까닭은 위 목록 쪽 주석에 적었다 */
        <div className="mt-3 grid grid-cols-2 gap-2.5 md:gap-3">
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
{/*
        ★★한 줄에 두 장★★ (2026-09-21 사장님: 「카드 절반크기로 줄이고
          ★한칸에 두장씩★ 놓도록만들어」)

          카드 하나가 화면 폭을 통째로 먹어 ★PC 에서 오른쪽 절반이 비어 있었다.★
        ⚠ ★폰은 한 줄에 한 장★ — 390px 에 두 장을 넣으면 숫자가 붙는다
      */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 md:gap-3">
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
