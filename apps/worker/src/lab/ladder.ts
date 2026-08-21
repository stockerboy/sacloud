/**
 * 래더 공식 **프로토타입** — Phase 9 조사용 sandbox.
 *
 * ⚠️ 이 폴더는 운영 코드가 아니다.
 *   - 여기서 계산한 값을 DB에 쓰지 않는다. import하는 운영 코드는 **없다**
 *   - 최종 공식은 **사용자 승인 전까지 production에 적용하지 않는다**
 *   - 목적은 `docs/LADDER_IMPLEMENTATION_SPEC.md` §3 "미확인" 항목을
 *     **숫자로 비교해서 사용자가 고를 수 있게** 만드는 것이다
 *
 * 새 공식을 발명하지 않는다 (`docs/POST_V1_REQUIREMENTS.md` 3장).
 * 3rd.supply 역추적 결과를 파라미터화해 재현하고, **해석이 갈리는 지점만** 후보로 만든다.
 *
 * ── 확정된 구조 (스펙 §1·§2)
 *   D  = 3400                    기대승률 분모
 *   E  = 1 / (1 + 10^((Ro - R) / D))
 *   Kw(R) = 36.6 - R / 200       승리 시 K
 *   패배 증감 = -(K_lose × E)     div1: 24 / div2: 30
 *   승리 증감 = Kw(R) × (1 - E) × winMultiplier   div1: 1.15 / div2: 1.00
 *   배치고사 경기의 증감 = 0
 *
 * ── 이 구조가 관측값과 맞는지 (스펙 §8의 회귀 항목)
 *   div1 동급 패배 : 24 × 0.5 = 12        → -12  ✓
 *   div2 동급 패배 : 30 × 0.5 = 15        → -15  ✓
 *   div1이 div2에게 패 : 24 × 0.6 × 0.5   → -7   ✓
 *   2단계 반올림이면 승리에서 +11 · +19가 **나올 수 없다**:
 *     round(9×1.15)=10 · round(10×1.15)=12  → 11 없음
 *     round(16×1.15)=18 · round(17×1.15)=20 → 19 없음  ✓
 *
 * ── 갈리는 지점 (스펙 §3 — 임의로 확정하지 않는다)
 *   교차 division 보정 `0.6`을 **어디에** 곱하는가:
 *     'k'     반올림 **전**에 K·배수에 곱한다
 *     'final' 동급과 똑같이 계산한 뒤 **최종 증감**에만 곱한다
 *     'both'  양쪽 모두에 곱한다
 *   세 해석이 같은 경기에서 서로 다른 정수를 만든다. 그 차이를 시뮬레이션으로 보여 준다.
 */

/** 교차 division 보정을 어디에 곱하는가 (스펙 §3 미확인 항목) */
export type CrossMode = 'k' | 'final' | 'both'

/** `RatingConfig` 모델과 같은 모양의 설정값. 코드에 상수를 박지 않는다 (스펙 §0-6) */
export interface LadderParams {
  /** D — 기대승률 분모 (관측 3400) */
  expectedScoreDivisor: number
  /** Kw(R) = winKBase - R / winKSlope (관측 36.6 - R/200) */
  winKBase: number
  winKSlope: number
  /** 패배 시 K (div1 24 / div2 30) */
  loseK: number
  /** 승리 배수 (div1 1.15 / div2 1.00) */
  winMultiplier: number
  /** div1이 div2를 상대할 때 0.6. **div2 측은 항상 1.0** (비대칭 — 스펙 §2) */
  crossDivisionMultiplier: number
  formulaVersion: string
}

export const DIV1_PARAMS: LadderParams = {
  expectedScoreDivisor: 3400,
  winKBase: 36.6,
  winKSlope: 200,
  loseK: 24,
  winMultiplier: 1.15,
  crossDivisionMultiplier: 1,
  formulaVersion: 'proto-div1',
}

export const DIV2_PARAMS: LadderParams = {
  ...DIV1_PARAMS,
  loseK: 30,
  winMultiplier: 1,
  formulaVersion: 'proto-div2',
}

/** 교차 division일 때 div1 측에만 적용되는 감쇠 (스펙 §2 — 비대칭) */
export const CROSS_DIVISION_DAMPING = 0.6

/** 원본이 정수를 쓰므로 half-up으로 고정한다. 음수는 크기를 반올림한 뒤 부호를 붙인다 */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5)
}

/** 기대 승률 — Elo와 같은 형태지만 분모가 400이 아니라 D(3400)다 */
export function expectedScore(
  ratingBefore: number,
  opponentAvgRating: number,
  divisor: number,
): number {
  return 1 / (1 + 10 ** ((opponentAvgRating - ratingBefore) / divisor))
}

