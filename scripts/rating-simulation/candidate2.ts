/**
 * 후보 2안 — 표시 변환 · 미참여 감점 · 정면 대결 실험실 (D-141).
 *
 * 후보 1안에서 확정된 뼈대(순수 Elo · 제로섬 · 상한 있는 구성 보정)는 그대로 두고,
 * 사용자가 새로 제시한 세 가지를 검증한다.
 *
 *   1. **승률·상대강도 >>> KD/MVP** 가 실제로 지켜지는가
 *   2. 4900 은 가능하되 5000 은 역사적 수준에서만 — percentile 앵커 없이
 *   3. 고점 찍고 잠수하면 유지되지 않는가
 */
import { BASELINE, confidenceFor, expectedScore, type PersonalConstants } from './engine.js'

/* -------------------------------------------------------------------------- */
/* 표시 변환                                                                    */
/* -------------------------------------------------------------------------- */

export type DisplayTransform = 'linear' | 'piecewise' | 'convex'

/**
 * 내부 Elo → 표시 점수.
 *
 * ── percentile 앵커를 쓰지 않는다 (사용자 지시 4장)
 *   "매 시즌 상위 0.5% 를 4300 에 맞춘다"는 **상대평가**다. 그러면 아무리 압도적인 시즌도
 *   4300 이 되고, 반대로 약한 시즌의 1등도 4300 이 된다. 점수를 경기로 **버는** 것이 아니게 된다.
 *   그래서 변환은 **고정 함수**로 둔다. 잘하면 올라가고 못하면 안 올라간다.
 *
 * ── 세 후보
 *   linear     3000 + (내부-3000) × s            가장 단순하고 설명하기 쉽다
 *   piecewise  4000 아래는 완만, 위는 가파르게    "4000 벽" 을 만든다
 *   convex     위로 갈수록 배율이 커진다          최상위를 더 벌린다
 *
 * 복잡한 식이 정확도·설명력을 거의 못 올리면 **단순한 쪽을 고른다** (사용자 지시 5장).
 */
export interface DisplayConfig {
  transform: DisplayTransform
  /** linear · piecewise 하단 기울기 */
  scale: number
  /** piecewise 상단 기울기 (4000 이상) */
  upperScale?: number
  /** convex 곡률. 0 이면 linear 와 같다 */
  curvature?: number
}

export const CANDIDATE2_DISPLAY: DisplayConfig = {
  transform: 'linear',
  scale: 3.3,
}

/** 내부 점수(신뢰도 반영 후 편차) → 표시 점수 */
export function applyTransform(adjustedGap: number, config: DisplayConfig): number {
  const gap = adjustedGap
  switch (config.transform) {
    case 'linear':
      return BASELINE + gap * config.scale

    case 'piecewise': {
      // 4000 에 해당하는 편차까지는 완만, 그 위는 가파르게 — "랭커 벽"
      const knee = (4000 - BASELINE) / config.scale
      if (gap <= knee) return BASELINE + gap * config.scale
      return 4000 + (gap - knee) * (config.upperScale ?? config.scale * 1.4)
    }

    case 'convex': {
      // 편차가 커질수록 배율이 커진다. 500 을 기준 단위로 둔다
      const c = config.curvature ?? 0.35
      const boost = 1 + (c * Math.max(0, gap)) / 500
      return BASELINE + gap * config.scale * boost
    }
  }
}

/**
 * 최종 표시 점수.
 *
 * 신뢰도는 **변환 앞에** 곱한다. 덜 검증된 사람의 편차를 3배로 부풀린 뒤
 * 신뢰도를 곱하면, 40판 반짝 선수가 잠깐이라도 최상위에 뜬다.
 */
export function displayScore(
  internal: number,
  games: number,
  personal: PersonalConstants,
  config: DisplayConfig,
): number {
  const confidence = personal.confidenceMode === 'display' ? confidenceFor(games) : 1
  return applyTransform((internal - BASELINE) * confidence, config)
}

