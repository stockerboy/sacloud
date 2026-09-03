/**
 * **`적진` 팔레트는 지금 몇 곳이 미달인가** — O-050 3단계 준비 (2026-09-03).
 *
 * ══ 왜 검사로 적어 두나 ══
 *
 * 「4.5 미만이 다섯 곳」이라는 말이 돌았는데 ★바탕을 어디로 잡았는지가 안 적혀 있었다.★
 * ★같은 실수를 세 번째로 하지 않으려고 바탕별로 다시 쟀다.★
 *
 * ★이 검사는 「고쳐라」가 아니다.★ ★지금이 어떤지를 숫자로 굳혀 두는 것★ 이다 —
 * 3단계에서 껍데기를 나머지 화면에 씌우면 ★이 숫자들이 통째로 좋아지는지★ 를
 * 그때 이 검사로 확인한다. ★기준선이 없으면 좋아졌는지도 모른다.★
 *
 * ⚠ ★사장님 「이 톤 맞다」 전에는 화면을 안 고친다.★ 이 파일도 화면을 안 고친다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8')
/** ★껍데기 블록은 뺀다★ — 거긴 시안 값이라 「적진 화면」이 아니다 */
const JEOKJIN = CSS.slice(0, CSS.indexOf('.sa-skin {'))

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(JEOKJIN)
  if (!m) throw new Error(`적진 토큰이 없다: --${name}`)
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
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('적진 — 히어로 띠 위 (★실제로 쓰이는 색만★)', () => {
  /*
   * ⚠ ★가능한 조합을 다 세면 과장이 된다.★ `LeagueTopBar.tsx:200` 의 `bg-hero` 안에서
   *   실제로 쓰는 글자색은 ★셋뿐★ 이다 — `text-hero-fg` · `text-hero-meta` · `text-meta`.
   */
  const HERO = '#4162c0'

  it('hero-fg 와 hero-meta 는 통과한다', () => {
    expect(contrast(token('color-hero-fg'), HERO)).toBeGreaterThanOrEqual(4.5) /* 5.63 */
    expect(contrast(token('color-hero-meta'), HERO)).toBeGreaterThanOrEqual(4.5) /* 4.77 */
  })

  it('★★그런데 `text-meta` 가 히어로 위에서 2.54:1 이다★★ — 실제로 그 안에서 쓰인다', () => {
    const c = contrast(token('color-meta'), HERO)
    expect(c).toBeLessThan(4.5)
    /* ★이 줄이 「지금 이렇다」를 굳힌다.★ 3단계에서 고치면 이 검사가 먼저 깨진다 */
    expect(c).toBeGreaterThan(2.4)
    expect(c).toBeLessThan(2.7)
  })
})

describe('적진 — 카드(#2c304c) 위 · ★제일 흔한 바탕★', () => {
  const CARD = '#2c304c'
  /** 카드 위에서 4.5 미만인 것들 — ★지금 값이다★ */
  const FAILING = [
    ['승률 3', 'color-rate-3'],
    ['입력 안내글', 'color-input-placeholder'],
    ['패 숫자', 'color-num-lose'],
    ['강조', 'color-accent'],
    ['승리 글자', 'color-win'],
    ['MVP', 'color-mvp'],
    ['더보기', 'color-more'],
    ['승률 낮음', 'color-rate-low'],
    ['승률 1', 'color-rate-1'],
    ['패배 글자', 'color-lose'],
    ['옅게', 'color-faint'],
    ['승률 2', 'color-rate-2'],
  ] as const

  it('★카드 위에서 미달인 것이 12곳이다★ — 「다섯 곳」이 아니다', () => {
    const bad = FAILING.filter(([, n]) => contrast(token(n), CARD) < 4.5)
    expect(bad).toHaveLength(12)
  })

  it('★제일 자주 보이는 숫자가 제일 나쁘다★ — 승리 글자 3.44:1', () => {
    /* `MatchCard` 의 승/패 글자와 래더 증감이 이 색이다 — 경기 목록에 줄마다 뜬다 */
    expect(contrast(token('color-win'), CARD)).toBeLessThan(3.5)
  })

  it('본문·제목·보조는 카드 위에서 통과한다 — ★글자 대부분은 멀쩡하다★', () => {
    for (const n of ['color-text', 'color-text-strong', 'color-meta']) {
      expect(contrast(token(n), CARD), n).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('★한 단 올린 면(card-2)이 제일 나쁘다★ — 시안이 그 면을 안 쓰는 이유', () => {
  const CARD2 = '#3a4067'

  it('card-2 위에서는 승 숫자까지 무너진다 (3.59:1)', () => {
    expect(contrast(token('color-num-win'), CARD2)).toBeLessThan(4.5)
  })

  it('★같은 색이 카드보다 card-2 에서 더 나쁘다★ — 면을 올릴수록 나빠진다', () => {
    for (const n of ['color-win', 'color-faint', 'color-rate-1']) {
      expect(contrast(token(n), CARD2), n).toBeLessThan(contrast(token(n), '#2c304c'))
    }
    /* ★시안 껍데기가 card-2 를 「올리지 않고 내린」 이유가 이것이다★ (`.sa-skin` 주석) */
  })
})

describe('★껍데기가 이미 고치는 것과 아직 안 고치는 것★', () => {
  const SKIN = CSS.slice(CSS.indexOf('.sa-skin {'))

  it('★껍데기가 다시 칠하는 것★ — 3단계에서 이것들은 저절로 해결된다', () => {
    for (const t of [
      '--color-accent',
      '--color-win',
      '--color-lose',
      '--color-faint',
      '--color-meta',
      '--color-more',
      '--color-mvp',
      '--color-rate-1',
      '--color-rate-2',
      '--color-rate-3',
      '--color-rate-low',
      '--color-num-win',
      '--color-num-lose',
    ]) {
      expect(SKIN, `${t} 가 껍데기에 없다`).toContain(t)
    }
  })

  it('⚠ ★껍데기가 아직 안 고치는 것★ — 3단계에서 이것들은 따로 손봐야 한다', () => {
    /* ★이 검사가 깨지면 그건 「고쳤다」는 뜻이다★ — 그때 목록에서 빼면 된다 */
    for (const t of ['--color-input-placeholder', '--color-hero-line']) {
      expect(SKIN, `${t} 가 이미 껍데기에 있다 — 목록을 고쳐라`).not.toContain(t)
    }
  })

  it('★히어로 띠는 껍데기 밖이다★ — 셸과 같은 취급이라 3단계 몫이다', () => {
    expect(SKIN).not.toContain('--color-hero:')
  })
})
