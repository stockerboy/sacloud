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

/*
 * ⚠ ★2026-09-10 — 팔레트를 남색으로 갈아탔다★ (사장님 지시).
 *   그래서 아래 숫자들이 통째로 달라졌다. ★색을 여기 적지 않고 토큰에서 읽는다★ —
 *   다음에 팔레트가 또 바뀌어도 이 파일을 고칠 필요가 없다.
 *
 *   옛 값(적진/3톤): 카드 #2c304c · card-2 #3a4067 · 히어로 #4162c0
 *   그때는 카드 위에서 12곳이 4.5 미만이었고 `text-meta` 가 히어로 위 2.54:1 이었다.
 *   ★새 팔레트는 그 문제를 대부분 없앴다★ — 아래가 그 증거다.
 */
describe('남색 팔레트 — 히어로 띠 위', () => {
  const HERO = token('color-hero')

  it('hero-fg 와 hero-meta 는 통과한다', () => {
    expect(contrast(token('color-hero-fg'), HERO)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('color-hero-meta'), HERO)).toBeGreaterThanOrEqual(4.5)
  })

  it('★옛 팔레트의 「히어로 위 text-meta 2.54:1」 문제가 사라졌다★', () => {
    /* 옛 값에서는 2.54 였다. 지금은 6 을 넘는다 — 남색 띠가 어두워서다 */
    expect(contrast(token('color-meta'), HERO)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('남색 팔레트 — 카드 위 · ★제일 흔한 바탕★', () => {
  const CARD = token('color-card')

  /** 옛 팔레트에서 카드 위 4.5 미만이던 것들 — 지금은 대부분 통과한다 */
  const WATCHED = [
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

  it('★카드 위에서 미달인 것이 하나뿐이다★ — 옛 팔레트에서는 열두 곳이었다', () => {
    const bad = WATCHED.filter(([, n]) => contrast(token(n), CARD) < 4.5)
    expect(bad.map(([, n]) => n)).toEqual(['color-faint'])
  })

  it('★`color-faint` 는 여전히 미달이다★ — 뜻을 가진 라벨에 쓰지 마라 (D-233)', () => {
    expect(contrast(token('color-faint'), CARD)).toBeLessThan(4.5)
  })

  it('본문·제목·보조는 카드 위에서 통과한다', () => {
    for (const n of ['color-text', 'color-text-strong', 'color-meta']) {
      expect(contrast(token(n), CARD), n).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('★점수에 쓰는 강조색(청록)이 잘 읽힌다★ — 옛 파랑은 카드 위에서 미달이었다', () => {
    expect(contrast(token('color-accent'), CARD)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('★한 단 올린 면(card-2)★', () => {
  const CARD = token('color-card')
  const CARD2 = token('color-card-2')

  it('★같은 색이 카드보다 card-2 에서 더 나쁘다★ — 면을 올릴수록 나빠진다', () => {
    for (const n of ['color-win', 'color-faint', 'color-rate-1']) {
      expect(contrast(token(n), CARD2), n).toBeLessThan(contrast(token(n), CARD))
    }
  })

  it('★그래도 card-2 위에서 승 숫자는 통과한다★ — 옛 팔레트에서는 3.59:1 이었다', () => {
    expect(contrast(token('color-num-win'), CARD2)).toBeGreaterThanOrEqual(4.5)
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
