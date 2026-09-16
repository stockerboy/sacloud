/**
 * ★마크 색으로 카드를 꾸민다★ (2026-09-17 사장님) — 순수 함수만 고정한다.
 *
 * 화면 모양은 테스트하지 않는다. 고정하는 것은 셋이다.
 *   ① 마크에 없는 색을 만들지 않는다
 *   ② 어두운 카드에서 사라지는 색만 끌어올린다
 *   ③ 「어느 색이 그 클랜인가」는 무채색이 아니라 유채색이다
 */
import { describe, expect, it } from 'vitest'
import { CLAN_MARK_PALETTES } from '../v3/clanMarkPalette'
import { brightnessOf, markAccentOf, markColorsOf, markRailOf, onDark, rgbOf } from '../v3/clanMarkColors'

describe('마크 색 표', () => {
  it('값은 전부 #rrggbb 이고 클랜마다 1~3색이다', () => {
    const rows = Object.entries(CLAN_MARK_PALETTES)
    expect(rows.length).toBeGreaterThan(300)
    for (const [slug, cols] of rows) {
      expect(cols.length, slug).toBeGreaterThanOrEqual(1)
      expect(cols.length, slug).toBeLessThanOrEqual(3)
      for (const c of cols) expect(rgbOf(c), `${slug} ${c}`).not.toBeNull()
    }
  })

  it('사장님이 든 보기 — 디럭스는 검·흰 두 색이다', () => {
    const cols = CLAN_MARK_PALETTES['deluxe']
    expect(cols).toBeDefined()
    expect(cols?.length).toBe(2)
    /* 하나는 아주 어둡고 하나는 아주 밝다 */
    const bs = (cols ?? []).map(brightnessOf).sort((a, b) => a - b)
    expect(bs[0]).toBeLessThan(0.15)
    expect(bs[bs.length - 1]).toBeGreaterThan(0.85)
  })
})

describe('어두운 카드 위에서', () => {
  it('검정은 끌어올리고 이미 밝은 색은 손대지 않는다', () => {
    expect(onDark('#000000')).not.toBe('#000000')
    expect(brightnessOf(onDark('#000000'))).toBeGreaterThan(0.2)
    expect(onDark('#f3f3f3')).toBe('#f3f3f3')
    expect(onDark('#408bbc')).toBe('#408bbc')
  })

  it('색상(hue)은 바꾸지 않는다 — 파란 마크가 초록이 되지 않는다', () => {
    const up = rgbOf(onDark('#001133'))
    expect(up).not.toBeNull()
    if (up !== null) expect(up[2]).toBeGreaterThan(up[0])
  })
})

describe('띠와 강조색', () => {
  it('마크를 모르는 클랜은 아무것도 주지 않는다 — 지금 모습 그대로 떨어진다', () => {
    expect(markRailOf('없는클랜')).toBeNull()
    expect(markAccentOf(null)).toBeNull()
    expect(markColorsOf(undefined)).toEqual([])
  })

  it('색이 둘 이상이면 가로 그라데이션이다', () => {
    const rail = markRailOf('deluxe')
    expect(rail).toMatch(/^linear-gradient\(90deg, /)
    expect(rail).toContain('0%')
    expect(rail).toContain('100%')
  })

  it('강조색은 무채색보다 유채색을 앞세운다', () => {
    /* 베리타스 마크는 파랑·검정·흰색이다. 「흰 클랜」이 아니라 「파란 클랜」이다 */
    const accent = markAccentOf('veritasclan')
    expect(accent).not.toBeNull()
    const rgb = rgbOf(accent ?? '#000000')
    expect(rgb).not.toBeNull()
    if (rgb !== null) expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(30)
  })

  it('유채색이 하나도 없으면 가장 밝은 색을 쓴다 — 디럭스는 흰쪽이다', () => {
    const accent = markAccentOf('deluxe')
    expect(accent).not.toBeNull()
    expect(brightnessOf(accent ?? '#000000')).toBeGreaterThan(0.5)
  })
})
