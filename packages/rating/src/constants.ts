/**
 * 래더 상수 — **코드에 박지 않는다.**
 *
 * 사양은 `docs/RATING_FINAL_SPEC.md` (D-145 FINAL LOCK) 이고,
 * 근거는 `scripts/rating-simulation` 의 시뮬레이션이다.
 * 운영에서는 `RatingConfig` 행으로 덮어쓸 수 있어야 한다.
 *
 * ── D-145 에서 확정된 정책
 *   - 기준점 3000 · K=50 고정 · **제로섬**
 *   - KD / MVP / 데미지 / 헤드샷은 **점수에 들어가지 않는다**
 *   - 상대 강도는 승리의 값어치를 정할 뿐, **패배의 면죄부가 아니다**
 *     → 표시 점수에 밴드별 최소 승률 자격선을 둔다
 *   - 정상 5v5 는 **전부** 래더 대상이다. official/unofficial 게이트를 쓰지 않는다
 *   - 판수 자체는 보너스가 아니다 (신뢰도는 150경기에서 멈춘다)
 */

/** D-145 최종 공식. 이전 결과(`sacloud-p1-PA`)와 구분하기 위해 이름을 바꾼다 */
export const PERSONAL_FORMULA_VERSION = 'sacloud-d145'
export const CLAN_FORMULA_VERSION = 'sacloud-d145'
/** 개인·클랜이 같은 공식을 쓴다. 저장·조회용 단일 이름 */
export const FORMULA_VERSION = 'sacloud-d145'

/** 신뢰도가 100% 가 되는 경기 수. 이 뒤로는 판수가 점수를 더 주지 않는다 */
export const CONFIDENCE_FULL_AT = 150

export interface SuppressionRange {
  /** 이 이하로 예상된 결과는 그대로 반영한다 */
  full: number
  /** 이 이상으로 예상된 결과는 반영하지 않는다 */
  zero: number
}

export interface WinRateBand {
  /** 이 표시 점수 이상에 오르려면 */
  minDisplay: number
  /** 최소 이만큼의 시즌 승률이 필요하다 (0~1) */
  minWinRate: number
}

export interface DecayTier {
  /** 감점 전 표시 점수가 이 값 이상이면 */
  minDisplay: number
  /** 이 일수까지는 깎지 않는다 */
  graceDays: number
  /** 유예 이후 주당 감점 */
  weekly: number
}

export interface RatingConstants {
  /**
   * D — 기대승률 분모.
   *
   * D-145 는 표준 Elo 와 같은 **400** 을 쓴다. 시뮬레이션 전체가 400 기준으로 검증됐다.
   * (이전 운영값은 800 이었다 — D-060. D-145 에서 400 으로 되돌린다.)
   */
  expectedScoreDivisor: number

  /* ── 내부 Elo ── */
  /** 개인 K. **고정값이다** — 점수에 따라 변하지 않는다 */
  personalK: number
  /** 클랜 K. 개인과 같다 */
  clanK: number
  /** 기준점 — 신규·시즌 시작 점수 */
  initialRating: number
  /** 새 시즌 공통 출발점 (soft reset 폐기 — D-064) */
  seasonBaseline: number
  /** 내부 Elo 하한 */
  ratingFloor: number

  /**
   * **일방적인 경기 억제** (D-143 도입 · D-145 에서 끝점 0.88 → 0.86).
   *
   * 예상대로 끝난 일방적인 경기는 **양쪽 모두** 조금만 움직인다.
   * 이변(약한 쪽의 승리)은 언제나 만점으로 반영된다 —
   * "강한 상대를 실제로 이긴 것" 이 가장 크게 평가돼야 하기 때문이다.
   */
  suppression: SuppressionRange

  /* ── 표시 점수 ── */
  /** 내부 편차를 표시 점수로 늘리는 배율 */
  displayScale: number
  /** 신뢰도 100% 가 되는 경기 수 */
  confidenceFullAt: number

  /** 랭커 승률 자격선 — 표시 점수에만 적용한다. 내부 Elo 는 건드리지 않는다 */
  winRateBands: readonly WinRateBand[]
  /** 자격 미달일 때 부족한 승률 1%p 당 추가로 내리는 점수 */
  winRateShortfallPenalty: number

