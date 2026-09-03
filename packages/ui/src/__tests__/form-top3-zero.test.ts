/**
 * **폼 TOP3 가 「0점 셋」을 보여 주면 안 된다** (2026-09-04 · D-278).
 *
 * 폰으로 IPL 랭킹을 찍어 보니 ★1·2·3등이 나란히 「0점 (7경기)」★ 였다.
 * ★7경기를 뛰고 0점일 수는 있어도, 세 명이 나란히 0점일 수는 없다.★
 * 진짜 이유는 ★경기 단위 래더 증감이 거의 안 채워져 있어서★ 다.
 *
 * ★없는 것을 0 으로 그리면 거짓말이다.★ 같은 화면의 경기 카드는 ★「알수없음」★ 이라 적는다 —
 * ★한 화면에서 한쪽만 0 으로 그리면 안 된다.★
 *
 * ⚠ ★이 검사는 화면을 그려 보지 않는다★ — 컴포넌트 파일에 그 규칙이 있는지 본다.
 *   ★그려 보는 검사를 새로 들이는 것보다, 규칙이 코드에 있는지 확인하는 편이 싸고 확실하다.★
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'league', 'FormTop3.tsx'),
  'utf8',
)

describe('폼 TOP3 · 증감이 전부 0 이면', () => {
  it('★그리지 않는다★', () => {
    expect(SRC).toContain('form.rows.every((row) => row.rating_delta === 0)')
    expect(SRC).toMatch(/form\.rows\.every\(\(row\) => row\.rating_delta === 0\)\) return null/)
  })

  it('★왜 그러는지가 파일에 적혀 있다★ — 다음 사람이 되돌리지 않게', () => {
    expect(SRC).toContain('D-278')
    expect(SRC).toContain('거짓말')
  })

  it('★기능을 지운 것이 아니다★ — 값이 채워지면 다시 나온다는 것이 적혀 있다', () => {
    expect(SRC).toContain('저절로 다시 나온다')
  })

  /* 원래 있던 「없으면 안 그린다」 규칙도 그대로여야 한다 */
  it('행이 없으면 원래대로 안 그린다', () => {
    expect(SRC).toContain('form.rows.length === 0) return null')
  })
})
