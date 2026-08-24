/**
 * 최종안 (FINAL) — 후보 2안에서 남은 4가지를 확정하기 위한 모듈 (D-142).
 *
 *   A. 표시 점수 함수
 *   B. 개인 미참여 감점 (훨씬 강하게 · 실력과 활동성 분리)
 *   C. 클랜 구성 보정 상한
 *   D. 개인 퍼포먼스 0% vs ±2%
 *
 * ── SACLOUD 환경의 전제 (절대 잊지 않는다)
 *   제3보급창고 클랜전에는 **자동 매치메이킹이 없다.** 사람이 상대를 직접 고른다.
 *   그래서 공식 자체가 매칭 필터 역할을 어느 정도 해야 한다 —
 *   "약한 상대만 골라 잡아서는 고점에 갈 수 없다" 가 공식 안에서 성립해야 한다.
 */
import { BASELINE, confidenceFor, expectedOutcomeFactor, expectedScore, type PersonalConstants } from './engine.js'
import { Rng } from './rng.js'

/* -------------------------------------------------------------------------- */
/* A. 표시 점수                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 표시 점수 = 3000 + (내부 − 3000) × 신뢰도 × 배율
 *
 * ── percentile 앵커를 쓰지 않는다
 *   "상위 0.5% 는 자동으로 4300" 같은 상대평가는 점수를 **버는** 구조를 없앤다.
 *   압도적인 시즌도 4300 이 되고 약한 시즌의 1등도 4300 이 된다.
 *
 * ── 왜 선형인가
 *   piecewise·convex 를 같은 시드로 비교했더니 실력 재현도가 **셋 다 0.908** 로 같았다.
 *   그런데 convex 는 4900+ 를 3명, 5000+ 를 2명 만들어 희귀성 요구와 정면 충돌했다.
 *   정확도가 같다면 **설명할 수 있는 쪽**을 고른다 (사용자 지시 22장).
 */
export let FINAL_DISPLAY_SCALE = 3.5

export function setDisplayScale(value: number): void {
  FINAL_DISPLAY_SCALE = value
}

/**
 * **약팀 사냥 차단선** — 기대 승률이 이 값 이상이면 이겨도 점수가 오르지 않는다.
 *
 * 0.90 은 상대보다 약 382점 위라는 뜻이다. 이 선을 넘어선 상대를 아무리 많이 이겨도
 * 더 오르지 않으므로, 양학의 상한이 **"내가 사냥하는 팀 중 가장 센 팀 + 382"** 로 고정된다.
 *
 * 스윕 결과 0.90 은 정직한 일정(강일정 55% · 최상위 50/60/70% · 혼합 62% · 300판 58% ·
 * 500판 55% · 150판 60% · 40판 75%)의 점수를 **한 점도 바꾸지 않았다.**
 * 0.85 까지 내리면 정상 일정도 깎이기 시작한다.
 */
export const FINAL_WIN_GAIN_CUTOFF = 0.9

/**
 * **개인 퍼포먼스(KD·MVP) 반영 비율 — 0.**
 *
 * 시드 3개로 0% / ±2% / ±5% 를 비교했다.
 *
 *   비중    실력 재현도      일정 감안 승리의 질
 *   0%      0.9066/0.9173/0.8915   0.987/0.982/0.979
 *   ±2%     0.9076/0.9179/0.8929   0.973/0.969/0.973
 *   ±5%     0.9087/0.9191/0.8938   0.903/0.915/0.921
 *
 * ±2% 는 실력 재현도를 **+0.001** 올리고, 사용자가 1순위로 지목한
 * "일정을 감안한 승리의 질" 을 **−0.011** 내린다. 세 시드 모두 같은 방향이다.
 * 1순위 지표를 더 많이 깎으면서 사는 것이므로 **손해 보는 거래**다.
 *
 * 그래서 0 으로 확정한다. KD·MVP 는 프로필 통계로만 보여 준다.
 * 덕분에 설명도 한 문장으로 끝난다 — **"킬뎃은 점수에 들어가지 않는다."**
 */
export const FINAL_PERFORMANCE_WEIGHT = 0

