/**
 * 래더 상수 — **코드에 박지 않는다.**
 *
 * 여기 있는 값은 "기본값"이고, 근거는 `docs/LADDER_TUNING_REPORT.md`의 시뮬레이션이다.
 * 운영에서는 `RatingConfig` 행으로 덮어쓸 수 있어야 한다 (스펙 §0-6 · §7).
 *
 * ── 확정된 정책 (2026-08-22 사용자 승인, `docs/DECISIONS.md` D-057 ~ D-068)
 *   - division(1부/2부)을 **공식에 넣지 않는다.** 시즌 상태일 뿐이다
 *   - 동급 경기에서 점수가 계속 늘어나면 안 된다 (인플레이션 금지)
 *   - 약체 반복 사냥(양학)이 정상 경기보다 유리하면 안 된다
 *   - 업셋 보상은 유지한다
 *   - 새 시즌은 **모두 같은 출발점**에서 시작한다 (soft reset 폐기)
 */

/** 개인 래더 공식의 계보. 표본이 생겨 P-B와 재비교할 수 있게 이름에 남긴다 (D-058) */
export const PERSONAL_FORMULA_VERSION = 'sacloud-p1-PA'
export const CLAN_FORMULA_VERSION = 'sacloud-c1-teamelo'

export interface RatingConstants {
  /**
   * D — 기대승률 분모. 클수록 실력차 반영이 완만하다.
   *
   * 원본 관측은 **3400**이지만 SACLOUD는 **800**을 쓴다 (D-060).
   * 3400은 너무 평평해서 1,000점 차이가 나도 기대승률이 0.66에 그친다.
   * 그래서 약체 사냥이 끝없이 이득이 되고, 래더 폭이 관측치의 3배로 벌어졌다.
   * 시뮬레이션(`docs/LADDER_TUNING_REPORT.md`)에서 800이 실력 상관·신규 안착 속도·
   * 양학 마진 모두에서 가장 좋았다.
   */
  expectedScoreDivisor: number

  /* ── 개인 ── */
  /** K(R) = personalKBase - R / personalKSlope. 래더가 높을수록 변동이 작다 (원본 36.6 - R/200) */
  personalKBase: number
  personalKSlope: number
  /** K가 이 밑으로는 내려가지 않는다. 0이면 상위권이 아예 안 움직인다 */
  personalKFloor: number
  /**
   * 승리 배수. **1을 넘으면 시스템에 점수가 주입된다**(인플레이션).
   * 원본은 1부에 1.15를 썼지만 D-060에 따라 1.0으로 둔다
   */
  personalWinMultiplier: number

  /* ── 클랜 ── */
  /**
   * 클랜 Elo의 K.
   *
   * 관측된 클랜 래더는 개인보다 폭이 훨씬 좁다(987~1,840 vs 개인 3,432).
   * 시뮬레이션에서 K를 낮출수록 폭이 좁아지고 전력 상관은 그대로였다.
   * 16이 "폭은 좁히되 시즌 안에 수렴할 만큼은 움직인다"의 절충점이다.
   */
  clanK: number

  /* ── 양학 억제 (D-062) ── */
  /**
   * 이 점수 차까지는 보상을 깎지 않는다.
   *
   * **너무 이르게 깎으면 정직한 경기를 벌한다.** Elo는 원래 기대 승률대로 이기면
   * 장기 기댓값이 0이 되게 설계돼 있는데, 승리만 깎고 패배는 그대로 두면
   * "기대대로 이겼는데도 점수가 줄어드는" 구간이 생긴다.
   * 그 구간이 실제 리그에서 자주 나오는 격차(≤600)에 걸리지 않게 뒤로 물렸다 (D-069).
   */
  rewardCapStart: number
  /** 이 점수 차부터는 승리 보상이 0이다 */
  rewardCapFull: number
  /** 깎이지 않는 구간에서 승리는 최소 이만큼은 준다. **승리 증감은 음수가 되지 않는다** */
  minWinReward: number

