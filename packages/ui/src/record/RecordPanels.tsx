import Link from 'next/link'
import type { MatchSummary, TeammateStat } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { ratingClass } from '../common/rating'
import { weaponStatView } from './weaponCopy'

/**
 * 기록실 상단 `최근매치` 요약 + 우측 사이드 패널.
 *
 * 원본 실측 (2026-08-20)
 *
 * 최근매치 — `<div class="px-4 py-2 bg-white shadow">`
 * ```
 * 최근매치
 * [승률 도넛 80%]  20전 16승 4패 (80%)      vs saint   9전 7승 2패 (77.8%) - 킬뎃: 55.2%
 *                  5연승 중                  vs MiraGe. 4전 4승 0패 (100%)  - 킬뎃: 73.7%
 * ```
 * 도넛 칸 `w-32 h-40`, 가운데 칸 `ml-5 h-40`, 상대 클랜 칸은 `border-l-2 border-gray-100`으로 구분한다.
 *
 * 사이드 — `<div class="px-3 py-3 bg-blueGray-800 text-gray-300 shadow">` (배경 #1E293B)
 * ```
 * 상세정보
 * ──────────  ← .divide (border-top #334155, 상하 여백 0.5rem)
 * 래더      3432점      ← .stat = flex justify-between py-2 text-3xl
 * 승률      1,302승 851패 60.5%
 * 킬뎃      17,855킬 17,422데스 50.6%
 * 평균킬    판당 8.3킬
 * MVP       213회
 * 랭킹      5,578명중 1위
 * 소속      des`per@do.
 * ```
 * 그 아래 `최근 같이한 플레이어` 표 (닉네임 / 승 / 패 / 승률).
 */

/** 승률 도넛 — 원본은 원형 게이지. SVG로 같은 크기(w-32 h-40 칸)에 그린다. */
function WinRateDonut({ rate }: { rate: number }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(100, Math.max(0, rate)) / 100) * circumference
  return (
    <div className="relative flex min-h-40 w-32 shrink-0 items-center justify-center">
      <svg viewBox="0 0 112 112" className="h-28 w-28 -rotate-90" aria-hidden>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--color-divider)" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="var(--color-win-bar)"
          strokeWidth="10"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="butt"
        />
      </svg>
      <div className="absolute text-2xl font-semibold">{formatRate(rate)}%</div>
    </div>
  )
}

function streakText(streak: MatchSummary['streak']): string {
  if (streak.type === 'none' || streak.count === 0) return ''
  return `${streak.count}${streak.type === 'win' ? '연승' : '연패'} 중`
}