/* -------------------------------------------------------------------------- */
/* 랭커 자격선 — 승률 (D-143)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * **강한 상대와 많이 붙었다는 사실은 랭커 자격이 아니다.**
 * 랭커가 되려면 최소 48% 이상 실제로 이겨야 한다.
 *
 * ── 왜 필요한가
 *   순수 Elo 는 "최상위(3400~3600) 상대에게 30% 승" 을 내부 3,318 로 평가한다.
 *   수학적으로는 맞다 — 그 정도 상대에게 30% 를 따내면 평균보다 확실히 위다.
 *   그런데 표시 4,115 는 "확실한 랭커" 구간이다. **10판 중 7판을 지는 사람이 랭커가 된다.**
 *   상대 강도는 승리의 **가치**를 정하는 것이지, 패배의 **면죄부**가 아니다.
 *
 * ── 왜 밴드마다 다른가
 *   4000 하나만 막으면 47% 선수들이 전부 3,999 에 몰린다. 그리고 "점수가 높을수록
 *   실제 승률도 높아야 한다" 는 요구를 4000 한 줄로는 표현할 수 없다.
 *
 * 이 표는 **표시 점수에만** 적용한다. 내부 Elo(실력 추정치)는 건드리지 않는다.
 */
export const WIN_RATE_BANDS: { minDisplay: number; minWinRate: number }[] = [
  { minDisplay: 4000, minWinRate: 0.48 },
  { minDisplay: 4300, minWinRate: 0.5 },
  { minDisplay: 4500, minWinRate: 0.52 },
  { minDisplay: 4700, minWinRate: 0.55 },
  { minDisplay: 4800, minWinRate: 0.58 },
  { minDisplay: 4900, minWinRate: 0.6 },
]

/** 부족한 승률 1%p 당 자격선 아래로 더 내려가는 점수 (B안) */
export const SHORTFALL_PENALTY_PER_POINT = 20

export type BandGateMode = 'hard' | 'soft' | 'off'

/**
 * 승률 자격선을 표시 점수에 적용한다.
 *
 *   hard — 자격 미달이면 그 밴드 바로 아래(−1)로 자른다. 설명이 가장 쉽다
 *   soft — 자른 뒤 **부족한 승률만큼 더** 내린다. 3,999 에 몰리는 현상을 없앤다
 *   off  — 적용하지 않는다 (대조군)
 */
export function applyWinRateBands(
  display: number,
  winRate: number,
  mode: BandGateMode = 'soft',
  bands = WIN_RATE_BANDS,
): number {
  if (mode === 'off') return display
  let ceiling = Number.POSITIVE_INFINITY
  for (const band of bands) {
    if (winRate >= band.minWinRate) continue
    const shortfall = band.minWinRate - winRate
    const extra = mode === 'soft' ? shortfall * 100 * SHORTFALL_PENALTY_PER_POINT : 0
    ceiling = Math.min(ceiling, band.minDisplay - 1 - extra)
  }
  return Math.min(display, ceiling)
}

/**
 * **클랜 상위 자격선** (D-143 · 사용자 지시 12장).
 *
 * 개인의 48% 를 그대로 복붙하지 않는다. 클랜은 조직이라 로스터가 돌고 일정도 덩어리진다.
 * 그래서 **더 느슨하게** 잡는다.
 *
 * 그래도 방치하면 안 된다 — 실측에서 승률 **42%** 클랜이 강팀만 상대했다는 이유로
 * 100팀 중 **7위**에 올랐다. 개인과 같은 이유로 이상하다.
 *
 * 클랜 점수는 내부 Elo 스케일(3000 ± 400)이라 개인 표시 점수와 구간이 다르다.
 */
export const CLAN_WIN_RATE_BANDS: { minScore: number; minWinRate: number }[] = [
  { minScore: 150, minWinRate: 0.45 },
  { minScore: 300, minWinRate: 0.5 },
]

/** 클랜 구간은 **기준점 대비 상대값**으로 정의한다 (D-145 — 기준점이 움직일 수 있다) */
function clanBandFloor(minScore: number): number {
  return BASELINE + minScore
}

/** 클랜 스케일에 맞춘 부족분 벌점 (개인 20점의 1/3.5) */
export const CLAN_SHORTFALL_PENALTY_PER_POINT = 6

