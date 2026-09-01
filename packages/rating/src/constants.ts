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

/* ========================================================================== */
/* 배치고사 (placement)                                                        */
/* ========================================================================== */

/**
 * **옛 방식 — 배치고사 10경기.** 지우지 않는다 (`CLAUDE.md` 10-4).
 *
 * `DEFAULT_RATING_CONSTANTS` 는 이 값을 그대로 쓴다. 과거 결과를 다시 재려면 이쪽이다.
 */
export const PLACEMENT_MATCHES_V1 = 10

/**
 * **현재 방식 — 배치고사 폐지** (2026-09-01 사장님 지시).
 *
 * > "배치고사 모드 삭제 배치고사 없이 바로 시작점수부터 1판하자마자 바로바로 시작"
 *
 * 1판만 뛰면 그 경기부터 증감이 붙고 바로 랭킹에 나온다.
 * 「배치고사 중이면 랭킹 미표시」 규칙도 함께 사라진다.
 *
 * ⚠ `LeaguePlayer.placement` **컬럼과 플래그는 그대로 산다.** 뜻만 바뀐다 —
 *   예전: "배치고사 진행중(10판 미만)"   지금: "이 창에 경기가 0판"
 *   `placement` 는 이미 **랭킹 모집단 제외** 용도로도 쓰이고 있어서
 *   (`db/ops/supplyRollup.ts` 의 `UNRANKED_CLAN_WRITE`,
 *    `worker/jobs/rate.ts` · `season0Apply.ts` 의 미참여자 되돌리기)
 *   플래그를 없애면 그쪽이 함께 무너진다. 그래서 **판정 기준값만 0 으로 내린다.**
 *   조회 계층의 `placement: false` 필터는 전부 그대로 둔다 — 0판을 랭킹에 넣을 이유는 없다.
 */
export const PLACEMENT_MATCHES = 0

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

/**
 * v2 스위치 (D-172) — **없으면 D-145 그대로 동작한다.**
 *
 * 두 시스템을 같은 코드로 나란히 돌려 실데이터로 비교하기 위한 것이다.
 * 공식을 복제한 별도 시뮬레이터를 만들지 않는다 — 복제하면 언젠가 갈라진다.
 */
export interface RatingV2Flags {
  /**
   * 개인 기대승률을 **팀 평균 대 팀 평균**으로 계산하고, 그 경기의 증감을
   * 10명에게 **똑같이** 나눈다.
   *
   * D-145 는 "내 개인점수 vs 상대팀 평균" 이라, 강한 팀에 얹혀 간 약한 선수가
   * 같은 승리로 더 많이 받는다. 실력순 랭킹을 흐리는 가장 큰 원인이다.
   */
  teamExpectation?: boolean
  /** 일방적 경기 억제를 쓰지 않는다 — "이겼는데 0점" 을 없앤다 */
  disableSuppression?: boolean
  /** 표시 점수에 신뢰도를 곱하지 않는다 — 판수가 순위를 올리지 못하게 한다 */
  disableDisplayConfidence?: boolean
  /** 승률 자격선을 쓰지 않는다 (억제를 빼면 필요 없어진다) */
  disableWinRateBands?: boolean
  /**
   * 판수 구간별 개인 K. 큰 `minGames` 부터 찾아 첫 번째로 맞는 것을 쓴다.
   * 신입은 빨리 제자리를 찾고, 자리 잡은 선수는 천천히 움직인다.
   */
  personalKByGames?: { minGames: number; k: number }[]
  /**
   * **미참여 감점을 기준점까지 끌어내리는 기간** (일). 사장님 지시 (D-173).
   *
   * "최근 한 달 동안 게임을 안 했으면 거의 기본점수로 내려간다."
   * `decayGraceDays` 까지는 깎지 않고, 그 뒤 이 날짜에 정확히 기준점(3000)에 닿는다.
   * 구간(4000↑)만 깎던 `decayTiers` 를 대체한다 — 점수대와 무관하게 전원 적용된다.
   */
  decayToBaselineDays?: number
  /** 이 날까지는 깎지 않는다 */
  decayGraceDays?: number
  /**
   * 복귀 후 감점이 대부분 사라지는 데 걸리는 경기 수.
   *
   * 경기마다 남은 감점의 `1/n` 을 덜어 낸다. 고정값(경기당 8점)으로는
   * 최대 1,900점짜리 감점을 237판 뛰어야 지울 수 있어 영구 낙인이 된다.
   * "한 판 던지고 초기화" 는 여전히 막는다 — 한 판에 다 사라지지 않는다.
   */
  decayRecoveryGames?: number
  /**
   * 그 경기에 나간 **본클랜원 수**로 클랜 증감에 곱하는 가중치.
   * `[인원, 가중치]` 오름차순. 사이 값은 계단으로 본다.
   *
   * 고용주 1명 + 용병 4명으로 이겨도 점수를 다 받지 않게 하는 장치다.
   * **개인 점수에는 적용하지 않는다** — 용병으로 뛰어도 잘하면 잘하는 것이다.
   */
  clanCompositionWeight?: [number, number][]
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