/* -------------------------------------------------------------------------- */
/* 미참여 감점                                                                  */
/* -------------------------------------------------------------------------- */

export type DecayMode = 'none' | 'tier' | 'continuous'

export interface DecayConfig {
  mode: DecayMode
  /** 이 점수 아래로는 감점하지 않는다 — 일반 유저를 괴롭히지 않기 위한 바닥 */
  floor: number
}

export const CANDIDATE2_DECAY: DecayConfig = { mode: 'tier', floor: BASELINE }

/**
 * A안 — 내부 rating 구간별 유예일 + 주간 감점.
 *
 * 높이 올라간 사람일수록 유지 비용이 크다. 3700 미만은 아예 건드리지 않는다 —
 * 감점의 목적은 "고점 찍고 잠수한 왕좌"를 막는 것이지 일반 유저를 쫓아내는 것이 아니다.
 *
 * 표는 **내부 Elo 기준**이다. 표시 점수 기준으로 만들면 배율을 바꿀 때마다 정책이 흔들린다.
 */
const TIER_TABLE: { min: number; graceDays: number; weekly: number }[] = [
  { min: 3460, graceDays: 7, weekly: 25 },
  { min: 3395, graceDays: 7, weekly: 20 },
  { min: 3300, graceDays: 10, weekly: 15 },
  { min: 3210, graceDays: 14, weekly: 10 },
]

/** 그 시점 rating 과 미접속 일수 → 이번 주에 깎을 점수 */
export function decayAmount(
  internal: number,
  idleDays: number,
  config: DecayConfig,
): number {
  if (config.mode === 'none') return 0
  if (internal <= config.floor) return 0

  if (config.mode === 'tier') {
    const tier = TIER_TABLE.find((t) => internal >= t.min)
    if (!tier) return 0
    if (idleDays < tier.graceDays) return 0
    return tier.weekly
  }

  /* B안 — 연속식. 유예 7일 뒤부터 "baseline 위 초과분"에 비례해 깎는다.
     구간 경계에서 뚝 끊기지 않는 대신 설명이 조금 어렵다. */
  const grace = 7
  if (idleDays < grace) return 0
  const excess = Math.max(0, internal - 3200)
  return Math.min(30, excess * 0.06)
}

/* -------------------------------------------------------------------------- */
/* 정면 대결 실험실                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 시즌 시뮬레이션은 "원하는 승률"을 직접 지정할 수 없다 — 결과가 경기에서 나오기 때문이다.
 * 그런데 사용자 지시 9장의 FAIL 테스트는 **정확한 조건**을 요구한다
 * (400판 · 승률 58% · 강한 상대 · KD 58%).
 *
 * 그래서 여기서는 조건을 그대로 만족하는 **가상 전적**을 만들어 엔진에 통과시킨다.
 * 시즌 시뮬과 별개의 도구이고, 목적은 단 하나 —
 * **"KD 높은 저승률"이 "강한 상대 상대 고승률"을 이기는가**를 눈으로 확인하는 것.
 */
export interface LabProfile {
  label: string
  games: number
  winRate: number
  /** 상대 팀 평균 rating (고정) */
  opponentRating: number
  /** 그 경기들에서의 평균 퍼포먼스 (-1 ~ +1). KD/MVP 우위를 여기로 표현한다 */
  performance: number
  /** 설명용 — 실제 계산에는 안 쓴다 */
  kd: number
  mvpRate: number
}

export interface LabResult extends LabProfile {
  internal: number
  confidence: number
  display: number
  /** 기대 대비 초과 승리 — "일정을 감안한 승리의 질" */
  winsAboveExpected: number
}

/**
 * 전적을 시간순으로 재생한다.
 *
 * 승패는 목표 승률에 맞춰 **고르게 분포**시킨다 (앞에 몰아주면 rating 경로가 달라진다).
 * 상대 rating 은 고정이라 "그 난이도에서 그 승률"이 정확히 재현된다.
 */