export function RecentMatchSummary({
  summary,
  leagueSlug,
}: {
  summary: MatchSummary
  leagueSlug: string
}) {
  return (
    <div className="bg-card px-4 py-2 shadow-card">
      <div className="text-lg">최근매치</div>
      <div className="mt-4 flex">
        <WinRateDonut rate={summary.win_rate} />
        <div className="ml-5 flex min-h-40 items-center justify-center">
          <div>
            <div>
              {formatCount(summary.recent_count)}전 {formatCount(summary.win)}승{' '}
              {formatCount(summary.lose)}패 ({formatRate(summary.win_rate)}%)
            </div>
            <div className="mt-2">{streakText(summary.streak)}</div>
          </div>
        </div>
        {/*
          원본은 `h-40` 고정이지만, 최근 20전에서 만난 상대 클랜 수가 많으면 넘쳐서
          아래 매치 카드와 겹친다(실제로 겹치는 것을 확인). 최소 높이로 바꿔 늘어나게 한다.
          원본 표본(20전 / 상대 3클랜)에서는 렌더 결과가 동일하다.
        */}
        <div className="ml-20 flex min-h-40 items-center border-l-2 border-l-divider px-20">
          <div>
            {summary.opponents.length === 0 ? (
              <div className="text-meta">상대 전적이 없습니다.</div>
            ) : (
              summary.opponents.map((entry) => (
                <div key={entry.clan.id} className="flex items-center py-0.5 text-sm">
                  <span className="mr-1 text-meta">vs</span>
                  <Link
                    href={`/league/${leagueSlug}/clan/${entry.clan.slug}`}
                    className="inline-flex items-center"
                  >
                    <ClanMark
                      mark={entry.clan.mark}
                      size="xs"
                      className="mr-1"
                      alt={entry.clan.name}
                    />
                    <span className="max-w-[100px] truncate">{entry.clan.name}</span>
                  </Link>
                  <span className="ml-2">
                    {formatCount(entry.win + entry.lose)}전 {formatCount(entry.win)}승{' '}
                    {formatCount(entry.lose)}패 ({formatRate(entry.win_rate)}%)
                  </span>
                  <span className="ml-2 text-meta">
                    - 킬뎃: <span className={rateClass(entry.kd_rate)}>{formatRate(entry.kd_rate)}%</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- 사이드 패널 --- */

function Divider() {
  return <div className="my-2 border-t border-t-side-line" />
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 text-3xl">
      <div>{label}</div>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

export interface PlayerStatSidebarProps {
  rating: number
  placement: boolean
  win: number
  lose: number
  winRate: number
  /* 무소속리그는 누적 킬·데스·킬뎃을 공개하지 않는다 (D-107).
     `null`이면 상세정보에서 **킬뎃 줄 자체를 뺀다.** 0으로 그리지 않는다. */
  kill: number | null
  death: number | null
  kdRate: number | null
  killPerMatch: number
  mvpCount: number
  rank: number | null
  rankCount: number | null
  /**
   * 무기별 랭킹 (D-146).
   *
   * 넥슨 Open API 는 무기를 주지 않는다 (D-034). 그 무기로 뛴 기록이 없으면 `null` 이고
   * **`집계 없음` 으로 표시한다.** 표본이 없는데 순위를 만들어 내지 않는다.
   */
  sniperRank?: number | null
  sniperRankCount?: number | null
  sniperGames?: number
  sniperKnownGames?: number
  sniperKill?: number
  sniperDeath?: number
  sniperKdRate?: number | null
  rifleRank?: number | null
  rifleRankCount?: number | null
  rifleGames?: number
  rifleKnownGames?: number
  rifleKill?: number
  rifleDeath?: number
  rifleKdRate?: number | null
  /**
   * 소속.
   *
   * `isOfficialClan` 이 false 면 **공식 등록 클랜이 아니다.** 이름은 남기되
   * 공식 소속처럼 강조하지 않고 `미등록` 을 함께 적는다 (D-146).
   */
  clan: { slug: string; name: string; isOfficialClan?: boolean } | null
}

/**
 * 무기별 전적 한 칸 (D-149).
 *
 * 보여 주는 것 — 전(경기 수) · K/D · 순위.
 * K/D 는 통합 킬뎃과 **같은 정의**다(`킬 / (킬 + 데스) × 100`). 정의가 다르면
 * 나란히 놓았을 때 사용자가 비교할 수 없다.
 *
 * 무엇을 보여 줄지는 `weaponStatView` 가 정한다 — 분기는 그쪽에서 테스트로 고정한다.
 */
function WeaponStat({
  label,
  games,
  knownGames,
  kill,
  death,
  kdRate,
  rank,
  rankCount,
}: {
  label: string
  games: number | undefined
  knownGames: number | undefined
  kill: number | undefined
  death: number | undefined
  kdRate: number | null | undefined
  rank: number | null | undefined
  rankCount: number | null | undefined
}) {
  const view = weaponStatView({ games, knownGames, kill, death, kdRate })

  if (view.kind === 'none') {
    return (
      <Stat label={label}>
        <span className="text-unknown">집계 없음</span>
      </Stat>
    )
  }

  return (
    <div className="flex items-start justify-between py-2">
      <div className="text-lg">{label}</div>
      <div className="text-right text-base leading-6">
        <div>
          <span className="mr-2 text-meta">{formatCount(view.games)}전</span>
          {view.kind === 'unknown' ? (
            /* 뛴 건 알지만 K/D 를 모른다. 0%로 채우지 않는다 */
            <span className="text-unknown">K/D -</span>
          ) : (
            <>
              <span className="mr-1 text-meta">
                {formatCount(view.kill)}킬 {formatCount(view.death)}데스
              </span>
              <span className={rateClass(view.kdRate)}>{formatRate(view.kdRate)}%</span>
            </>
          )}
        </div>
        <div className="text-meta">
          {rank === null || rank === undefined ? (
            /* 기록을 아는 경기가 없어 비교할 실적이 없다 */
            <span className="text-unknown">순위 없음</span>
          ) : (
            <>
              {formatCount(rankCount ?? 0)}명중 {formatCount(rank)}위
            </>
          )}
          {view.kind === 'known' && view.partial ? (
            <span className="ml-2 text-unknown" title="넥슨이 K/D를 주지 않은 경기가 있습니다">
              (기록 {formatCount(view.knownGames)}전)
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function PlayerStatSidebar(props: PlayerStatSidebarProps) {
  return (
    <div className="bg-side px-3 py-3 text-line shadow-card">
      <div>상세정보</div>
      <Divider />
      <Stat label="래더">
        <span className={ratingClass(props.rating)}>
          {props.placement ? '배치고사' : `${props.rating}점`}
        </span>
      </Stat>
      <Divider />
      <Stat label="승률">
        <span className="mr-2 text-base">
          {formatCount(props.win)}승 {formatCount(props.lose)}패
        </span>
        <span className={rateClass(props.winRate)}>{formatRate(props.winRate)}%</span>
      </Stat>
      {props.kill === null || props.death === null || props.kdRate === null ? null : (
        <>
          <Divider />
          <Stat label="킬뎃">
            <span className="mr-2 text-base">
              {formatCount(props.kill)}킬 {formatCount(props.death)}데스
            </span>
            <span className={rateClass(props.kdRate)}>{formatRate(props.kdRate)}%</span>
          </Stat>
        </>
      )}
      <Divider />
      <Stat label="평균킬">
        <span className="mr-2 text-base">판당</span>
        {props.killPerMatch.toFixed(1)}킬
      </Stat>
      <Divider />
      <Stat label="MVP">{formatCount(props.mvpCount)}회</Stat>
      <Divider />
      <Stat label="랭킹">
        {props.rank === null ? (
          '배치고사'
        ) : (
          <>
            <span className="mr-2 text-base">{formatCount(props.rankCount ?? 0)}명중</span>
            {formatCount(props.rank)}위
          </>
        )}
      </Stat>
      <Divider />
      {/* 무기별 랭킹은 통합 랭킹과 **별도로** 보여 준다 (D-146).
          무기 분리는 기록만 나누고 통합 래더 값을 바꾸지 않는다 */}
      <WeaponStat
        label="스나이퍼"
        games={props.sniperGames}
        knownGames={props.sniperKnownGames}
        kill={props.sniperKill}
        death={props.sniperDeath}
        kdRate={props.sniperKdRate}
        rank={props.sniperRank}
        rankCount={props.sniperRankCount}
      />
      <Divider />
      <WeaponStat
        label="라이플"
        games={props.rifleGames}
        knownGames={props.rifleKnownGames}
        kill={props.rifleKill}
        death={props.rifleDeath}
        kdRate={props.rifleKdRate}
        rank={props.rifleRank}
        rankCount={props.rifleRankCount}
      />
      <Divider />
      <Stat label="소속">
        <span className="text-base">
          {props.clan === null ? (
            '-'
          ) : props.clan.isOfficialClan === false ? (
            /* 공식 1/2부 등록 클랜이 아니다 (D-146).
               이름은 남기되 링크를 걸지 않고 `미등록` 을 붙인다 —
               외부 클랜이 SACLOUD 공식 소속처럼 보이면 안 된다. */
            <>
              <span className="text-meta">{props.clan.name}</span>
              <span className="ml-1 text-xs text-unknown">미등록</span>
            </>
          ) : (
            <Link href={`/clan/${props.clan.slug}`}>{props.clan.name}</Link>
          )}
        </span>
      </Stat>
    </div>
  )
}

export function TeammateTable({
  title,
  teammates,
}: {
  /** 개인 기록실: `최근 같이한 플레이어` / 클랜 기록실: `최근 클랜전 플레이어` */
  title: string
  teammates: readonly TeammateStat[]
}) {
  return (
    <div className="mt-2 bg-card shadow-card">
      <div className="px-3 py-2 text-lg">{title}</div>
      <div className="flex items-center border-b border-b-line px-3 py-1 text-sm text-meta">
        <div className="flex-grow">닉네임</div>
        <div className="w-14 text-right">승</div>
        <div className="w-14 text-right">패</div>
        <div className="w-16 text-right">승률</div>
      </div>
      {teammates.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-meta">기록이 없습니다.</div>
      ) : (
        teammates.map((entry) => (
          <div
            key={entry.player.id}
            className="flex items-center border-b border-b-line px-3 py-1 text-sm last:border-b-0"
          >
            <div className="flex-grow truncate">
              <Link href={`/player/${entry.player.id}`}>{entry.player.name}</Link>
            </div>
            <div className="w-14 text-right">{formatCount(entry.win)}승</div>
            <div className="w-14 text-right">{formatCount(entry.lose)}패</div>
            <div className={`w-16 text-right ${rateClass(entry.win_rate)}`}>
              {formatRate(entry.win_rate)}%
            </div>
          </div>
        ))
      )}
    </div>
  )
}

/**
 * 무기별 기록 (D-115).
 *
 * 판정된 경기만 나온다. `unknown`은 통합 기록에만 남고 여기 오지 않는다 —
 * 억지로 라플/스나 중 하나에 넣지 않는다.
 *
 * 판정된 경기가 하나도 없으면 **패널 자체를 그리지 않는다.**
 * `0경기 0킬 0데스`는 정보가 아니라 소음이다.
 */
export interface PlayerWeaponStatRow {
  weapon: 0 | 1
  games: number
  win: number
  lose: number
  kill: number
  death: number
  kd_rate: number
  kill_per_match: number
}

export function WeaponStatPanel({ stats }: { stats?: readonly PlayerWeaponStatRow[] }) {
  const rows = (stats ?? []).filter((row) => row.games > 0)
  if (rows.length === 0) return null

  return (
    <div className="mt-3 bg-side px-3 py-3 text-line shadow-card">
      <div>무기별 기록</div>
      {rows.map((row) => (
        <div key={row.weapon}>
          <Divider />
          <Stat label={row.weapon === 1 ? '스나이퍼' : '라이플'}>
            <span className="mr-2 text-base">
              {formatCount(row.games)}판 {formatCount(row.win)}승 {formatCount(row.lose)}패
            </span>
            <span className={rateClass(row.kd_rate)}>{formatRate(row.kd_rate)}%</span>
          </Stat>
          <div className="px-1 pb-1 text-right text-base">
            {formatCount(row.kill)}킬 {formatCount(row.death)}데스 · 판당{' '}
            {row.kill_per_match.toFixed(1)}킬
          </div>
        </div>
      ))}
    </div>
  )
}
