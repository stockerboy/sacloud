import Link from 'next/link'
import type { MatchSummary, TeammateStat } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { formatAverage, formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { ratingClass } from '../common/rating'

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

/**
 * 승률 도넛 — 원본은 원형 게이지. SVG로 같은 크기(w-32 h-40 칸)에 그린다.
 *
 * 남은 조각은 **패배**다 (2026-08-28 원본 모바일 관측 — 승=파랑 · 패=빨강).
 * 예전에는 회색 트랙(`--color-divider`)으로 그려서 "패배"라는 뜻이 사라져 있었다.
 * 색은 매치 카드가 이미 쓰는 토큰(`win-bar` / `lose-bar`)을 그대로 쓴다 — 새로 만들지 않는다.
 */
function WinRateDonut({ rate }: { rate: number }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(100, Math.max(0, rate)) / 100) * circumference
  return (
    /* 모바일은 고정 최소 높이(10rem)를 풀어 도넛 위아래 빈 공간을 없앤다 — 원본도 붙어 있다 */
    <div className="relative flex min-h-40 w-32 shrink-0 items-center justify-center max-md:min-h-0">
      <svg viewBox="0 0 112 112" className="h-28 w-28 -rotate-90" aria-hidden>
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="var(--color-lose-bar)"
          strokeWidth="10"
        />
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

/**
 * 연승/연패 문구 색 (2026-08-28 원본 모바일 관측 — `1연패 중` 빨강 · `6연승 중` 파랑).
 * 도넛과 같은 뜻이므로 같은 토큰 계열(`win` / `lose`)을 쓴다.
 */
function streakClass(streak: MatchSummary['streak']): string {
  if (streak.type === 'win') return 'text-win'
  if (streak.type === 'lose') return 'text-lose'
  return ''
}

export function RecentMatchSummary({
  summary,
  leagueSlug,
  showKdRate = true,
}: {
  summary: MatchSummary
  leagueSlug: string
  /**
   * 상대 클랜 줄에 `- 킬뎃: %` 를 붙일지.
   *
   * 원본은 **선수 기록실에만** 붙인다. 클랜 기록실의 같은 줄에는 킬뎃이 없다
   * (2026-08-27 실측 · UI_PARITY_AUDIT 5-7). 클랜 대 클랜 전적에 개인 킬뎃 합계를
   * 얹으면 무엇의 비율인지 읽히지 않는다.
   */
  showKdRate?: boolean
}) {
  return (
    <div className="bg-card px-4 py-2 shadow-card">
      <div className="text-lg">최근매치</div>
      {/* 모바일은 2단이다 (2026-08-28 원본 모바일 관측).
          1단 `[도넛 | 전적·연승연패]` · 가로 구분선 · 2단 `상대 클랜 목록`.
          항목을 빼지 않고 배치만 바꾼다 (`docs/UI_PARITY_AUDIT.md` 부록 A).
          `max-md:` 규칙은 md 이상에 아예 생성되지 않으므로 PC 는 그대로 한 줄 3칸이다. */}
      <div className="mt-4 flex max-md:flex-col">
        {/* 도넛과 요약 문구는 **모바일에서도 한 줄**이다 (2026-08-28 원본 모바일 관측).
            예전에는 세로로 쌓아서 도넛 아래에 문구가 따로 떨어졌다.
            PC 는 이 묶음이 그대로 바깥 flex 의 첫 칸이라 렌더 결과가 같다. */}
        <div className="flex">
          <WinRateDonut rate={summary.win_rate} />
          <div className="ml-5 flex min-h-40 items-center justify-center max-md:min-h-0 max-md:py-2">
            <div>
              <div>
                {formatCount(summary.recent_count)}전 {formatCount(summary.win)}승{' '}
                {formatCount(summary.lose)}패 (
                {/* 원본은 이 괄호 안 승률에도 색 등급을 준다 (85% → 빨강).
                    랭킹 표와 같은 `rateClass` 규칙이라 새 경계를 만들지 않는다 */}
                <span className={rateClass(summary.win_rate)}>{formatRate(summary.win_rate)}%</span>)
              </div>
              <div className={`mt-2 ${streakClass(summary.streak)}`}>
                {streakText(summary.streak)}
              </div>
            </div>
          </div>
        </div>
        {/*
          원본은 `h-40` 고정이지만, 최근 20전에서 만난 상대 클랜 수가 많으면 넘쳐서
          아래 매치 카드와 겹친다(실제로 겹치는 것을 확인). 최소 높이로 바꿔 늘어나게 한다.
          원본 표본(20전 / 상대 3클랜)에서는 렌더 결과가 동일하다.
        */}
        {/* PC 는 원본 실측대로 좌우 5rem(`ml-20` · `px-20`) 여백을 둔다.
            모바일에서는 그 15rem(≈240px)이 화면을 통째로 밀어내므로 여백을 없애고,
            세로 구분선(`border-l-2`)을 위쪽 구분선으로 바꾼다 — 쌓인 배치에서 왼쪽 선은 뜻이 없다.
            상대가 많거나 클랜명이 길면 줄 하나가 여전히 넘칠 수 있어 **이 블록 안에서만** 스크롤한다. */}
        <div className="mobile-scroll-x ml-20 flex min-h-40 items-center border-l-2 border-l-divider px-20 max-md:ml-0 max-md:min-h-0 max-md:border-l-0 max-md:border-t-2 max-md:border-t-divider max-md:px-0 max-md:pt-2">
          <div className="max-md:w-full">
            {summary.opponents.length === 0 ? (
              <div className="text-meta">상대 전적이 없습니다.</div>
            ) : (
              summary.opponents.map((entry) => (
                /* 모바일 원본은 `vs {클랜}` 한 줄, 전적·킬뎃이 그 아래 들여쓴 줄로 온다.
                   예전에는 한 줄로 두고 넘치면 가로로 밀었다 — 원본은 밀지 않고 접는다.
                   항목·순서·문구는 그대로다. `max-md:` 뿐이라 PC 는 한 줄 그대로다. */
                <div key={entry.clan.id} className="flex items-center py-0.5 text-sm max-md:flex-wrap">
                  <span className="mr-1 text-meta">vs</span>
                  <Link
                    href={`/league/${leagueSlug}/clan/${entry.clan.slug}`}
                    className="inline-flex items-center"
                  >
                    {/* 등록 클랜 판정은 마크 URL 이 아니라 클랜 객체가 한다 (D-146).
                        미등록 상대 클랜도 자리를 비우지 않고 fallback 마크를 그린다 */}
                    <ClanMark
                      clan={entry.clan}
                      size="xs"
                      className="mr-1"
                      alt={entry.clan.name}
                    />
                    {/* 모바일은 클랜명이 자기 줄을 통째로 쓰므로 100px 로 자르지 않는다 —
                        원본 모바일도 `supremacy-` 같은 이름을 끝까지 보여 준다 */}
                    <span className="max-w-[100px] truncate max-md:max-w-none">
                      {entry.clan.name}
                    </span>
                  </Link>
                  <span className="flex items-center max-md:mt-0.5 max-md:w-full max-md:pl-6">
                    <span className="ml-2 max-md:ml-0">
                      {formatCount(entry.win + entry.lose)}전 {formatCount(entry.win)}승{' '}
                      {formatCount(entry.lose)}패 ({formatRate(entry.win_rate)}%)
                    </span>
                    {showKdRate ? (
                      <span className="ml-2 text-meta">
                        - 킬뎃:{' '}
                        <span className={rateClass(entry.kd_rate)}>
                          {formatRate(entry.kd_rate)}%
                        </span>
                      </span>
                    ) : null}
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
  /**
   * 포지션 — 선수가 **직접 설정하는 값**이다 (D-161).
   *
   * 경기를 세서 만들어 내는 값이 아니다. `weaponCopy.resolvePlayerPosition`
   * (무기별 경기 수로 스나/라플/멀티를 정하는 것)과는 **다른 개념**이다.
   *
   * `null` 이면 **줄 자체를 그리지 않는다.** 원본이 그렇다 —
   * 값이 없는 선수의 `상세정보` 에는 `포지션` 줄이 아예 없었다 (2026-08-28 실측).
   * `-` 나 `알수없음` 으로 채우지 않는다 (D-099 · D-106).
   */
  position?: string | null
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
   * 소속.
   *
   * `isOfficialClan` 이 false 면 **공식 등록 클랜이 아니다.** 이름은 남기되
   * 공식 소속처럼 강조하지 않고 `미등록` 을 함께 적는다 (D-146).
   */
  clan: { slug: string; name: string; isOfficialClan?: boolean } | null
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
      {/*
        `포지션` — **래더 바로 아래**다 (원본 모바일 실측 2026-08-28).
        값이 있는 선수에게만 나온다. 없으면 줄째로 사라진다 — 그래서 우리는 예전에
        이 줄을 "원본에 없다" 고 **잘못 판단해 지웠다** (`docs/UI_PARITY_AUDIT.md` 6-2).
      */}
      {props.position == null || props.position === '' ? null : (
        <>
          <Divider />
          {/* 크기는 `Stat` 기본값을 쓴다 — 위아래 `래더 3260점` · `승률 … 58.9%` 와 같은
              오른쪽 **주값** 자리다. `소속` 처럼 `text-base` 로 줄이지 않는다.
              (원본 폰트 크기를 픽셀로 재지는 못했다 `[미확인]` — 같은 열의 이웃에 맞췄다) */}
          <Stat label="포지션">{props.position}</Stat>
        </>
      )}
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
        {formatAverage(props.killPerMatch)}킬
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
      {/*
        여기 있던 `스나이퍼` · `라이플` 두 줄은 **원본에 없어서 뺐다**
        (2026-08-27 원본 실측 · UI_PARITY_AUDIT 6-1).

        같이 지웠던 `포지션` 은 **판단이 틀렸다.** 원본에 있다 — 위쪽 `래더` 바로 아래로
        되살렸다 (D-161). 다만 원본의 `포지션` 은 **선수가 직접 설정하는 값**이고,
        우리가 지웠던 것은 무기별 경기 수로 스나/라플/멀티를 **계산하던** 다른 것이었다.
        계산식 쪽(`resolvePlayerPosition` · `positionLabel`)은 `record/weaponCopy.ts` 에
        남아 있지만 **화면에는 쓰지 않는다.** 원본에 없는 개념이다.
      */}
      <Stat label="소속">
        <span className="text-base">
          {props.clan === null ? (
            /* 무소속은 `없음` 이다 (2026-08-28 원본 모바일 관측). 빈칸도 `-` 도 아니다 —
               전역 프로필 헤더(`PlayerHeader` 의 `소속: 없음`)와도 같은 표기가 된다 */
            '없음'
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

/**
 * 클랜 기록실 사이드 `상세정보` (UI_PARITY_AUDIT 5-2).
 *
 * 우리 클랜 기록실에는 이 블록이 **아예 없었다** — 사이드에 표 하나만 있었다.
 * 원본 실측(2026-08-27, `afterpray`)
 * ```
 * 상세정보
 * 래더   1677점                    ← 천 단위 콤마 **없음** (선수 사이드와 같다)
 * 승률   7,917승 7,424패  51.6%
 * 랭킹   2부리그  8위
 * ```
 * 선수 사이드와 같은 `Stat` / `Divider` 를 쓴다 — 원본도 같은 패널이다.
 */
export function ClanStatSidebar({
  rating,
  placement,
  win,
  lose,
  winRate,
  division,
  rank,
}: {
  rating: number
  placement: boolean
  win: number
  lose: number
  winRate: number
  division: number
  /** 클랜랭킹 순위. 배치고사 중이면 `null` — 순위 자리에 `배치고사` 를 쓴다 (원본 규칙) */
  rank: number | null
}) {
  return (
    <div className="bg-side px-3 py-3 text-line shadow-card">
      <div>상세정보</div>
      <Divider />
      <Stat label="래더">
        <span className={ratingClass(rating)}>{placement ? '배치고사' : `${rating}점`}</span>
      </Stat>
      <Divider />
      <Stat label="승률">
        <span className="mr-2 text-base">
          {formatCount(win)}승 {formatCount(lose)}패
        </span>
        <span className={rateClass(winRate)}>{formatRate(winRate)}%</span>
      </Stat>
      <Divider />
      <Stat label="랭킹">
        {rank === null ? (
          '배치고사'
        ) : (
          <>
            <span className="mr-2 text-base">{division}부리그</span>
            {formatCount(rank)}위
          </>
        )}
      </Stat>
    </div>
  )
}

export function TeammateTable({
  title,
  teammates,
}: {
  /** 개인 기록실: `최근 같이한 플레이어` / 클랜 기록실: `최근 클랜전 플레이어 승률` */
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