export function runLab(
  profile: LabProfile,
  personal: PersonalConstants,
  display: DisplayConfig,
): LabResult {
  let internal = BASELINE
  let winsAboveExpected = 0
  const targetWins = Math.round(profile.games * profile.winRate)

  for (let i = 0; i < profile.games; i += 1) {
    // 승리를 고르게 배치 — i번째까지 나와야 할 승수와 실제 승수를 비교
    const shouldHaveWon = Math.round(((i + 1) * targetWins) / profile.games)
    const wonSoFar = Math.round((i * targetWins) / profile.games)
    const won = shouldHaveWon > wonSoFar

    const expected = expectedScore(internal, profile.opponentRating)
    const base = personal.k * ((won ? 1 : 0) - expected)
    const perf = Math.abs(base) * personal.performanceWeight * profile.performance
    internal = Math.max(personal.ratingFloor, internal + base + perf)
    winsAboveExpected += (won ? 1 : 0) - expected
  }

  return {
    ...profile,
    internal,
    confidence: confidenceFor(profile.games),
    display: displayScore(internal, profile.games, personal, display),
    winsAboveExpected,
  }
}

/** 사용자 지시 9장의 대결 조합 */
export const LAB_MATCHUPS: { name: string; a: LabProfile; b: LabProfile; expect: string }[] = [
  {
    name: 'A vs B — 강한 일정 58% vs 약한 일정 66%',
    a: { label: 'A 강일정 58%', games: 400, winRate: 0.58, opponentRating: 3300, performance: 0, kd: 58, mvpRate: 10 },
    b: { label: 'B 약일정 66%', games: 400, winRate: 0.66, opponentRating: 2850, performance: 0.6, kd: 72, mvpRate: 22 },
    expect: 'A 가 충분히 경쟁 가능해야 한다 (B가 압도하면 FAIL)',
  },
  {
    name: 'C vs D — KD 82 저승률 vs 강일정 57%',
    a: { label: 'C KD82 승률45%', games: 500, winRate: 0.45, opponentRating: 3000, performance: 1, kd: 82, mvpRate: 40 },
    b: { label: 'D 강일정 57%', games: 500, winRate: 0.57, opponentRating: 3300, performance: 0, kd: 60, mvpRate: 12 },
    expect: 'D 가 **명백히** 높아야 한다',
  },
  {
    name: 'E vs F — 150판 72% 약팀 vs 400판 58% 강팀',
    a: { label: 'E 150판 72% 약팀', games: 150, winRate: 0.72, opponentRating: 2850, performance: 0.7, kd: 75, mvpRate: 25 },
    b: { label: 'F 400판 58% 강팀', games: 400, winRate: 0.58, opponentRating: 3300, performance: 0, kd: 59, mvpRate: 11 },
    expect: 'F 가 E 의 단기·양학 이점을 견제해야 한다',
  },
  {
    name: '신규 반짝 — 40판 75% vs 500판 검증 55%',
    a: { label: '신규 40판 75%', games: 40, winRate: 0.75, opponentRating: 3100, performance: 0.5, kd: 70, mvpRate: 25 },
    b: { label: '검증 500판 55%', games: 500, winRate: 0.55, opponentRating: 3200, performance: 0, kd: 57, mvpRate: 10 },
    expect: '신규가 검증된 상위권을 **쉽게 제치면 안 된다**',
  },
  {
    name: '판수 박치기 — 1000판 41% vs 150판 60%',
    a: { label: '1000판 41%', games: 1000, winRate: 0.41, opponentRating: 3000, performance: 0, kd: 48, mvpRate: 6 },
    b: { label: '150판 60%', games: 150, winRate: 0.6, opponentRating: 3150, performance: 0, kd: 60, mvpRate: 13 },
    expect: '판수만 많은 쪽이 위로 오면 FAIL',
  },
]
