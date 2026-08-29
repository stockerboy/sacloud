/**
 * `오늘 퍼포먼스` — 개인 기록 카드의 한 줄 (`docs/PLAYER_TRAITS_SPEC.md` 10절 · D-182).
 *
 * ```
 * 6전 2승 4패로 승률은 33퍼, 킬데스 42퍼로 폼이 하락중입니다
 * ```
 *
 * **원본(3rd.supply)에 없는 표시다.** 사용자가 요구한 새 기능이라
 * "원본과 동일함이 검증되지 않음" 이 이 파일 전체에 붙는다 (`CLAUDE.md` 3장 7번).
 *
 * ── 폼은 **킬데스만으로** 정한다
 *   그날의 승률은 문구에 **적기는 하지만 판정에 쓰지 않는다.** 사용자 지시다.
 *   승패는 팀의 결과이고, 이 줄이 답하려는 것은 "이 선수가 오늘 어떤가" 이기 때문이다.
 *
 * ── 기준은 그 선수의 **시즌 평균 킬데스**
 *   전체 평균이 아니라 시즌 창 안의 누적이다. 화면의 다른 수치와 같은 모집단을 써야
 *   같은 카드 안에서 숫자가 어긋나지 않는다 (D-176 · D-178).
 *
 * ── 최근 폼(D-167)과 **다른 것**이다
 *   D-167 은 `최근 10경기 vs 직전 30경기`, 이것은 `오늘 vs 시즌평균` 이다.
 *   묻는 질문이 다르다 — 하나로 합치지 않는다.
 *   > `[미확인]` 이 줄이 기존 `최근 폼` 을 **대체하는지 나란히 두는지** 확정되지 않았다.
 *
 * ── 모르는 값을 0 으로 채우지 않는다 (D-034 · D-106 · D-148)
 *   K/D 를 아는 경기가 오늘 한 판도 없으면 킬데스는 `0` 이 아니라 `null` 이고,
 *   폼은 `unknown` 이다. `steady` 로 뭉개지 않는다.
 */
import { kdRate } from './derive'

/* -------------------------------------------------------------------------- */
/* 상수                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 폼 유지로 보는 폭 — **킬데스 %p**. 사용자 지시 = ±2%p.
 *
 * 예: 시즌 킬데스 61% 인 선수라면 오늘 59~63% 는 `유지중`.
 */
export const TODAY_FORM_THRESHOLD_PP = 2

/**
 * 폼을 판정하는 **최소 판수**. 사용자 확정 = 3판 (2026-08-29).
 *
 * 왜 필요했나 — 한 경기(20라운드)로 잡아도 킬데스의 이항 표준오차가 **≈11%p** 다.
 * `±2%p` 경계는 한 판짜리 표본에서는 거의 항상 넘어간다.
 * 그러면 오늘 1경기 뛴 선수는 `유지중` 이 나올 수가 없고 **상승 아니면 하락으로만** 뜬다.
 * 그건 폼을 읽는 것이 아니라 난수를 읽어 주는 것이다.
 *
 * 3판이면 표준오차가 ≈6.5%p 로 줄어든다. 여전히 2%p 보다 크지만,
 * 사용자가 "오늘"을 말하려면 그날 표본을 더 기다릴 수 없다는 것도 사실이다.
 * **판수가 모자라면 `steady` 로 뭉개지 않고 `unknown` 이다** (D-106).
 * 그때도 전적 문구는 그대로 나간다 — 못 세는 것은 폼뿐이다.
 */
export const TODAY_MIN_GAMES = 3

/**
 * - `rising`  폼 상승
 * - `steady`  폼 유지중
 * - `falling` 폼 하락
 * - `unknown` 판정할 재료가 없다 — 셋 중 하나로 억지로 밀어 넣지 않는다 (D-106)
 */
export type TodayFormTrend = 'rising' | 'steady' | 'falling' | 'unknown'

/* -------------------------------------------------------------------------- */
/* 오늘 (KST)                                                                  */
/* -------------------------------------------------------------------------- */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * `오늘 00:00 KST` 의 UTC 시각. 조회 조건(`startAt >= …`)에 그대로 쓴다.
 *
 * 서버는 UTC 로 도는데 경기 시각 표기는 전부 KST 다 (`toKstIso` · `formMonthKey`).
 * UTC 로 자르면 **매일 00:00~09:00 KST 경기가 "어제" 로 새어 나간다** — 클랜전이
 * 가장 많이 열리는 시간대가 통째로 빠진다.
 */
export function kstDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS)
  const midnightKst = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  )
  return new Date(midnightKst - KST_OFFSET_MS)
}

/* -------------------------------------------------------------------------- */
/* 판정                                                                        */
/* -------------------------------------------------------------------------- */

