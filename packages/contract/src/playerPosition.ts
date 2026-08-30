/**
 * 선수의 **포지션** — 4개 중 하나 (D-199 · 사용자 확정).
 *
 * ```
 * 스나수 · 2F · B리베 · 숏포지
 * ```
 *
 * 한 팀의 구성은 **숏 1 · 2층 1 · 스나 1 · B리베 2** 로 고정이다.
 * 그래서 `B리베` 만 팀당 두 명이다.
 *
 * ── 이건 "그 판에 무슨 총을 들었나" 가 **아니다**
 *   포지션은 그 선수의 **고유 자리**이고, 경기마다 바뀌지 않는다.
 *   그 판에 실제로 스나를 들었는지는 따로 `(S)` 로 적는다 —
 *   사용자 지시: **"스나수가 무조건 스나를 드는것만은 아니야"**.
 *
 * ── 누가 이기나
 *   ```
 *   1. 선수가 직접 등록/수정한 값     ← 언제나 이긴다
 *   2. 주무기가 스나면 `스나수`
 *   3. 좌표로 판정한 자리 (2F · B리베 · 숏포지)
 *   4. 아무것도 없으면 비운다 — 지어내지 않는다 (D-106)
 *   ```
 *   자동 판정이 사람을 덮어쓰지 않는다. "바꿔달라" 는 요청도 같은 취급이다.
 */

/**
 * 좌표 판정을 **믿을 최소 격차** — 1등과 2등 닮음의 차이(`margin`).
 *
 * ── 왜 필요한가 (2026-08-30 실측)
 *   사용자가 "이 사람 2층인데 왜 숏이냐" 고 지적했고, 그 선수를 까 보니
 *   `숏 0.9398 · 2층 0.8215 · B 0.7052` 로 **margin 이 0.118** 이었다.
 *   전체 517명 중 하위 17% 에 드는 값이다 (중앙값 0.282).
 *
 *   그리고 이건 우연이 아니다 — 사양 2절이 이미 경고했다:
 *   **"2층은 A 의 위층이라 미니맵 x/y 가 겹친다. 좌표만으로는 2층과 숏을 못 가른다."**
 *   정답 23명 검증에서 틀린 2명도 **둘 다 숏으로** 잘못 갔다.
 *   즉 판정기는 헷갈릴 때 숏 쪽으로 쏠린다.
 *
 * ── 그래서 애매하면 **비운다**
 *   틀린 포지션을 적는 것보다 빈칸이 낫다 (D-106). 화면은 그 줄을 아예 안 그린다.
 *
 * > `[미확인]` 0.17 은 실측 분포의 **하위 25%** 지점이다. 우리가 고른 값이고
 * > 원본과 무관하다. 정답 표본이 늘면 다시 재서 정해야 한다.
 */
export const POSITION_MIN_MARGIN = 0.17

/** 저장 코드. 좌표 판정기(`packages/nexon/src/position.ts`)가 쓰는 값과 같다 */
export type PositionCode = 'SNIPER' | '2F' | 'B' | 'SHORT'

/** 화면에 그대로 쓰는 표기 (사용자가 적어 준 그대로다) */
export const POSITION_LABEL: Record<PositionCode, string> = {
  SNIPER: '스나수',
  '2F': '2F',
  B: 'B리베',
  SHORT: '숏포지',
}

/** 그 포지션이 한 팀에 몇 명인가. **`B리베` 만 둘이다** (D-199) */
export const POSITION_TEAM_SLOTS: Record<PositionCode, number> = {
  SNIPER: 1,
  '2F': 1,
  B: 2,
  SHORT: 1,
}

/** 판정이 어디서 왔나 — 화면이 "사람이 정한 값" 임을 밝힐 수 있게 남긴다 */
export type PositionSource = 'user' | 'weapon' | 'coords'

export interface ResolvedPosition {
  code: PositionCode | null
  /** 화면에 그대로 쓰는 글자. 사람이 정한 값이면 **그 글자 그대로** 나간다 */
  label: string | null
  source: PositionSource | null
}

const NONE: ResolvedPosition = { code: null, label: null, source: null }

/** 좌표 판정기가 준 값이 우리가 아는 코드인가 */
function toCode(value: string | null | undefined): PositionCode | null {
  if (value === '2F' || value === 'B' || value === 'SHORT' || value === 'SNIPER') return value
  return null
}

/**
 * 화면에 적을 포지션 하나를 고른다.
 *
 * `userSet` 은 **그 글자 그대로** 내보낸다. 사람이 적은 말을 우리 표기로 고쳐 쓰지 않는다.
 */
export function resolvePlayerPositionOf(input: {
  /** 선수가 직접 등록/수정한 값 */
  userSet?: string | null
  /** 주무기 (`0` 라이플 · `1` 스나이퍼). 반반이거나 모르면 `null` */
  mainWeapon?: 0 | 1 | null
  /** 좌표로 판정한 자리 (`2F` · `B` · `SHORT`) */
  judged?: string | null
  /** 그 판정의 1등·2등 격차. `POSITION_MIN_MARGIN` 미만이면 **쓰지 않는다** */
  judgedMargin?: number | null
}): ResolvedPosition {
  const userSet = input.userSet?.trim()
  if (userSet) {
    /* 사람이 우리 코드로 적었으면 우리 표기로 보여주고, 아니면 적은 그대로 둔다 */
    const code = toCode(userSet)
    return { code, label: code ? POSITION_LABEL[code] : userSet, source: 'user' }
  }

  /* 스나수는 좌표가 아니라 **무기**로 정해진다 (D-199).
     스나는 서는 자리가 달라서 좌표 판정에서도 아예 빼 놓았다 (사양 3절) */
  if (input.mainWeapon === 1) {
    return { code: 'SNIPER', label: POSITION_LABEL.SNIPER, source: 'weapon' }
  }

  const judged = toCode(input.judged)
  /* 격차가 좁으면 그 판정을 쓰지 않는다 — 2층과 숏이 좌표상 겹치기 때문이다.
     `judgedMargin` 을 안 넘기면(모르면) 예전처럼 그대로 쓴다 */
  const marginOk =
    input.judgedMargin === undefined ||
    input.judgedMargin === null ||
    input.judgedMargin >= POSITION_MIN_MARGIN
  if (judged && marginOk) return { code: judged, label: POSITION_LABEL[judged], source: 'coords' }

  return NONE
}