export function applyClanWinRateBands(
  score: number,
  winRate: number,
  mode: BandGateMode = 'soft',
  bands = CLAN_WIN_RATE_BANDS,
): number {
  if (mode === 'off') return score
  let ceiling = Number.POSITIVE_INFINITY
  for (const band of bands) {
    if (winRate >= band.minWinRate) continue
    const shortfall = band.minWinRate - winRate
    const extra = mode === 'soft' ? shortfall * 100 * CLAN_SHORTFALL_PENALTY_PER_POINT : 0
    ceiling = Math.min(ceiling, clanBandFloor(band.minScore) - 1 - extra)
  }
  return Math.min(score, ceiling)
}

/* -------------------------------------------------------------------------- */
/* 일방적인 경기 억제 (D-143)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 차단선(D-142)을 대체한다.
 *
 * `full` 이하로 예상된 결과는 그대로, `zero` 이상으로 예상된 결과는 반영하지 않는다.
 * **이변은 언제나 만점**이다 — 강한 상대를 실제로 이긴 것이 가장 크게 평가돼야 한다.
 */
export let FINAL_SUPPRESSION: { full: number; zero: number } = { full: 0.8, zero: 0.88 }

export function setSuppression(value: { full: number; zero: number }): void {
  FINAL_SUPPRESSION = value
}

/**
 * ── 왜 0.80 ~ 0.88 인가 (스윕 결과)
 *
 *   변형        시즌 실력상관  일정승리질  시즌 최고  약팀600전승  OUTLIER
 *   hard .90    0.9066       0.987      4,781     4,945       5,638
 *   .70-.85     0.8881       0.915      4,348     4,614       5,399
 *   .75-.85     0.8920       0.935      4,453     4,627       5,455
 *   .80-.88     0.8988       0.960      4,618     4,774       5,536   <- 채택
 *   .80-.90     0.8995       0.965      4,652     4,873       5,550
 *
 * 완벽한 양학(600판 전승)의 상한은 **끝점(zero)** 이 정한다 — "사냥하는 팀 중 가장 센 팀 +
 * diff(zero)". 0.90 이면 4,873 으로 역사적 영역(4900)에 닿아 실패다. 0.88 이 경계다.
 *
 * 시작점(full)은 **정상 상위권이 얼마나 깎이는가**를 정한다. 낮출수록 양학은 더 막히지만
 * 모집단이 작아 상위권이 자기 수준의 상대를 못 만나는 SACLOUD 에서는 **정상 강자까지** 깎인다.
 * 0.65 로 잡았더니 시즌 최고가 4,781 → 4,145 로 무너지고 4300+ 가 0명이 됐다 —
 * 밴드 의미 자체가 붕괴한다. 0.80 이 양학 차단과 밴드 보존이 함께 성립하는 지점이다.
 */

/** 구성 보정 상한 — 상한 0/30/50/70/100 스윕에서 고른 값 */
export const FINAL_COMPOSITION_CAP = 50
/** 구성 보정 창 — 최근 N경기 */
export const FINAL_COMPOSITION_WINDOW = 20

export function finalDisplay(internal: number, games: number, scale = FINAL_DISPLAY_SCALE): number {
  return BASELINE + (internal - BASELINE) * confidenceFor(games) * scale
}

/** 표시 점수 + 승률 자격선까지 적용한 최종 표시 점수 */
export function finalDisplayGated(
  internal: number,
  games: number,
  winRate: number,
  mode: BandGateMode = 'soft',
  scale = FINAL_DISPLAY_SCALE,
): number {
  return applyWinRateBands(finalDisplay(internal, games, scale), winRate, mode)
}

/* -------------------------------------------------------------------------- */
/* B. 미참여 감점 — 실력이 아니라 **활동성**을 깎는다                              */
/* -------------------------------------------------------------------------- */

