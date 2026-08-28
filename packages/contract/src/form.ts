/**
 * 선수 프로필 `최근 폼` — 월별 킬뎃 추이와 상승/하락 판정 (D-167).
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자가 요구한 새 표시라
 * "원본과 동일함이 검증되지 않음" 이 여기 전체에 붙는다 (CLAUDE.md 3장 7번).
 *
 * ── 두 기준이 다른 이유
 *   그래프는 **최근 6개월 · 한 달 단위**, 판정 문구는 **최근 10경기**다.
 *   사용자가 그렇게 지시했다. 하나로 통일하지 않는다 —
 *   그래프는 "어떻게 흘러왔나", 문구는 "지금 어떤가" 를 답하는 서로 다른 질문이다.
 *
 * ── 킬뎃의 정의
 *   `킬 / (킬 + 데스) × 100` (`derive.ts` 의 `kdRate`). 이 프로젝트가 쓰는 `킬뎃` 은
 *   K/D 비율이 아니라 백분율이다 (원본 실측 확정). 그래서 50% 가 킬·데스 같은 지점이고,
 *   승률과 같은 색 등급(50/55/60/65)을 그대로 쓸 수 있다.
 *
 * ── 모르는 값을 0 으로 채우지 않는다 (D-106)
 *   경기가 없는 달은 `null` 이고 화면에서 `알수없음` 이다. 선을 0 까지 끌어내리지 않는다.
 *   K/D 를 모르는 참가 기록(미러 경기에 흔하다)도 합계에서 아예 뺀다 (D-148) —
 *   0 킬 0 데스로 더하면 판수만 늘고 평균이 거짓이 된다.
 */
import { kdRate } from './derive'

/* -------------------------------------------------------------------------- */
/* 상수 — 흩뿌리지 않는다                                                        */
/* -------------------------------------------------------------------------- */

/** 그래프에 그리는 달 수. 사용자 지시 = 6개월 */
export const FORM_MONTHS = 6

/** 판정에 쓰는 최근 경기 수. 사용자 지시 = 10경기 */
export const FORM_RECENT_GAMES = 10

/**
 * 비교 대상 구간 — 최근 10경기 **바로 앞** 30경기.
 *
 * 전체 누적과 비교하지 않는다. 3년 치 평균과 견주면 그 선수의 "예전"이 아니라
 * "평생"과 비교하는 것이 되어, 최근 반년간 실력이 변한 선수가 영원히 상승/하락으로 굳는다.
 * 10경기의 3배를 잡은 것은 비교 기준이 판정 대상보다 흔들리지 않게 하기 위해서다.
 */
export const FORM_BASELINE_GAMES = 30

/** 비교 구간이 이보다 적으면 판정하지 않는다 (`unknown`). */
export const FORM_MIN_BASELINE_GAMES = 10

/**
 * 상승/하락 경계 — **킬뎃 %p**.
 *
 * ### 왜 5.0 인가 (2026-08-28 로컬 DB 실측, `서플라이공식리그` 상위 400명)
 *
 * `(최근 10경기 킬뎃) − (직전 30경기 킬뎃)` 의 분포:
 * ```
 * 평균 -0.61%p · 표준편차 5.33%p
 * 백분위  5%:-9.2  25%:-4.1  50%:-1.1  75%:+2.8  95%:+8.9
 * ```
 * 그런데 10경기는 표본이 작다. 한 경기 20라운드로 잡으면 킬뎃의 이항 표준오차가
 * 최근 구간 ≈4.0%p, 비교 구간 ≈2.3%p → 두 구간 차이의 표준오차 ≈4.6%p 다.
 * **관측된 5.33%p 의 거의 전부가 표본 흔들림**이라는 뜻이다.
 * 그보다 작은 차이를 "상승/하락" 이라고 부르면 난수를 읽어 주는 것이 된다.
 *
 * 그래서 경계를 관측 표준편차 1개(≈5%p)에 둔다. 그때 400명이 이렇게 갈린다:
 * ```
 * ±3.0 → 급상승 23.0% / 꾸준 43.5% / 하락 33.5%
 * ±4.0 → 급상승 18.0% / 꾸준 55.8% / 하락 26.3%
 * ±5.0 → 급상승 14.8% / 꾸준 65.8% / 하락 19.5%   ← 채택
 * ±6.0 → 급상승 11.3% / 꾸준 74.0% / 하락 14.8%
 * ```
 * `급상승` 은 강한 말이라 흔하면 안 된다. 15% 가 그 말에 맞는 빈도다.
 *
 * **원본과 동일함이 검증되지 않았다.** 원본에는 이 판정 자체가 없다.
 * 값을 바꾸려면 `docs/DECISIONS.md` D-167 도 같이 고친다.
 */
