import { describe, expect, it } from 'vitest'
import { halfLabelOf } from '../v3/MvpWhy'

/**
 * ★MVP 설명의 전반/후반★ (2026-09-20 사장님)
 *
 * > 「mvp설명에 들어가는 라운드에는 ★전반1라운드 후반12라운드★ 이런식으로
 * >  전반전인지 후반전인지 써줘」
 *
 * `secondHalfFrom` 이 8 이면 ★1~7이 전반, 8부터 후반★ 이다.
 */
describe('전반/후반 표시', () => {
  it('★전반 라운드만 있으면 「전반」★', () => {
    expect(halfLabelOf([1, 5, 7], 8)).toBe('전반')
  })

  it('★후반 라운드만 있으면 「후반」★', () => {
    expect(halfLabelOf([8, 12], 8)).toBe('후반')
  })

  it('★경계가 맞다★ — `from` 라운드 자체는 후반이다', () => {
    expect(halfLabelOf([8], 8)).toBe('후반')
    expect(halfLabelOf([7], 8)).toBe('전반')
  })

  it('★한 줄에 전·후반이 섞이면 안 적는다★ — 「전반 5,12라운드」 는 거짓이다', () => {
    expect(halfLabelOf([5, 12], 8)).toBeNull()
  })

  it('★모르면 안 적는다★ (D-106)', () => {
    expect(halfLabelOf([1, 2], null)).toBeNull()
  })

  it('라운드가 없으면 안 적는다', () => {
    expect(halfLabelOf([], 8)).toBeNull()
  })
})
