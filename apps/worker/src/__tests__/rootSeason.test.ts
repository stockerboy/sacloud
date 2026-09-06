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
  /* ★2026-09-06 (Part 5) 추가★ — 시즌7 은 우리가 기간 고정 후 집계한 마감 카드다 */
  [7, -107],
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
  /*
   * ── ★2026-09-06 (Part 5) 정정★
   *   예전에는 근본 시즌이 전부 ★한 이름 「근본 시즌」★ 이었다 (Part 1).
   *   사장님이 ★시즌1 … 시즌7 로 구분해서 보이게★ 하라고 정하셨다 —
   *   > «기존 -101~-106 역시 ★내부번호가 아니라 원본 시즌 번호를 사용하여★
   *   >  시즌1~시즌6으로 구분할 수 있는 구조를 유지한다»
   *   > «화면에는 내부 번호 -107을 절대 노출하지 않고 ★「시즌7」★ 로 표시한다»
   *
   *   ★변하지 않은 것★ — 내부 번호(-101 …)는 여전히 ★한 글자도 안 나간다.★
   *   `근본 시즌` 은 이제 ★그 카드들이 모인 영역의 이름★ 이다 (`ROOT_SEASON_LABEL`).
   */
  it('★원본 시즌 번호로 보인다 — 내부 번호는 안 나간다★', () => {
    for (const [source, internal] of 사장님표) {
      const label = seasonDisplayLabel({ number: internal, seasonType: 'legacy' })
      expect(label).toBe(`시즌 ${source}`)
      /* ★내부 번호가 한 글자도 없어야 한다★ */
      expect(label).not.toContain(String(internal))
      expect(label).not.toContain('-')
    }
  })

  it('★영역 이름은 그대로 「근본 시즌」 이다★', () => {
    expect(ROOT_SEASON_LABEL).toBe('근본 시즌')
    expect(ROOT_SEASON_LABEL).not.toMatch(/\d/)
  })

  it('★CLI 표기도 같은 판단을 한다★ — 두 곳이 갈라지면 여기가 빨개진다', () => {
    for (const [source, internal] of 사장님표) {
      expect(seasonLabel({ number: internal, seasonType: 'legacy' })).toBe(`시즌 ${source}`)
    }
  })

  it('★우리 시즌은 Cloud 다★ (2026-09-06 · Part 5 · 사장님 지시)', () => {
    expect(seasonDisplayLabel({ number: 0, seasonType: 'official' })).toBe('Cloud 0')
    expect(seasonDisplayLabel({ number: 1, seasonType: 'official' })).toBe('Cloud 1')
    expect(seasonDisplayLabel({ number: 2, seasonType: 'official' })).toBe('Cloud 2')
    expect(seasonDisplayLabel({ number: -1, seasonType: 'beta' })).toBe('Beta')
  })

  it('★과거 카드와 우리 시즌이 절대 같은 이름이 될 수 없다★', () => {
    /* 이게 갈라져 있어야 「시즌7」과 「Cloud 7」이 헷갈리지 않는다 */
    const past = 사장님표.map(([source]) => `시즌 ${source}`)
    const ours = [0, 1, 2, 3, 7].map((n) =>
      seasonDisplayLabel({ number: n, seasonType: 'official' }),
    )
    for (const o of ours) expect(past).not.toContain(o)
    for (const o of ours) expect(o.startsWith('Cloud ')).toBe(true)
  })
})