/** 오늘 뛴 것을 모은 한 덩어리 */
export interface TodayTally {
  /** 오늘 뛴 래더 경기 전부 */
  games: number
  /** 그중 K/D 를 아는 경기 — 킬데스의 분모 */
  knownGames: number
  win: number
  lose: number
  kill: number
  death: number
}

export interface TodayPerformance {
  games: number
  knownGames: number
  win: number
  lose: number
  /** 오늘 승률 %. 오늘 경기가 없으면 `null` */
  winRate: number | null
  /** 오늘 킬데스 %. K/D 를 아는 경기가 없으면 `null` */
  kdRate: number | null
  /** 견준 기준 — 시즌 평균 킬데스 %. 없으면 `null` */
  seasonKdRate: number | null
  /** 오늘 − 시즌평균 (%p). 판정 불가면 `null` */
  delta: number | null
  trend: TodayFormTrend
  /** 화면에 그대로 쓰는 문구 */
  sentence: string
}

/** 오늘 경기가 한 판도 없을 때. **폼을 판정하지 않는다** */
export const NO_GAMES_TODAY = '오늘 경기기록 없음'

const TREND_WORD: Record<Exclude<TodayFormTrend, 'unknown'>, string> = {
  rising: '상승중',
  steady: '유지중',
  falling: '하락중',
}

/** 문구에 쓰는 정수 퍼센트. 표시값과 판정값을 따로 굴리지 않으려고 한 곳에 둔다 */
const percentWord = (value: number): string => String(Math.round(value))

/**
 * 오늘 성적과 시즌 평균을 견줘 `오늘 퍼포먼스` 한 줄을 만든다.
 *
 * 판정은 **킬데스만** 본다. 승률은 문구에만 들어간다 (사용자 지시).
 */
export function buildTodayPerformance(
  today: TodayTally,
  seasonKdRate: number | null,
): TodayPerformance {
  const base = {
    games: today.games,
    knownGames: today.knownGames,
    win: today.win,
    lose: today.lose,
    seasonKdRate,
  }

  if (today.games === 0) {
    return {
      ...base,
      winRate: null,
      kdRate: null,
      delta: null,
      trend: 'unknown',
      sentence: NO_GAMES_TODAY,
    }
  }

  const decided = today.win + today.lose
  const winRate = decided === 0 ? null : Math.round((today.win / decided) * 1000) / 10
  const todayKdRate =
    today.knownGames === 0 || today.kill + today.death === 0
      ? null
      : kdRate(today.kill, today.death)

  const head = `${today.games}전 ${today.win}승 ${today.lose}패로 승률은 ${
    winRate === null ? '알수없음' : `${percentWord(winRate)}퍼`
  }`

  /* 킬데스나 기준이 없으면 **폼을 말하지 않는다.** 없는 것을 `유지중` 으로 부르지 않는다 */
  if (todayKdRate === null || seasonKdRate === null) {
    return {
      ...base,
      winRate,
      kdRate: todayKdRate,
      delta: null,
      trend: 'unknown',
      sentence: `${head}, 킬데스는 알수없음입니다`,
    }
  }

  /* 판수가 모자라면 킬데스는 **보여주되 폼은 말하지 않는다** (`TODAY_MIN_GAMES`).
     한두 판의 킬데스로 상승/하락을 부르면 난수를 읽어 주는 것이 된다.
     분모는 K/D 를 **아는** 판수다 — 킬데스를 그것으로 냈으니 판정도 같은 수로 재야 한다 */
  if (today.knownGames < TODAY_MIN_GAMES) {
    return {
      ...base,
      winRate,
      kdRate: todayKdRate,
      delta: null,
      trend: 'unknown',
      sentence: `${head}, 킬데스 ${percentWord(todayKdRate)}퍼입니다 (${TODAY_MIN_GAMES}판부터 폼을 봅니다)`,
    }
  }

  /* 표시되는 값끼리 뺀다 — 내부 정밀도로 판정하면 화면의 두 수치로는
     설명되지 않는 판정이 나온다 (D-167 이 같은 이유로 그렇게 한다) */
  const delta = Math.round((todayKdRate - seasonKdRate) * 10) / 10
  const trend: Exclude<TodayFormTrend, 'unknown'> =
    delta > TODAY_FORM_THRESHOLD_PP
      ? 'rising'
      : delta < -TODAY_FORM_THRESHOLD_PP
        ? 'falling'
        : 'steady'

  return {
    ...base,
    winRate,
    kdRate: todayKdRate,
    delta,
    trend,
    sentence: `${head}, 킬데스 ${percentWord(todayKdRate)}퍼로 폼이 ${TREND_WORD[trend]}입니다`,
  }
}