  /** v2 스위치. 없으면 D-145 그대로다 */
  v2?: RatingV2Flags
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

  /* 옛 방식(10경기)을 그대로 둔다. 배치고사 폐지는 `V2_RATING_CONSTANTS` 쪽이다 —
     `DEFAULT` 를 바꾸면 아직 이 상수를 쓰는 IPL 클랜 집계(`lib/iplClanStanding.ts`)까지
     같이 움직인다. 그건 별건으로 다룬다 */
  placementMatches: PLACEMENT_MATCHES_V1,
}

/**
 * v2 후보 상수 (D-172) — 사장님 확정 요구사항을 반영한 것.
 *
 *   · 개인·클랜 모두 실력순이 최우선   → 팀 대 팀 기대승률 · 판수 인플레 제거
 *   · 미참여 감점은 반드시 유지        → `decayTiers` 그대로 둔다
 *   · 본클랜원이 많을수록 높은 점수     → `clanCompositionWeight`
 *
 * 값은 **아직 확정이 아니다.** 실데이터 백테스트로 검증한 뒤 정한다.
 */
export const V2_RATING_CONSTANTS: RatingConstants = {
  ...DEFAULT_RATING_CONSTANTS,
  /* 가산점 방식 구성 보정은 끈다 — 곱하는 방식으로 대체한다 */
  compositionCap: 0,
  /* **배치고사 폐지** (2026-09-01). 1판부터 바로 증감이 붙고 바로 랭킹에 나온다.
     옛 값은 `PLACEMENT_MATCHES_V1` 에 그대로 있다 (`CLAUDE.md` 10-4) */
  placementMatches: PLACEMENT_MATCHES,
  v2: {
    teamExpectation: true,
    disableSuppression: true,
    disableDisplayConfidence: true,
    disableWinRateBands: true,
    personalKByGames: [
      { minGames: 0, k: 40 },
      { minGames: 30, k: 28 },
      { minGames: 100, k: 20 },
    ],
    clanCompositionWeight: [
      [1, 0.3],
      [2, 0.55],
      [3, 0.75],
      [4, 0.9],
      [5, 1],
    ],
    decayGraceDays: 7,
    decayToBaselineDays: 30,
    decayRecoveryGames: 5,
  },
}

/** 판수 구간별 K. 없으면 고정 K 를 쓴다 */
export function personalKFor(games: number, constants: RatingConstants): number {
  const table = constants.v2?.personalKByGames
  if (!table || table.length === 0) return constants.personalK
  let k = constants.personalK
  for (const row of [...table].sort((a, b) => a.minGames - b.minGames)) {
    if (games >= row.minGames) k = row.k
  }
  return k
}

/** 그 경기에 나간 본클랜원 수 → 클랜 증감에 곱할 가중치. 없으면 1 */
export function clanCompositionWeight(members: number, constants: RatingConstants): number {
  const curve = constants.v2?.clanCompositionWeight
  if (!curve || curve.length === 0) return 1
  const sorted = [...curve].sort((a, b) => a[0] - b[0])
  let weight = sorted[0]![1]
  for (const [count, value] of sorted) {
    if (members >= count) weight = value
  }
  return weight
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