  /* ── 반복 대전 감쇠 (D-063 · 기본값 꺼짐 — D-070) ── */
  /**
   * 같은 상대에게 **같은 결과**가 반복될 때 곱해지는 비율 (n번째 재대결 → decay^n).
   *
   * **기본값은 1(꺼짐)이다.** 측정해 보니 점수차 보상 감쇠(cap)만으로 farming이 이미 죽어서,
   * 반복 감쇠를 켜도 결과가 **한 점도 달라지지 않았다**(1800→1820, 켜도 꺼도 같음).
   * 반대로 SACLOUD의 정상적인 **멸망전**을 잘못 벌할 위험만 남는다.
   * 기능은 남겨 두되(격차 조건부) 기본값은 끈다. farming이 실제로 관측되면 설정으로 켠다.
   */
  repeatDecay: number
  /** 감쇠가 멈추는 하한. 0이면 반복 경기가 완전히 무의미해진다 */
  repeatDecayFloor: number
  /** 반복으로 볼 기간 (일) */
  repeatWindowDays: number
  /**
   * 이 점수 차를 **넘을 때만** 반복 감쇠를 적용한다 (D-070).
   *
   * SACLOUD에는 같은 두 클랜이 연달아 붙는 **멸망전** 문화가 있다. 실력이 비슷한 팀끼리의
   * 반복 대전은 정상적인 실력 검증이므로 깎지 않는다.
   * 큰 격차 상대를 반복해서 잡는 farming에만 걸린다.
   */
  repeatDecayMinGap: number

  /* ── 시즌 시작 (D-064 — 2026-08-22 정책 변경) ── */
  /**
   * 새 시즌의 **공통 출발점**.
   *
   * soft reset(이전 점수를 비율로 이월)은 **폐기했다**. 새 시즌에는 개인·클랜 모두
   * 이 값에서 똑같이 시작한다. 전 시즌 1위라고 높은 점수에서 시작하지 않는다.
   * 지난 시즌 점수는 **기록으로만** 남는다 (`LeaguePlayerSeason` 등은 건드리지 않는다).
   */
  seasonBaseline: number

  /* ── 라인업 전력 반영 (D-065) ── */
  /** 상대 클랜 래더와 상대 **실제 라인업** 평균을 섞는 비율. 0이면 반영하지 않는다 */
  lineupBlend: number
  /** 양측 확인 인원이 이 수 미만이면 라인업 전력을 **반영하지 않는다** */
  lineupMinConfirmed: number

  /**
   * 배치고사 경기 수 — 이 경기 수까지는 증감이 0이다.
   *
   * 원본의 정확한 판정 기준은 `[미확인]`이다(스펙 §3). 관측된 것은
   * "배치고사가 끝난 대상만 랭킹에 표시된다"는 사실뿐이라, 우리가 10으로 정했다.
   * 설정값이므로 실측이 나오면 바꾼다.
   */
  placementMatches: number

  /* ── 경기 인정 (D-079) ── */
  /**
   * 공식 경기 판정 기준 인원.
   *
   * **양 팀 중 한쪽이라도** 같은 클랜 본클랜원이 이 인원 이상이면 공식 경기다 (OR 조건).
   * 둘 다 미달이면 경기는 남기되 공식 통계에 반영하지 않는다(비공식 경기 — D-080).
   */
  minConfirmedPerSide: number

  /**
   * 본클랜원 수에 따른 **클랜 래더 반영률** (D-081).
   *
   * 자기 전력으로 얼마나 참가했는지를 클랜 점수에 반영한다.
   * 팀마다 **독립적으로** 적용되므로 한 경기의 클랜 증감 합이 0이 아닐 수 있다.
   * **개인 래더에는 적용하지 않는다** (D-082).
   */
  clanWeightByMembers: {
    /** 3명 이상 */
    full: number
    two: number
    one: number
    none: number
  }

  /** 시작 래더 */
  initialRating: number
  /** 래더 하한 — 음수로 내려가지 않는다 */
  ratingFloor: number
}

/**
 * 기본 상수.
 *
 * 값의 근거는 `docs/LADDER_TUNING_REPORT.md`. 임의로 고른 값이 아니라
 * 시나리오 13종을 후보 세트로 돌려 고른 것이다.
 */
export const DEFAULT_RATING_CONSTANTS: RatingConstants = {
  expectedScoreDivisor: 800,

  personalKBase: 36.6,
  personalKSlope: 200,
  personalKFloor: 8,
  personalWinMultiplier: 1,

  clanK: 16,

  rewardCapStart: 600,
  rewardCapFull: 1200,
  minWinReward: 1,

  repeatDecay: 1,
  repeatDecayFloor: 0.15,
  repeatWindowDays: 14,
  repeatDecayMinGap: 600,

  seasonBaseline: 1500,

  lineupBlend: 0.5,
  lineupMinConfirmed: 4,

  placementMatches: 10,

  minConfirmedPerSide: 3,
  clanWeightByMembers: { full: 1, two: 0.7, one: 0.4, none: 0 },

  initialRating: 1500,
  ratingFloor: 0,
}

/** 원본이 정수를 쓰므로 half-up으로 고정한다. 음수는 크기를 반올림한 뒤 부호를 붙인다 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
}