/**
 * ── 왜 내부 Elo 를 깎지 않는가 (사용자 지시 8장)
 *   한 달 쉬었다고 실력이 사라진 것은 아니다. 사라진 것은 **현재 왕좌를 지킬 자격**이다.
 *   그래서 내부 Elo(실력 추정치)는 그대로 두고, **활동 페널티**를 따로 쌓아
 *   표시 점수에서만 뺀다.
 *
 * ── 그런데 복귀하자마자 원상복구되면 안 된다
 *   "1판만 던지면 초기화" 는 명백한 악용 경로다. 그래서
 *     · 페널티는 **경기당 조금씩만** 회복된다 (한 판으로 다 지워지지 않는다)
 *     · 타이머는 마지막 경기 기준이라 한 판을 던지면 **더 쌓이는 것은** 멈춘다.
 *       하지만 이미 쌓인 것은 남는다 — 되찾으려면 실제로 계속 뛰어야 한다
 *
 * ── 구간은 **표시 점수** 기준이다
 *   "4800 을 지키려면 계속 경쟁해야 한다" 는 정책이라 사람이 보는 숫자로 정의하는 것이 자연스럽다.
 */
export interface DecayTier {
  /** 이 표시 점수 이상 */
  minDisplay: number
  graceDays: number
  /** 유예 이후 주당 감점 */
  weekly: number
}

export const FINAL_DECAY_TIERS: DecayTier[] = [
  { minDisplay: 4900, graceDays: 7, weekly: 60 },
  { minDisplay: 4800, graceDays: 7, weekly: 50 },
  { minDisplay: 4600, graceDays: 7, weekly: 40 },
  { minDisplay: 4300, graceDays: 7, weekly: 30 },
  { minDisplay: 4000, graceDays: 10, weekly: 20 },
  // 4000 미만은 감점하지 않는다 — 일반 유저를 괴롭히지 않는다
]

/** 경기 한 판이 지워 주는 페널티. 한 판으로 다 지워지지 않게 작게 둔다 */
export const PENALTY_RECOVERY_PER_GAME = 8

export function decayTierFor(displayBeforePenalty: number): DecayTier | null {
  return FINAL_DECAY_TIERS.find((t) => displayBeforePenalty >= t.minDisplay) ?? null
}

/** 이번 주에 더 쌓일 페널티 */
export function weeklyPenalty(displayBeforePenalty: number, idleDays: number): number {
  const tier = decayTierFor(displayBeforePenalty)
  if (!tier) return 0
  if (idleDays < tier.graceDays) return 0
  return tier.weekly
}

/**
 * 하루치 페널티.
 *
 * 주 단위로만 끊으면 유예가 끝난 다음 날 갑자기 50점이 빠진다. 하루씩 나눠 쌓으면
 * "주 -50" 이라는 설명은 그대로 두면서 체감이 매끄럽다.
 */
export function dailyPenalty(displayBeforePenalty: number, idleDays: number): number {
  return weeklyPenalty(displayBeforePenalty, idleDays) / 7
}

/**
 * 잠수 n일 뒤의 표시 점수.
 *
 * 구간이 표시 점수 기준이라 **내려가면서 감점 속도도 같이 느려진다** — 자동으로 자기 제한이 걸린다.
 * (4900 에서 주 60 으로 시작해도 4600 아래로 내려오면 주 40 이 된다)
 */
export function displayAfterIdle(displayBeforePenalty: number, idleDays: number): number {
  let penalty = 0
  for (let day = 1; day <= Math.floor(idleDays); day += 1) {
    const current = displayBeforePenalty - penalty
    // 유예 판정은 "며칠 쉬었는가", 감점 크기는 "지금 몇 점인가" 기준
    penalty += dailyPenalty(current, day)
    penalty = cappedPenalty(displayBeforePenalty, penalty)
  }
  return displayBeforePenalty - penalty
}

/**
 * 복귀 후 페널티를 다 지우는 데 필요한 경기 수.
 * "1판 던지고 초기화" 가 되는지 확인하는 값이다.
 */
export function gamesToClearPenalty(penalty: number): number {
  return Math.ceil(penalty / PENALTY_RECOVERY_PER_GAME)
}

/* -------------------------------------------------------------------------- */
/* 클랜 미참여 — 개인과 다른 표를 쓴다 (사용자 지시 20장)                          */
/* -------------------------------------------------------------------------- */

/**
 * 클랜은 개인보다 기준이 짧아도 된다 — 한 사람이 아니라 조직이라 누군가는 나올 수 있다.
 * 목적은 점수 파괴가 아니라 **active leaderboard 의 의미 유지**다.
 *
 * 클랜 점수는 내부 Elo 스케일(3000 ± 400) 그대로라 개인보다 값이 작다.
 */
