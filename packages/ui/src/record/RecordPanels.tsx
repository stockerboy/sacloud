import Link from 'next/link'
import type {
  MatchSummary,
  PlayerDayRecord,
  PlayerTodayPerformance,
  TeammateStat,
} from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
/* 「알」 (`docs/EGG_SYSTEM_SPEC.md` 2장) — 승률 · 킬뎃은 가리고, 판수 · 경기 상세는 그대로 둔다 */
import { EggVeil } from '../egg/EggVeil'
import { EGG_SYSTEM_ENABLED, type EggState } from '../egg/eggState'
import { formatAverage, formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { ratingClass } from '../common/rating'
/* `알수없음` 문구는 한 곳에서만 온다 — 매치 상세와 같은 글자를 써야 한다 (D-159) */
import { UNKNOWN } from './matchDetailView'
import { TodayPerformance } from './TodayPerformance'

/**
 * 이 사이드바가 값을 가려야 하는가.
 *
 * ⚠ 2026-09-02 — **스위치를 먼저 본다** (`eggState.ts` 의 `EGG_SYSTEM_ENABLED`).
 *   이 파일의 두 사이드바만 알 상태를 **문맥이 아니라 prop 으로** 받는데,
 *   그 기본값이 `sealed` 였다. 그래서 `egg` 를 안 넘기는 호출부가 하나라도 생기면
 *   알을 껐는데도 승률·킬뎃이 `▨▨` 로 덮인다. 껐으면 무엇을 넘기든 안 덮는다.
 *
 *   기본값 `sealed` 는 **그대로 둔다** — 스위치를 `true` 로 되돌리면 옛 동작 그대로다
 *   (`CLAUDE.md` 10-4).
 */
function eggSealed(egg?: EggState): boolean {
  if (!EGG_SYSTEM_ENABLED) return false
  return (egg ?? 'sealed') === 'sealed'
}

/**
 * 오늘 기록을 **따로 한 번 더** 그릴까.
 *
 * 최근 3일 기록(D-198)이 오늘 줄을 이미 갖고 있어서 지금은 `false` 다.
 * 3일 기록을 되돌리면 이것만 `true` 로 바꾸면 예전 화면으로 돌아간다.
 */
const SHOW_TODAY_CARD = false

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
 *
 * **선수 기록실에는 더 이상 그리지 않는다** (D-167 · 사용자 지시).
 * 그 자리는 `최근 폼` 그래프가 대신한다. 도넛이 보여 주던 승률 숫자는 바로 옆
 * `20전 16승 4패 (80%)` 에 그대로 있어서 사라지는 정보는 없다.
 * **클랜 기록실은 그대로 도넛이다** — 사용자가 바꾸라고 한 것은 선수 프로필뿐이다.
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

/**
 * 최근 3일치 **일별 기록** (D-198 · 사용자 지시).
 *
 * ```
 * 오늘    미접속
 * 8/16    6전 4승 2패 · 승률 67% · 킬뎃 54% · 판킬 9.2
 * ```
 *
 * 첫 줄은 언제나 오늘이다 — 경기가 없으면 `미접속` 이다. **`0전 0승 0패` 로 적지 않는다**
 * (D-186 과 같은 이유: 0승 0패는 결과처럼 읽힌다).
 * 아래 두 줄은 **실제로 뛴 날**이라 날짜가 건너뛴다.
 */
function RecentDays({ days }: { days: PlayerDayRecord[] }) {
  if (days.length === 0) return null
  return (
    <div className="w-full">
      {days.map((day) => (
        <div key={day.date} className="flex items-baseline py-1">
          <div className="w-12 shrink-0 text-meta">{day.label}</div>
          {day.played ? (
            <div className="min-w-0">
              <span>
                {formatCount(day.games)}전 {formatCount(day.win)}승 {formatCount(day.lose)}패
              </span>
              {day.win_rate === null ? null : (
                <span className={`ml-2 ${rateClass(day.win_rate)}`}>
                  {formatRate(day.win_rate)}%
                </span>
              )}
              <span className="ml-2 text-xs text-meta">
                킬뎃{' '}
                {day.kd_rate === null ? (
                  <span className="text-faint">{UNKNOWN}</span>
                ) : (
                  <span className={rateClass(day.kd_rate)}>{formatRate(day.kd_rate)}%</span>
                )}
                {day.kill_per_match === null ? null : (
                  <> · 판킬 {formatAverage(day.kill_per_match)}</>
                )}
              </span>
            </div>
          ) : (
            /* 그날 아예 안 왔다는 뜻이다 (D-186 의 `미접속` 과 같은 말) */
            <div className="text-meta">미접속</div>
          )}
        </div>
      ))}
    </div>
  )
}

function streakText(streak: MatchSummary['streak']): string {
  if (streak.type === 'none' || streak.count === 0) return ''
  return `${streak.count}${streak.type === 'win' ? '연승' : '연패'} 중`
}

/**
 * 연승/연패 문구 색 (2026-08-28 원본 모바일 관측 — `1연패 중` 빨강 · `6연승 중` 파랑).
 *
 * ⚠ 2026-09-01 — **숫자 전용 토큰**(`--color-num-win/-lose`)으로 옮겼다.
 * `N연승 중` 의 `N` 이 숫자라서 사용자 지시(*"모든 숫자는 … 서플라이의 색깔체계"*)에 든다.
 * 그때는 이랬다: `text-win` / `text-lose` (D-204 의 진홍·회색).
 * 도넛(면·막대)은 여전히 `win`/`lose` 다 — 그건 숫자가 아니다.
 */
function streakClass(streak: MatchSummary['streak']): string {
  if (streak.type === 'win') return 'text-num-win'
  if (streak.type === 'lose') return 'text-num-lose'
  return ''
}

export function RecentMatchSummary({
  summary,
  leagueSlug,
  showKdRate = true,
  today,
  days = [],
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
  /**
   * 선수 기록실의 **오늘 기록** (D-186).
   *
   * **이 값이 있으면 승률 도넛을 그리지 않는다.** 사용자 지시로 선수 프로필에서는
   * 도넛을 뺐고(D-167), 그 자리를 한동안 `최근 폼`(6개월 꺾은선)이 채우다가
   * **2026-08-29 에 오늘 기록으로 바뀌었다** (D-186).
   *
   * 클랜 기록실은 이 값을 넘기지 않으므로 도넛이 그대로 남는다.
   *
   * `null`(응답에 값이 없음)이면 이 블록을 그리지 않고 도넛도 되살리지 않는다 —
   * 빈 자리를 무언가로 메우지 않는다. **오늘 경기가 없는 것과 다르다** —
   * 그때는 값이 있고 문구가 `미접속` 이다.
   */
  today?: PlayerTodayPerformance | null
  /** 최근 3일치 일별 기록 (D-198). 선수 기록실에만 온다 */
  days?: PlayerDayRecord[]
}) {
  /** 선수 기록실인가 — 오늘 기록을 넘긴 쪽이 선수 기록실이다 */
  const isPlayerRecord = today !== undefined

  return (
    <div className="rounded-[2px] border border-line bg-card px-5 py-4">
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
          {/* 도넛은 **클랜 기록실에만** 남는다 (D-167) */}
          {isPlayerRecord ? null : <WinRateDonut rate={summary.win_rate} />}
          <div
            className={`flex min-h-40 items-center justify-center max-md:min-h-0 max-md:py-2 ${
              /* 도넛이 빠지면 왼쪽 여백도 같이 뺀다 — 빈 자리를 남기지 않는다 */
              isPlayerRecord ? '' : 'ml-5'
            }`}
          >
            {/*
              선수 기록실은 `20전 11승 9패` 요약과 `3연승 중` 을 **빼고**
              **최근 3일치 일별 기록**을 넣는다 (D-198 · 사용자 지시).
              클랜 기록실은 예전 그대로다 — 일별 기록은 선수 화면에만 있다.

              계약 필드(`recent_count`·`win`·`lose`·`streak`)는 남겨 뒀다.
              `WeaponStatPanel` 과 같은 처리다 — 값은 그대로 내려오고 화면만 안 쓴다.
            */}
            {isPlayerRecord ? (
              <RecentDays days={days} />
            ) : (
              <div>
                <div>
                  {formatCount(summary.recent_count)}전 {formatCount(summary.win)}승{' '}
                  {formatCount(summary.lose)}패 (
                  {/* 원본은 이 괄호 안 승률에도 색 등급을 준다 (85% → 빨강).
                      랭킹 표와 같은 `rateClass` 규칙이라 새 경계를 만들지 않는다 */}
                  <span className={rateClass(summary.win_rate)}>
                    {formatRate(summary.win_rate)}%
                  </span>
                  )
                </div>
                <div className={`mt-2 ${streakClass(summary.streak)}`}>
                  {streakText(summary.streak)}
                </div>
              </div>
            )}
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
        <div className="mobile-scroll-x ml-20 flex min-h-40 items-center border-l-2 border-l-divider px-20 max-md:ml-0 max-md:min-h-0 max-md:border-l-0 max-md:border-t-2 max-md:border-t-line-soft max-md:px-0 max-md:pt-2">
          <div className="max-md:w-full">
            {summary.opponents.length === 0 ? (
              <div className="text-meta">상대 전적이 없습니다.</div>
            ) : (
              summary.opponents.map((entry) => (
                /* 모바일 원본은 `vs {클랜}` 한 줄, 전적·킬뎃이 그 아래 들여쓴 줄로 온다.
                   예전에는 한 줄로 두고 넘치면 가로로 밀었다 — 원본은 밀지 않고 접는다.
                   항목·순서·문구는 그대로다. `max-md:` 뿐이라 PC 는 한 줄 그대로다. */
                <div
                  key={entry.clan.id}
                  className="flex items-center py-0.5 text-sm max-md:flex-wrap"
                >
                  <span className="mr-1 text-meta">vs</span>
                  <Link
                    href={`/league/${leagueSlug}/clan/${entry.clan.slug}`}
                    className="inline-flex items-center"
                  >
                    {/* 등록 클랜 판정은 마크 URL 이 아니라 클랜 객체가 한다 (D-146).
                        미등록 상대 클랜도 자리를 비우지 않고 fallback 마크를 그린다 */}
                    <ClanMark clan={entry.clan} size="xs" className="mr-1" alt={entry.clan.name} />
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
      {/*
        **오늘 기록** (D-186) — 예전 승률 도넛(원본) → `최근 폼`(D-167) → 이 자리였다.

        지금은 **그리지 않는다.** 최근 3일 기록(D-198)이 이 카드 맨 위에 들어오면서
        오늘 줄을 이미 첫 줄로 갖고 있다. 둘을 다 그리면 같은 하루가 한 카드에
        **두 번** 나온다 (2026-08-30 실측 확인 — `오늘 … 미접속` 이 위아래로 두 번).

        컴포넌트는 지우지 않는다 — 사용자 지시가 "바꿀 때는 전 버전도 남긴다" 이고,
        `today` 를 넘기면 언제든 되살릴 수 있게 자리를 그대로 둔다.
      */}
      {SHOW_TODAY_CARD && today != null ? (
        <div className="mt-2 border-t border-t-line-soft pt-2">
          <TodayPerformance today={today} />
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------- 사이드 패널 --- */

/**
 * 상세정보 카드 (2026-08-30 사용자 선택 · 시안 `표`).
 *
 * ── 왜 바꿨나
 *   예전 카드는 한 줄이 `text-3xl` 이라 아홉 줄이 세로로 길게 늘어졌고,
 *   폰에서 `킬뎃 8,290킬 5,486데스 스나 60.2%` 처럼 값이 라벨을 밀고 나갔다.
 *   사용자 지적: *"글씨 크기도 너무 부담스럽고 세로로 긴것도 개짜치고 글씨 삐져나오고"*
 *
 * ── 지금 규칙
 *   라벨은 왼쪽·보통 굵기·`--color-meta`, 값은 오른쪽 정렬. 선은 행 사이 1px 하나뿐이고
 *   카드 테두리 말고는 아무 선도 쓰지 않는다. 보조 수치(승·패, 킬·데스, 명중)는
 *   `StatSub` 로 **값보다 작고 흐리게** 앞에 붙어, 길어져도 값과 겹치지 않는다.
 */
function Divider() {
  /* 행 사이 선은 `Stat` 이 직접 그린다. 이 자리는 비워 둔다 — 호출부를 건드리지 않기 위해 남긴다 */
  return null
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-t-line-soft py-[7px] text-[13.5px] first-of-type:border-t-0">
      {/* 라벨은 **줄바꿈하지 않는다.** 오른쪽 값이 두 줄이 되면(킬뎃의 무기별 표기)
          라벨 칸이 눌려 `킬 / 뎃` 으로 쪼개졌다 */}
      <div className="shrink-0 whitespace-nowrap text-meta">{label}</div>
      <div className="flex min-w-0 items-baseline justify-end gap-2 text-right font-semibold text-text-strong">
        {children}
      </div>
    </div>
  )
}

/** 값 옆의 보조 수치 — `320승 188패` · `8,290킬 5,486데스` · `1,464명중` */
function StatSub({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap text-[11px] font-normal text-faint">{children}</span>
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
  /**
   * 무기별 기록. 있으면 `킬뎃` 줄이 **주무기 중심**으로 바뀐다 (2026-08-30 사용자 지시).
   *
   * 없으면 예전처럼 통합 킬뎃 하나만 나온다.
   */
  weaponStats?: readonly PlayerWeaponStatRow[]
  /**
   * 「알」 상태 (`docs/EGG_SYSTEM_SPEC.md` 2장).
   *
   * `sealed` 면 **승률 · N승N패 · 킬뎃 · 평균킬**을 가린다.
   * **래더 · 랭킹 · 소속 · 포지션은 가리지 않는다** — 사양의 가림 목록에 없다.
   * 넘기지 않으면 `sealed` 로 본다. 알을 안 씌우려면 명시적으로 `broken` 을 넘긴다.
   */
  egg?: EggState
}

/**
 * 무기별 기록에서 **주무기와 나머지**를 가른다 (2026-08-30 사용자 지시).
 *
 * 주무기는 **판수가 한 판이라도 많은 쪽**이다. 같으면 어느 쪽도 고르지 않는다 (D-106).
 */
function splitWeapons(weaponStats?: readonly PlayerWeaponStatRow[]): {
  main: PlayerWeaponStatRow | null
  other: PlayerWeaponStatRow | null
} {
  const sniper = weaponStats?.find((row) => row.weapon === 1 && row.games > 0) ?? null
  const rifle = weaponStats?.find((row) => row.weapon === 0 && row.games > 0) ?? null
  if (sniper && rifle) {
    if (sniper.games === rifle.games) return { main: null, other: null }
    return sniper.games > rifle.games
      ? { main: sniper, other: rifle }
      : { main: rifle, other: sniper }
  }
  return { main: sniper ?? rifle, other: null }
}

/** 짧은 무기 이름 — 값 옆에 붙어서 좁다 */
const shortWeaponName = (weapon: 0 | 1): string => (weapon === 1 ? '스나' : '라플')
/** 긴 무기 이름 — 줄 라벨 자리다 */
const longWeaponName = (weapon: 0 | 1): string => (weapon === 1 ? '스나이퍼' : '라이플')

export function PlayerStatSidebar(props: PlayerStatSidebarProps) {
  const { main: mainWeapon, other: otherWeapon } = splitWeapons(props.weaponStats)
  /* 「알」이 안 깨졌으면 승률·킬뎃·평균킬을 가린다 (사양 2장). 래더·랭킹·소속·포지션은 그대로다 */
  const sealed = eggSealed(props.egg)
  return (
    <div className="rounded-[2px] border border-line bg-card px-4 py-3 text-text">
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-faint">상세정보</div>
      <Divider />
      <Stat label="래더">
        <span className={ratingClass(props.rating)}>
          {/* 배치고사 폐지 (2026-09-01) — 이 창에 0판이라는 뜻이다 */}
          {props.placement ? '기록 없음' : `${props.rating}점`}
        </span>
      </Stat>
      <Divider />
      <Stat label="승률">
        {sealed ? (
          /* 승률도 N승N패도 가린다. 자리는 남긴다 — 빈칸으로 두지 않는다 (사양 2장) */
          <EggVeil state="sealed">{null}</EggVeil>
        ) : (
          <>
            <StatSub>
              {formatCount(props.win)}승 {formatCount(props.lose)}패
            </StatSub>
            <span className={rateClass(props.winRate)}>{formatRate(props.winRate)}%</span>
          </>
        )}
      </Stat>
      {/*
        `포지션` — **승률 바로 아래** (2026-08-30 사용자 지시 · D-199).
        `스나수` · `2F` · `B리베` · `숏` 중 하나다.
        값이 없으면 줄째로 사라진다 — `-` 나 `알수없음` 으로 채우지 않는다 (D-106).
      */}
      {props.position == null || props.position === '' ? null : (
        <>
          <Divider />
          <Stat label="포지션">{props.position}</Stat>
        </>
      )}
      {sealed ? (
        <>
          <Divider />
          <Stat label="킬뎃">
            <EggVeil state="sealed">{null}</EggVeil>
          </Stat>
        </>
      ) : props.kill === null || props.death === null || props.kdRate === null ? null : (
        <>
          {/*
            킬뎃은 **무기별로만** 적는다 (2026-08-30 사용자 지시).
            **통합 킬뎃은 넣지 않는다** — 스나를 섞어 쓰는 선수에게 통합은 어느 쪽도
            설명하지 못하는 중간값이라 오히려 헷갈린다.

            **많이 쓴 무기가 먼저** 온다 — 스나수면 스나가 위, 라플수면 라플이 위다.
            킬·데스도 그 무기 것만 적는다. 통합 킬·데스를 무기별 퍼센트 옆에 두면
            분자와 분모가 다른 것이 나란히 놓인다.

            무기를 모르는 선수(판정된 경기가 없다)는 예전대로 통합 하나만 나온다 —
            그때는 통합이 그 선수가 가진 유일한 값이다.
          */}
          {mainWeapon === null ? (
            <>
              <Divider />
              <Stat label="킬뎃">
                <StatSub>
                  {formatCount(props.kill)}킬 {formatCount(props.death)}데스
                </StatSub>
                <span className={rateClass(props.kdRate)}>{formatRate(props.kdRate)}%</span>
              </Stat>
            </>
          ) : (
            [mainWeapon, otherWeapon].map((row, index) =>
              row === null ? null : (
                <div key={row.weapon}>
                  <Divider />
                  <Stat label={index === 0 ? '킬뎃' : longWeaponName(row.weapon)}>
                    <StatSub>
                      {formatCount(row.kill)}킬 {formatCount(row.death)}데스
                    </StatSub>
                    <span className={`whitespace-nowrap ${rateClass(row.kd_rate)}`}>
                      {index === 0 ? `${shortWeaponName(row.weapon)} ` : ''}
                      {formatRate(row.kd_rate)}%
                    </span>
                  </Stat>
                </div>
              ),
            )
          )}
        </>
      )}
      <Divider />
      <Stat label="평균킬">
        {sealed ? (
          <EggVeil state="sealed">{null}</EggVeil>
        ) : (
          <>
            <StatSub>판당</StatSub>
            {formatAverage(props.killPerMatch)}킬
          </>
        )}
      </Stat>
      <Divider />
      <Stat label="MVP">{formatCount(props.mvpCount)}회</Stat>
      <Divider />
      <Stat label="랭킹">
        {/* 배치고사 폐지 (2026-09-01) — 순위가 없다는 뜻이다.
            프로필 머리의 `순위 없음` 과 같은 말을 쓴다 */}
        {props.rank === null ? (
          '순위 없음'
        ) : (
          <>
            <StatSub>{formatCount(props.rankCount ?? 0)}명중</StatSub>
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
              <span className="ml-1 text-xs text-faint">미등록</span>
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
  egg,
}: {
  rating: number
  placement: boolean
  win: number
  lose: number
  winRate: number
  division: number
  /** 클랜랭킹 순위. 배치고사 중이면 `null` — 순위 자리에 `배치고사` 를 쓴다 (원본 규칙) */
  rank: number | null
  /**
   * 「알」 상태 (`docs/EGG_SYSTEM_SPEC.md` 2장).
   * `sealed` 면 **승률 · N승N패**만 가린다. 래더 · 부리그 · 순위는 가리지 않는다.
   */
  egg?: EggState
}) {
  const sealed = eggSealed(egg)
  return (
    <div className="rounded-[2px] border border-line bg-card px-4 py-3 text-text">
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-faint">상세정보</div>
      <Divider />
      <Stat label="래더">
        {/* 배치고사 폐지 (2026-09-01) — 이 창에 0판이라는 뜻이다 */}
        <span className={ratingClass(rating)}>{placement ? '기록 없음' : `${rating}점`}</span>
      </Stat>
      <Divider />
      <Stat label="승률">
        {sealed ? (
          <EggVeil state="sealed">{null}</EggVeil>
        ) : (
          <>
            <StatSub>
              {formatCount(win)}승 {formatCount(lose)}패
            </StatSub>
            <span className={rateClass(winRate)}>{formatRate(winRate)}%</span>
          </>
        )}
      </Stat>
      <Divider />
      <Stat label="랭킹">
        {rank === null ? (
          '순위 없음'
        ) : (
          <>
            <StatSub>{division}부리그</StatSub>
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
    <div className="mt-2 rounded-[2px] border border-line bg-card">
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
    <div className="mt-3 rounded-[2px] border border-line bg-card px-5 py-4 text-text">
      <div>무기별 기록</div>
      {rows.map((row) => (
        <div key={row.weapon}>
          <Divider />
          <Stat label={row.weapon === 1 ? '스나이퍼' : '라이플'}>
            <StatSub>
              {formatCount(row.games)}판 {formatCount(row.win)}승 {formatCount(row.lose)}패
            </StatSub>
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
