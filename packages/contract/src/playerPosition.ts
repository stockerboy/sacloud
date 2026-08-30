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
  if (judged) return { code: judged, label: POSITION_LABEL[judged], source: 'coords' }

  return NONE
}