/** 승리 시 K — 래더가 높을수록 작아진다. 음수까지 내려가지 않게 0에서 막는다 */
export function winK(ratingBefore: number, params: LadderParams): number {
  return Math.max(0, params.winKBase - ratingBefore / params.winKSlope)
}

export interface RatingUpdateInput {
  ratingBefore: number
  opponentAvgRating: number
  isWin: boolean
  /** 배치고사 경기는 증감이 0이다 (스펙 §1) */
  isPlacement?: boolean
  /** 이 선수가 div1이고 상대가 div2인가 — 그때만 감쇠한다 */
  crossDamping?: number
  params: LadderParams
  crossMode?: CrossMode
}

export interface RatingUpdateResult {
  ratingUpdate: number
  /** 재현용 기록 (스펙 §5) */
  expected: number
  kUsed: number
  multiplierUsed: number
}

/**
 * 한 선수 · 한 경기의 래더 증감.
 *
 * 입력 `R`은 **항상 통합 래더**다. 무기별 래더를 입력으로 쓰지 않는다 (스펙 §0-2).
 * kill/death/assist/MVP/데미지/연승은 들어오지 않는다 (스펙 §0-3).
 */
export function ratingUpdate(input: RatingUpdateInput): RatingUpdateResult {
  const { params } = input
  const cross = input.crossDamping ?? 1
  const mode: CrossMode = input.crossMode ?? 'k'
  const expected = expectedScore(
    input.ratingBefore,
    input.opponentAvgRating,
    params.expectedScoreDivisor,
  )

  if (input.isPlacement) {
    return { ratingUpdate: 0, expected, kUsed: 0, multiplierUsed: 0 }
  }

  if (input.isWin) {
    const k = winK(input.ratingBefore, params)
    const base = k * (1 - expected)

    // 2단계 반올림 구조 — 이것이 +11 · +19를 만들지 않는 이유다 (스펙 §8)
    const value =
      mode === 'k'
        ? roundHalfUp(roundHalfUp(base) * (params.winMultiplier * cross))
        : mode === 'final'
          ? roundHalfUp(roundHalfUp(roundHalfUp(base) * params.winMultiplier) * cross)
          : roundHalfUp(
              roundHalfUp(roundHalfUp(base) * (params.winMultiplier * cross)) * cross,
            )

    return { ratingUpdate: value, expected, kUsed: k, multiplierUsed: params.winMultiplier * cross }
  }

  const base = params.loseK * expected
  const magnitude =
    mode === 'k'
      ? roundHalfUp(base * cross)
      : mode === 'final'
        ? roundHalfUp(roundHalfUp(base) * cross)
        : roundHalfUp(roundHalfUp(base * cross) * cross)

  return {
    ratingUpdate: -magnitude,
    expected,
    kUsed: params.loseK * (mode === 'final' ? 1 : cross),
    multiplierUsed: cross,
  }
}

/**
 * 경기 시점 division 조합 → 그 선수에게 적용할 설정.
 *
 * **현재 division을 쓰지 않는다. 경기 당시 스냅샷을 쓴다** (스펙 §0-4).
 * 보정은 비대칭이다 — div1 측만 감쇠되고 div2 측은 그대로다 (스펙 §2).
 */
export function paramsForMatch(input: {
  playerDivision: number
  opponentDivision: number
  div1: LadderParams
  div2: LadderParams
  damping: number
}): { params: LadderParams; crossDamping: number } {
  const params = input.playerDivision === 1 ? input.div1 : input.div2
  const crossDamping =
    input.playerDivision === 1 && input.opponentDivision !== 1 ? input.damping : 1
  return { params, crossDamping }
}

/* --------------------------------------------------------- 무기별 분리 --- */

/**
 * 무기별 분리 (스펙 §6 · POST_V1 3장).
 *
 * 공식은 하나다. **계산된 값을 기록만 나눈다.**
 * 통합 = base + sniperDelta + rifleDelta 가 항상 성립해야 한다.
 */
export interface WeaponSplit {
  baseRating: number
  sniperDelta: number
  rifleDelta: number
}

export function applyWeaponDelta(
  split: WeaponSplit,
  weapon: 'sniper' | 'rifle',
  update: number,
): WeaponSplit {
  return weapon === 'sniper'
    ? { ...split, sniperDelta: split.sniperDelta + update }
    : { ...split, rifleDelta: split.rifleDelta + update }
}

export function combinedRating(split: WeaponSplit): number {
  return split.baseRating + split.sniperDelta + split.rifleDelta
}
