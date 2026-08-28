/**
 * 3rd.supply 선수 프로필 적재 규칙 회귀 (D-161).
 *
 * 여기서 고정하는 것은 **"모르면 지어내지 않는다"** 하나다.
 * 원본 `position` 은 숫자 코드이고, 우리가 원본 화면에서 확인한 표기는 코드 `3` 하나뿐이다.
 * 표를 넓히려면 **원본 화면을 보고** 넓혀야 한다 — 이 테스트가 그 경계를 지킨다.
 */
import { describe, expect, it } from 'vitest'
import {
  SUPPLY_POSITION_LABELS,
  supplyPositionLabel,
  type SupplyPlayerProfileClan,
  type SupplyPlayerProfileInput,
} from '../supplyPlayerProfiles'

describe('supplyPositionLabel', () => {
  it('원본 화면에서 확인한 코드만 표기를 준다', () => {
    /* 선수 `Yolloanswag`(position=3)의 원본 상세정보에 `A 숏` 이 떴다 (2026-08-28) */
    expect(supplyPositionLabel(3)).toBe('A 숏')
  })

  it('표기를 모르는 코드는 null 이다 — 그럴듯한 이름을 만들지 않는다', () => {
    /* 존재는 확인했지만 뭐라고 부르는지 못 봤다. `[미확인]` 이다 */
    for (const code of [0, 1, 2, 4, 5, 6]) {
      expect(supplyPositionLabel(code)).toBeNull()
    }
  })

  it('코드 0 을 falsy 로 버리지 않는다', () => {
    /* `0` 은 유효한 코드다. `if (!code)` 로 걸러 내면 그 선수의 값이 조용히 사라진다.
       지금은 표기를 몰라 null 이지만, 그것은 "값이 없다" 가 아니라 "이름을 모른다" 다 */
    expect(Object.prototype.hasOwnProperty.call(SUPPLY_POSITION_LABELS, 0)).toBe(false)
    expect(supplyPositionLabel(0)).toBeNull()
  })

  it('값이 없으면 null 이다', () => {
    expect(supplyPositionLabel(null)).toBeNull()
    expect(supplyPositionLabel(undefined)).toBeNull()
  })

  it('숫자가 아닌 값이 들어와도 무너지지 않는다', () => {
    expect(supplyPositionLabel(Number.NaN)).toBeNull()
    expect(supplyPositionLabel(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('표는 얼려 둔다 — 실행 중에 몰래 늘어나면 안 된다', () => {
    expect(Object.isFrozen(SUPPLY_POSITION_LABELS)).toBe(true)
  })
})

/**
 * 닉네임·소속 적재 규칙 (D-162).
 *
 * DB 를 건드리지 않고 **입력 모양**만 고정한다. 실제 쓰기 경로는
 * `apps/web/tests/playerProfileIdentity.test.ts` 가 실데이터로 본다.
 */
describe('SupplyPlayerProfileInput', () => {
  it('클랜 값은 원본이 준 다섯 칸을 그대로 담는다 — 없는 칸을 만들지 않는다', () => {
    /* 실측 응답 (선수 huwho, 2026-08-28) */
    const clan: SupplyPlayerProfileClan = {
      sourceClanId: '1898',
      name: 'VaIiant',
      slug: 'BFAKFAKF',
      markBgUrl: 'https://static.3rd.supply/marks/NTEvMF8xM18wMTU.png',
      markFrontUrl: 'https://static.3rd.supply/marks/NTEvMV8yMV8yMTA.png',
    }
    const row: SupplyPlayerProfileInput = {
      playerId: '1561236212',
      name: 'huwho',
      position: null,
      note: null,
      renewedAt: '2026-08-27 01:20:16',
      clan,
    }
    /* 마크는 **반드시** 함께 간다. 비면 화면이 우리 fallback 마크를 그린다 (D-146) */
    expect(row.clan?.markBgUrl).toBeTruthy()
    expect(row.clan?.markFrontUrl).toBeTruthy()
    /* 클랜 id 는 문자열로 보존한다 — `Clan.sourceClanId` 가 String? 다 */
    expect(row.clan?.sourceClanId).toBe('1898')
    /* 원본이 지금 쓰는 닉네임. 우리 행에는 옛 이름(`후후시치`)이 들어 있었다 */
    expect(row.name).toBe('huwho')
  })

  it('무소속은 clan 이 null 이다 — 빈 객체를 만들지 않는다', () => {
    const row: SupplyPlayerProfileInput = {
      playerId: '1896093983',
      name: 'Yolloanswag',
      position: 3,
      note: null,
      renewedAt: '2026-08-05 06:53:00',
      clan: null,
    }
    expect(row.clan).toBeNull()
  })
})