export const CLAN_DECAY_TIERS: { minIdleDays: number; weekly: number }[] = [
  { minIdleDays: 21, weekly: 30 },
  { minIdleDays: 14, weekly: 20 },
  { minIdleDays: 7, weekly: 10 },
]

export function clanDailyPenalty(idleDays: number): number {
  const tier = CLAN_DECAY_TIERS.find((t) => idleDays >= t.minIdleDays)
  return tier ? tier.weekly / 7 : 0
}

/** 클랜도 경기로만 회복한다 */
export const CLAN_PENALTY_RECOVERY_PER_GAME = 5

/**
 * 페널티 상한 — 감점만으로 3000 아래로 떨어지지 않는다.
 * 실력 추정치는 그대로이므로 "활동을 안 해서 기준점까지 내려왔다" 가 최대다.
 */
export function cappedPenalty(displayBeforePenalty: number, penalty: number): number {
  return Math.max(0, Math.min(penalty, displayBeforePenalty - BASELINE))
}

/* -------------------------------------------------------------------------- */
/* 자유대전 양학 stress (사용자 지시 13장)                                        */
/* -------------------------------------------------------------------------- */

export interface ScheduleProfile {
  label: string
  games: number
  winRate: number
  /** 상대 rating 범위 — 자유롭게 상대를 고를 수 있는 환경을 표현한다 */
  opponentMin: number
  opponentMax: number
  performance: number
  note: string
}

/**
 * 상대를 직접 고를 수 있는 환경을 재현한다.
 *
 * ── 상대도 같이 움직인다 (**중요**)
 *   처음에는 상대 rating 을 고정해 두고 돌렸다. 그랬더니
 *     · 역대급 outlier 가 5,982
 *     · 약팀만 300판 잡은 양학러가 4,836
 *   이 나왔다. 둘 다 **고정 상대의 산물**이다 — 현실에서는 내가 계속 이기면
 *   그 상대들의 점수가 내려가고, 그러면 이겨도 점점 덜 오른다.
 *
 *   그래서 상대를 **유한한 풀**로 두고 지면 그들도 점수를 잃게 했다 (제로섬).
 *   이게 자유대전 양학을 정직하게 재는 유일한 방법이다.
 *   풀이 작을수록(= 같은 약팀만 반복해서 고를수록) 수익이 빨리 마른다.
 */
export const OPPONENT_POOL_SIZE = 30