export const FORM_TREND_THRESHOLD_PP = 5

/* -------------------------------------------------------------------------- */
/* 판정                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * - `rising`  최근 폼이 급상승중
 * - `steady`  최근 꾸준한 퍼포먼스
 * - `falling` 최근 퍼포먼스가 하락중
 * - `unknown` 판정할 경기가 부족하다 — **셋 중 하나로 억지로 밀어 넣지 않는다** (D-106)
 */
export type FormTrend = 'rising' | 'steady' | 'falling' | 'unknown'

/** 킬뎃 집계 한 구간 */
export interface FormWindow {
  /** K/D 를 아는 경기 수 */
  games: number
  kill: number
  death: number
}

export interface FormJudgement {
  trend: FormTrend
  /** 최근 구간 킬뎃 %. 판정 불가면 `null` */
  recentKdRate: number | null
  /** 비교 구간 킬뎃 %. 판정 불가면 `null` */
  baselineKdRate: number | null
  /** 두 구간 차이 %p (최근 − 비교). 판정 불가면 `null` */
  delta: number | null
}

const UNJUDGED: FormJudgement = {
  trend: 'unknown',
  recentKdRate: null,
  baselineKdRate: null,
  delta: null,
}

/** 한 구간의 킬뎃 %. 킬·데스가 모두 0이면 계산하지 않는다(`kdRate` 는 0을 준다) */
function windowKdRate(window: FormWindow): number | null {
  if (window.kill + window.death === 0) return null
  return kdRate(window.kill, window.death)
}

/**
 * 최근 구간과 비교 구간의 킬뎃을 견줘 폼을 판정한다.
 *
 * 경기가 부족하면 `unknown` 이다. **부족한 것을 `steady` 로 뭉개지 않는다** —
 * 3경기 뛴 선수에게 "꾸준한 퍼포먼스" 라고 말하면 그건 거짓이다.
 */
export function judgeFormTrend(recent: FormWindow, baseline: FormWindow): FormJudgement {
  if (recent.games < FORM_RECENT_GAMES) return UNJUDGED
  if (baseline.games < FORM_MIN_BASELINE_GAMES) return UNJUDGED

  const recentKdRate = windowKdRate(recent)
  const baselineKdRate = windowKdRate(baseline)
  if (recentKdRate === null || baselineKdRate === null) return UNJUDGED

  /* 표시되는 값(소수점 1자리)끼리 뺀다. 내부 정밀도로 판정하면
     화면의 `52.4% vs 47.4%` 가 경계 바로 아래로 떨어지는 일이 생긴다 */
  const delta = Math.round((recentKdRate - baselineKdRate) * 10) / 10
  const trend: FormTrend =
    delta >= FORM_TREND_THRESHOLD_PP
      ? 'rising'
      : delta <= -FORM_TREND_THRESHOLD_PP
        ? 'falling'
        : 'steady'

  return { trend, recentKdRate, baselineKdRate, delta }
}

/* -------------------------------------------------------------------------- */
/* 달 키 (KST)                                                                 */
/* -------------------------------------------------------------------------- */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const pad2 = (value: number): string => String(value).padStart(2, '0')

/**
 * `Date` → `YYYY-MM` (**KST 기준**).
 *
 * 서버는 UTC 로 도는데 경기 시각 표기는 전부 KST 다 (`toKstIso`).
 * UTC 로 버킷을 나누면 매달 1일 00:00~09:00 경기가 전달로 새어 나간다.
 */
export function formMonthKey(value: Date): string {
  const shifted = new Date(value.getTime() + KST_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`
}

/**
 * 오늘이 속한 달까지 최근 `count` 개월의 키를 **오래된 것 → 최신** 순으로.
 *
 * 그래프의 x축이다. 경기가 없는 달도 자리를 지킨다 — 빈 달을 빼면 6개월이
 * 4개월처럼 보여서 "쉬었다" 는 사실이 사라진다.
 */
export function formMonthKeys(now: Date, count: number = FORM_MONTHS): string[] {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS)
  const keys: string[] = []
  for (let back = count - 1; back >= 0; back -= 1) {
    const month = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - back, 1))
    keys.push(`${month.getUTCFullYear()}-${pad2(month.getUTCMonth() + 1)}`)
  }
  return keys
}

/**
 * 그래프 구간의 시작 시각(UTC `Date`) — `count` 개월 전 1일 00:00 KST.
 *
 * 조회 조건(`startAt >= …`)에 그대로 쓴다.
 */
export function formRangeStart(now: Date, count: number = FORM_MONTHS): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS)
  const firstDayKst = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - (count - 1), 1)
  return new Date(firstDayKst - KST_OFFSET_MS)
}
