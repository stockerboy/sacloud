/**
 * **주간 그래프 빨간 선이 카드 위에서 보이나** (2026-09-04 사장님 지시 「선은 빨간색」).
 *
 * ══ ★왜 재나★ ══
 *
 * 색을 바꿀 때마다 ★「예쁜가」로 골랐다가 화면에서 안 보이는 일★ 이 반복됐다.
 * ★대비는 「무엇 위에 놓였느냐」와 함께 재야 뜻이 있다★ (`sa-contrast.test.ts` 와 같은 처방).
 * 주간 그래프 선이 놓이는 바탕은 ★카드(`--color-card`)★ 다. 셸도 히어로도 아니다.
 *
 * ══ ★기준을 3.0 으로 잡은 이유★ ══
 *
 * ★선은 글자가 아니다.★ WCAG 는 ★글자 아닌 것★ 에 ★3:1★ 을 요구한다 (1.4.11).
 * 옛 선 색들이 ★3.26 · 4.19 · 4.38★ 이었으니 ★그 아래로 내리지 않는다★ 를 함께 건다.
 *
 * ⚠ ★이 파일은 화면을 안 고친다.★ 숫자를 굳혀 둘 뿐이다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CSS = readFileSync(join(HERE, '..', 'styles.css'), 'utf8')
const CARD_SRC = readFileSync(join(HERE, '..', 'record', 'WeeklyTrendCard.tsx'), 'utf8')

/** 껍데기 블록은 뺀다 — 거긴 시안 값이다 */
const JEOKJIN = CSS.slice(0, CSS.indexOf('.sa-skin {'))

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(JEOKJIN)
  if (!m) throw new Error(`토큰이 없다: --${name}`)
  return m[1]!
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function contrast(fg: string, bg: string): number {
  const lum = (h: string): number => {
    const n = Number.parseInt(h.slice(1), 16)
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    )
  }
  const a = lum(fg)
  const b = lum(bg)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

/** 사장님 지시로 정한 빨강 셋 — ★값이 바뀌면 이 검사가 잡는다★ */
const REDS = {
  승률: '#ff5f5f',
  '라플 킬뎃': '#ff8a6b',
  '스나 킬뎃': '#ffb3a7',
} as const

/** 글자 아닌 것의 WCAG 기준 */
const NON_TEXT_MIN = 3.0
/** 옛 선 색 중 제일 낮았던 값 (파랑 3.26) — ★그 아래로 안 내린다★ */
const OLD_WORST = 3.26

describe('주간 그래프 빨간 선 · 카드 위 대비', () => {
  const card = token('color-card')

  it('카드 바탕을 실제 토큰에서 읽는다 — ★값을 코드에 박지 않는다★', () => {
    expect(card).toMatch(/^#[0-9a-f]{6}$/i)
  })

  for (const [label, hex] of Object.entries(REDS)) {
    it(`★${label} ${hex}★ 가 카드 위에서 ${NON_TEXT_MIN} 이상이다`, () => {
      const r = contrast(hex, card)
      expect(r, `${label} ${hex} 가 ${card} 위에서 ${r.toFixed(2)}:1 이다`).toBeGreaterThanOrEqual(
        NON_TEXT_MIN,
      )
    })

    it(`★${label}★ 이 옛 선 색 중 제일 낮았던 ${OLD_WORST} 보다 낮지 않다`, () => {
      expect(contrast(hex, card)).toBeGreaterThanOrEqual(OLD_WORST)
    })
  }

  it('★셋이 서로 구분된다★ — 밝기가 겹치면 어느 선인지 못 읽는다', () => {
    const values = Object.values(REDS).map((h) => contrast(h, card))
    values.sort((a, b) => a - b)
    for (let i = 1; i < values.length; i += 1) {
      expect(
        values[i]! - values[i - 1]!,
        `대비가 ${values[i - 1]!.toFixed(2)} 과 ${values[i]!.toFixed(2)} 로 너무 가깝다`,
      ).toBeGreaterThan(0.5)
    }
  })

  it('★카드가 실제로 이 색들을 쓴다★ — 검사만 통과하고 화면은 딴 색인 일을 막는다', () => {
    for (const hex of Object.values(REDS)) {
      expect(CARD_SRC, `${hex} 를 카드가 안 쓴다`).toContain(hex)
    }
  })

  it('★옛 색(파랑·주황·초록)은 지우지 않았다★ (`CLAUDE.md` 1-4)', () => {
    expect(CARD_SRC).toContain('COLOR_V1')
    expect(CARD_SRC).toContain('--color-rate-3')
  })

  it('★순위 선은 빨강이 아니다★ — 축이 다르다는 표시라 회색 점선 그대로다', () => {
    expect(CARD_SRC).toMatch(/rank:\s*'var\(--color-text\)'/)
  })
})