export function runSchedule(
  profile: ScheduleProfile,
  personal: PersonalConstants,
  scale = FINAL_DISPLAY_SCALE,
  poolSize = OPPONENT_POOL_SIZE,
  /** 경로 시드 — 같은 조건이라도 승패 순서가 다르면 도착점이 다르다 */
  pathSeed = 0,
  /** 승률 자격선 적용 방식 */
  bandMode: BandGateMode = 'soft',
): {
  profile: ScheduleProfile
  internal: number
  display: number
  avgOpponent: number
  /** 시작 대비 상대 풀이 얼마나 내려갔는가 — 양학의 대가 */
  poolDrift: number
  winsAboveExpected: number
} {
  let internal = BASELINE
  let opponentSum = 0
  let winsAboveExpected = 0
  const targetWins = Math.round(profile.games * profile.winRate)

  /* 상대 풀 — 지정한 범위에 고르게 깔아 둔다 */
  const pool = Array.from({ length: poolSize }, (_, i) =>
    poolSize === 1
      ? profile.opponentMin
      : profile.opponentMin + ((profile.opponentMax - profile.opponentMin) * i) / (poolSize - 1),
  )
  const poolStart = pool.reduce((a, b) => a + b, 0) / pool.length

  /* 승패 순서와 상대 순서를 **결정적으로 섞는다** (D-142).
 
     처음에는 승리를 균등 간격으로 놓고 상대를 `i % poolSize` 로 돌렸다. 그런데 두 주기가
     맞물리면(예: 승률 95% → 20판마다 패배, 풀 30 → gcd 10) 패배가 **단 3명에게만** 몰린다.
     그 3명은 계속 올라가고 나머지 27명은 가라앉는다. 올라간 상대에게 지는 것은 손실이 작으니
     점수가 부풀었다 — 풀이 유한한데도 무한 풀보다 점수가 **높게** 나오는 역전이 났다.
 
     그래서 승패 배열과 상대 선택을 고정 시드로 섞어 주기 공명을 없앤다.
     시드가 고정이라 재현성은 그대로다. */
  const rng = new Rng(profile.games * 1000 + Math.round(profile.winRate * 1000) + pathSeed * 7919)
  const outcomes = Array.from({ length: profile.games }, (_, i) => i < targetWins)
  for (let i = outcomes.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i)
    ;[outcomes[i], outcomes[j]] = [outcomes[j]!, outcomes[i]!]
  }

  for (let i = 0; i < profile.games; i += 1) {
    const idx = rng.int(0, poolSize - 1)
    const opponent = pool[idx]!
    opponentSum += opponent

    const won = outcomes[i]!

    const expected = expectedScore(internal, opponent)
    let base = personal.k * ((won ? 1 : 0) - expected)
    // 엔진(personalUpdate)과 **같은 규칙**을 쓴다. 어긋나면 실험실 결과가 거짓이 된다
    if (personal.winGainCutoff !== undefined && won && expected >= personal.winGainCutoff) base = 0
    if (personal.weakWinSuppression) {
      base *= expectedOutcomeFactor(won ? expected : 1 - expected, personal.weakWinSuppression)
    }
    const perf = Math.abs(base) * personal.performanceWeight * profile.performance
    internal = Math.max(personal.ratingFloor, internal + base + perf)
    // 상대도 같은 크기만큼 반대로 움직인다 (제로섬)
    pool[idx] = Math.max(personal.ratingFloor, opponent - base)
    winsAboveExpected += (won ? 1 : 0) - expected
  }

  const poolEnd = pool.reduce((a, b) => a + b, 0) / pool.length
  return {
    profile,
    internal,
    display: applyWinRateBands(
      finalDisplay(internal, profile.games, scale),
      profile.winRate,
      bandMode,
    ),
    avgOpponent: opponentSum / profile.games,
    poolDrift: poolEnd - poolStart,
    winsAboveExpected,
  }
}

/** 사용자 지시 13장 + 17·18장의 조건을 그대로 옮긴 것 */
export const SCHEDULE_STRESS: ScheduleProfile[] = [
  /* --- 13장: 자유대전 양학 --- */
  { label: 'A 양학 4300급이 3000~3200만 300판 90%', games: 300, winRate: 0.9, opponentMin: 3000, opponentMax: 3200, performance: 0.5, note: '약팀만 골라 잡기 — 4800~4900 가면 FAIL' },
  { label: 'B 4000급이 3900~4500 상대 250판 58%', games: 250, winRate: 0.58, opponentMin: 3230, opponentMax: 3450, performance: 0, note: '강한 일정에서 견실' },
  { label: 'C 4500급 혼합 일정 300판 62%', games: 300, winRate: 0.62, opponentMin: 3000, opponentMax: 3400, performance: 0, note: '정상 일정' },
  /* --- 일정 강도 경계 찾기 --- */
  { label: '약일정 70% (2900~3050)', games: 300, winRate: 0.7, opponentMin: 2900, opponentMax: 3050, performance: 0.4, note: '' },
  { label: '강일정 55% (3250~3450)', games: 300, winRate: 0.55, opponentMin: 3250, opponentMax: 3450, performance: 0, note: '' },
  { label: '최상위일정 50% (3400~3600)', games: 300, winRate: 0.5, opponentMin: 3400, opponentMax: 3600, performance: 0, note: '강자 상대 5할' },
  { label: '최상위일정 30% (3400~3600)', games: 300, winRate: 0.3, opponentMin: 3400, opponentMax: 3600, performance: 0, note: '강자와 붙지만 계속 진다 — 상위권이면 FAIL' },
  /* --- 17장: 판수 박치기 --- */
  { label: '1000판 41%', games: 1000, winRate: 0.41, opponentMin: 3000, opponentMax: 3100, performance: 0, note: '' },
  { label: '1000판 48%', games: 1000, winRate: 0.48, opponentMin: 3000, opponentMax: 3100, performance: 0, note: '' },
  { label: '1000판 50%', games: 1000, winRate: 0.5, opponentMin: 3000, opponentMax: 3100, performance: 0, note: '' },
  { label: '700판 52%', games: 700, winRate: 0.52, opponentMin: 3000, opponentMax: 3150, performance: 0, note: '' },
  { label: '400판 강일정 58%', games: 400, winRate: 0.58, opponentMin: 3200, opponentMax: 3400, performance: 0, note: '' },
  { label: '250판 최상위일정 60%', games: 250, winRate: 0.6, opponentMin: 3300, opponentMax: 3500, performance: 0, note: '' },
  /* --- 18장: 신규 반짝 --- */
  { label: '20판 90%', games: 20, winRate: 0.9, opponentMin: 3050, opponentMax: 3200, performance: 0.5, note: '' },
  { label: '40판 75%', games: 40, winRate: 0.75, opponentMin: 3050, opponentMax: 3200, performance: 0.4, note: '' },
  { label: '60판 70%', games: 60, winRate: 0.7, opponentMin: 3050, opponentMax: 3200, performance: 0.3, note: '' },
  { label: '100판 65%', games: 100, winRate: 0.65, opponentMin: 3050, opponentMax: 3200, performance: 0.2, note: '' },
  { label: '150판 60%', games: 150, winRate: 0.6, opponentMin: 3050, opponentMax: 3200, performance: 0.1, note: '' },
  { label: '300판 58%', games: 300, winRate: 0.58, opponentMin: 3100, opponentMax: 3300, performance: 0, note: '' },
  { label: '500판 55%', games: 500, winRate: 0.55, opponentMin: 3100, opponentMax: 3300, performance: 0, note: '' },
  { label: '700판 53%', games: 700, winRate: 0.53, opponentMin: 3100, opponentMax: 3300, performance: 0, note: '' },
  /* --- KD 파밍 --- */
  { label: 'KD82 승률45%', games: 500, winRate: 0.45, opponentMin: 3000, opponentMax: 3150, performance: 1, note: 'KD 최대치로 밀어도 상위권이면 FAIL' },
]