  /* ── 미참여 ── */
  /** 개인 활동 페널티 구간 (표시 점수 기준) */
  decayTiers: readonly DecayTier[]
  /** 개인 — 래더 대상 경기 1판당 회복하는 페널티 */
  decayRecoveryPerGame: number
  /** 클랜 — 무경기 일수별 주당 감점 */
  clanDecayTiers: readonly { minIdleDays: number; weekly: number }[]
  /** 클랜 — 경기 1판당 회복 */
  clanDecayRecoveryPerGame: number

  /* ── 클랜 구성 보정 ── */
  /** 평균 본클랜원 수 → 보정 점수 곡선 (상한까지 비례로 늘린다) */
  compositionCurve: readonly (readonly [number, number])[]
  /** 구성 보정 상한 */
  compositionCap: number
  /** 최근 몇 경기의 평균 본클랜원 수를 쓰는가 */
  compositionWindow: number

  /**
   * 배치고사 경기 수 — 이 경기 수까지는 증감이 0이다.
   *
   * 원본의 정확한 판정 기준은 `[미확인]` 이라 우리가 10으로 정했다.
   */
  placementMatches: number
}

export const DEFAULT_RATING_CONSTANTS: RatingConstants = {
  expectedScoreDivisor: 400,

  personalK: 50,
  clanK: 50,
  initialRating: 3000,
  seasonBaseline: 3000,
  ratingFloor: 1000,

  suppression: { full: 0.8, zero: 0.86 },

  displayScale: 3.5,
  confidenceFullAt: CONFIDENCE_FULL_AT,

  winRateBands: [
    { minDisplay: 4000, minWinRate: 0.48 },
    { minDisplay: 4300, minWinRate: 0.5 },
    { minDisplay: 4500, minWinRate: 0.52 },
    { minDisplay: 4700, minWinRate: 0.55 },
    { minDisplay: 4800, minWinRate: 0.58 },
    { minDisplay: 4900, minWinRate: 0.6 },
  ],
  winRateShortfallPenalty: 20,

  decayTiers: [
    { minDisplay: 4900, graceDays: 7, weekly: 60 },
    { minDisplay: 4800, graceDays: 7, weekly: 50 },
    { minDisplay: 4600, graceDays: 7, weekly: 40 },
    { minDisplay: 4300, graceDays: 7, weekly: 30 },
    { minDisplay: 4000, graceDays: 10, weekly: 20 },
  ],
  decayRecoveryPerGame: 8,

  clanDecayTiers: [
    { minIdleDays: 21, weekly: 30 },
    { minIdleDays: 14, weekly: 20 },
    { minIdleDays: 7, weekly: 10 },
  ],
  clanDecayRecoveryPerGame: 5,

  compositionCurve: [
    [1, 0],
    [2, 20],
    [3, 40],
    [4, 70],
    [5, 100],
  ],
  compositionCap: 50,
  compositionWindow: 20,

  placementMatches: 10,
}

/** 원본이 정수를 쓰므로 half-up으로 고정한다. 음수는 크기를 반올림한 뒤 부호를 붙인다 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
}

/* ========================================================================== */
/* 시즌 종류별 예외                                                             */
/* ========================================================================== */

/**
 * 시즌 종류에 따른 정책 스위치 (D-112).
 *
 * 기본 배치고사 정책(10경기)은 **정식 시즌의 규칙이고 그대로 남는다.**
 * 여기서 바꾸는 것은 공개 Beta 한 시즌뿐이다.
 */
export interface SeasonPolicyFlags {
  /** Beta — 1경기부터 래더를 계산한다 (배치고사 0경기) */
  betaImmediateRating?: boolean
}

export const DEFAULT_SEASON_POLICY: SeasonPolicyFlags = {
  betaImmediateRating: true,
}

/**
 * 시즌 종류에 맞춘 상수를 만든다.
 *
 * Beta + `betaImmediateRating` 일 때만 `placementMatches`를 0으로 내린다.
 */
export function constantsForSeason(
  base: RatingConstants,
  season: { seasonType: string } | null | undefined,
  flags: SeasonPolicyFlags = DEFAULT_SEASON_POLICY,
): RatingConstants {
  if (season?.seasonType !== 'beta') return base
  if (!flags.betaImmediateRating) return base
  return { ...base, placementMatches: 0 }
}
