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
import { BASELINE, confidenceFor, expectedScore, type PersonalConstants } from './engine.js'
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
export const FINAL_DISPLAY_SCALE = 3.5

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

export function finalDisplay(internal: number, games: number, scale = FINAL_DISPLAY_SCALE): number {
  return BASELINE + (internal - BASELINE) * confidenceFor(games) * scale
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
  const rng = new Rng(profile.games * 1000 + Math.round(profile.winRate * 1000))
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
    // 약팀 사냥 차단선 — 엔진(personalUpdate)과 같은 규칙을 쓴다
    if (personal.winGainCutoff !== undefined && won && expected >= personal.winGainCutoff) base = 0
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
    display: finalDisplay(internal, profile.games, scale),
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