/**
 * **역사적 outlier** (사용자 지시 16장).
 *
 * 5000 에 하드캡이 없다는 것을 실제로 확인하기 위한 극단 조건이다.
 * 이 선수조차 5000 에 못 가면 사실상의 soft cap 이 있다는 뜻이고,
 * 반대로 평범한 상위권이 5000 에 가면 그것도 실패다.
 */
export const HISTORIC_OUTLIER: ScheduleProfile = {
  label: 'HISTORIC_OUTLIER 700판 82% · 최상위 일정',
  games: 700,
  winRate: 0.82,
  opponentMin: 3350,
  opponentMax: 3650,
  performance: 0.3,
  note: '많이 · 강자와 · 실제로 이김 — 역대급 시즌',
}

/**
 * 같은 조건을 **여러 경로로** 돌려 평균을 낸다.
 *
 * ── 왜 필요한가 (D-142 · 하네스 결함 #7)
 *   처음에는 경로 하나만 돌려서 결론을 냈다. 그런데 Elo 는 평형점 **주위를 랜덤워크**한다.
 *   K=50 에서 한 경로의 도착점은 평형점에서 내부 ±100 (표시 ±350) 까지 벌어진다.
 *   그 탓에 "500판 55% 검증된 강자(3410)" 가 "40판 75% 신규(3577)" 에게 지는,
 *   조건상 나올 수 없는 결과가 나왔다. 경로 하나를 설계 판정의 근거로 쓰면 안 된다.
 *
 *   경로 9개의 평균을 쓰면 표준오차가 1/3 로 줄어 판정이 안정된다.
 */
export const LAB_PATHS = 25

export function runScheduleAverage(
  profile: ScheduleProfile,
  personal: PersonalConstants,
  scale = FINAL_DISPLAY_SCALE,
  poolSize = OPPONENT_POOL_SIZE,
  paths = LAB_PATHS,
  bandMode: BandGateMode = 'soft',
): { display: number; internal: number; spread: number } {
  const runs = Array.from({ length: paths }, (_, i) =>
    runSchedule(profile, personal, scale, poolSize, i, bandMode),
  )
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
  const displays = runs.map((r) => r.display)
  return {
    display: mean(displays),
    internal: mean(runs.map((r) => r.internal)),
    spread: Math.max(...displays) - Math.min(...displays),
  }
}
