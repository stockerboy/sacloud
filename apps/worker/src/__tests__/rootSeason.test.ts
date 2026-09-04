/**
 * ★★근본 시즌★★ (2026-09-04 · Part 1 · 사장님 지시).
 *
 * > «원본 시즌 1~6은 SACLOUD 현재/미래 시즌 번호와 충돌하지 않도록 별도 내부 번호로 저장»
 * > «내부 번호는 ★화면에 노출하지 않는다★»
 *
 * ── ★여기서 고정하는 것★
 * ```
 * 1 원본 1~6 → 내부 -101~-106  (사장님이 정하신 값 그대로)
 * 2 ★우리 시즌 번호와 절대 안 겹친다★ (-2 · -1 · 0 · 1 · 7 · 그리고 앞으로의 2,3,4…)
 * 3 화면 표기가 ★언제나 「근본 시즌」★ 이다 — 번호가 새면 안 된다
 * 4 ★라벨을 만드는 곳이 두 군데다★ (contract=화면 · db/ops=CLI). 둘이 같아야 한다
 * 5 왕복해도 값이 안 변한다 (원본→내부→원본)
 * ```
 *
 * ── ★4번이 왜 테스트인가★
 *   `packages/db` 는 `packages/contract` 에 의존하지 않는다. 그래서 기준점(-100)이
 *   ★두 곳에 각각 적혀 있다.★ 값이 두 곳에 있으면 ★반드시 갈라진다★ —
 *   이 저장소는 그 함정에 이미 여러 번 빠졌다 (시즌 경계 · 색 · 동결 기준시각).
 *   ★갈라지는 순간을 잡는 것이 이 파일이다.★
 */
import { describe, expect, it } from 'vitest'
import {
  ROOT_SEASON_BASE,
  ROOT_SEASON_LABEL,
  isRootSeason,
  rootSeasonNumber,
  seasonDisplayLabel,
  sourceSeasonNumber,
} from '@sacloud/contract'
import { seasonLabel } from '@sacloud/db/ops'

/** 사장님이 못박으신 표. 값을 바꾸려면 여기부터 바꿔야 한다 */
const 사장님표: ReadonlyArray<[number, number]> = [
  [1, -101],
  [2, -102],
  [3, -103],
  [4, -104],
  [5, -105],
  [6, -106],
]

describe('원본 시즌 → 내부 번호', () => {
  it('★사장님이 정하신 값 그대로다★', () => {
    for (const [source, internal] of 사장님표) {
      expect(rootSeasonNumber(source)).toBe(internal)
    }
  })

  it('왕복해도 안 변한다 (원본 → 내부 → 원본)', () => {
    for (const [source, internal] of 사장님표) {
      expect(sourceSeasonNumber(internal)).toBe(source)
    }
  })

  it('기준점은 -100 이다', () => {
    expect(ROOT_SEASON_BASE).toBe(-100)
  })
})

describe('우리 시즌 번호와 안 겹친다', () => {
  /* 운영 supply 리그에 실제로 있는 번호 + 앞으로 쓸 번호 */
  const 우리번호 = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 100]

  it('★우리 번호는 하나도 근본 시즌이 아니다★', () => {
    for (const n of 우리번호) {
      expect(isRootSeason(n), `번호 ${n}`).toBe(false)
    }
  })

  it('★근본 시즌 번호는 우리 번호와 하나도 안 겹친다★', () => {
    const root = 사장님표.map(([, internal]) => internal)
    for (const r of root) {
      expect(우리번호).not.toContain(r)
      expect(isRootSeason(r), `번호 ${r}`).toBe(true)
    }
  })

  it('★원본 시즌1(294장)이 우리 시즌1 자리를 안 뺏는다★ — 이 판을 멈추게 한 바로 그것', () => {
    expect(rootSeasonNumber(1)).not.toBe(1)
    expect(isRootSeason(1)).toBe(false)
    expect(isRootSeason(rootSeasonNumber(1))).toBe(true)
  })
})

describe('★내부 번호가 화면에 새지 않는다★', () => {
  it('화면 표기는 언제나 「근본 시즌」 이다', () => {
    for (const [, internal] of 사장님표) {
      const label = seasonDisplayLabel({ number: internal, seasonType: 'legacy' })
      expect(label).toBe(ROOT_SEASON_LABEL)
      expect(label).toBe('근본 시즌')
      /* ★숫자가 한 글자도 없어야 한다★ */
      expect(label).not.toMatch(/\d/)
      expect(label).not.toContain('-')
    }
  })

  it('★CLI 표기도 같은 판단을 한다★ — 두 곳이 갈라지면 여기가 빨개진다', () => {
    for (const [, internal] of 사장님표) {
      expect(seasonLabel({ number: internal, seasonType: 'legacy' })).toBe(ROOT_SEASON_LABEL)
    }
  })

  it('우리 시즌 표기는 그대로다 — 근본 시즌 규칙이 남을 건드리지 않는다', () => {
    expect(seasonDisplayLabel({ number: 0, seasonType: 'official' })).toBe('시즌 0')
    expect(seasonDisplayLabel({ number: 1, seasonType: 'official' })).toBe('시즌 1')
    expect(seasonDisplayLabel({ number: 7, seasonType: 'official' })).toBe('시즌 7')
    expect(seasonDisplayLabel({ number: -1, seasonType: 'beta' })).toBe('Beta')
    /* 우리 legacy 시즌(-2)은 근본 시즌이 아니다 — 그것도 번호가 보여야 한다 */
    expect(seasonDisplayLabel({ number: -2, seasonType: 'legacy' })).toBe('시즌 -2')
  })
})
