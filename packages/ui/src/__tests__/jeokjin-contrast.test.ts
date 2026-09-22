/**
 * **팔레트는 지금 몇 곳이 미달인가** — O-050 3단계 준비 (2026-09-03).
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
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ ★2026-09-22 정정 — 이 검사는 값을 「주석에서」 읽고 있었다★
 *
 *   `styles.css` 맨 앞에는 ★옛 팔레트를 적어 둔 큰 주석★ 이 있다 (`CLAUDE.md` 1-4 가
 *   지우지 말라고 한 그 기록이다). 거기에도 `--color-page: #050810` · `--color-card: #0b1225`
 *   처럼 ★토큰처럼 생긴 줄★ 이 들어 있다. 아래 `token()` 은 ★파일에서 처음 만나는★ 것을
 *   집었기 때문에, 진짜 값(`@theme { … }`)이 아니라 ★주석 속 옛 값★ 을 읽어 왔다.
 *
 *   그래서 숫자가 뒤섞였다 — 카드는 주석 속 남색(#0b1225)인데 `color-text-strong` 은
 *   주석에 없어서 진짜 값(#05070d, 흰바탕용 검정)을 읽었다. 둘을 나란히 재니
 *   ★1.08:1★ 이라는 있지도 않은 숫자가 나왔다. ★화면은 그렇지 않았다.★
 *
 *   고친 것 — `token()` 이 ★주석을 걷어낸 뒤★ 읽는다. 아래 숫자는 전부
 *   ★`@theme` 에 실제로 실린 값★ 으로 다시 잰 것이다.
 *
 * ⚠ ★그러고 나니 진짜 문제가 드러났다★ — 「서플라이 투톤」(9/22 낮)이 카드를 흰색으로
 *   뒤집으면서 ★뜻을 가진 색 열두 개가 전부 어두운 바탕 시절 값 그대로 남았다.★
 *   흰 카드 위에서 열두 개가 모두 4.5 미만이다. 옛 적진 팔레트와 ★똑같은 개수★ 다.
 *   이 파일은 그 숫자를 굳혀 둘 뿐이고, ★색을 고치는 것은 따로 할 일★ 이다
 *   (`docs/ORDERS.md` 의 「흰 카드에 흰 글자」 칸).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8')
/** ★껍데기 블록은 뺀다★ — 거긴 시안 값이라 「본 화면」이 아니다 */
const JEOKJIN = CSS.slice(0, CSS.indexOf('.sa-skin {'))
/**
 * ★주석을 걷는다★ (2026-09-22) — 위 ⚠ 를 보라. 주석 안의 옛 값을 토큰으로 읽으면
 * 있지도 않은 숫자가 나온다. 주석 자체는 ★지우지 않는다★ (`CLAUDE.md` 1-4) —
 * 여기서 안 읽을 뿐이다.
 */
const DECLARED = JEOKJIN.replace(/\/\*[\s\S]*?\*\//g, '')

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(DECLARED)
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
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/*
 * ⚠ ★2026-09-10 — 팔레트를 남색으로 갈아탔다★ (사장님 지시).
 *   옛 값(적진/3톤): 카드 #2c304c · card-2 #3a4067 · 히어로 #4162c0
 *   그때는 카드 위에서 12곳이 4.5 미만이었고 `text-meta` 가 히어로 위 2.54:1 이었다.
 *
 * ⚠ ★2026-09-22 — 「서플라이 투톤」 으로 또 갈아탔다★ (사장님).
 *   지금 값: 카드 ★#ffffff★ · card-2 #e5e7ec · 페이지 #e9ebef · 히어로 #101a2c
 *   ★색을 여기 적지 않고 토큰에서 읽는다★ — 또 바뀌어도 이 파일은 안 고쳐도 된다.
 */
describe('팔레트 — 히어로 띠 위', () => {
  const HERO = token('color-hero')

  it('hero-fg 와 hero-meta 는 통과한다', () => {
    /* #ffffff 17.41:1 · #e8ecfb 14.78:1 — 띠가 짙은 남색(#101a2c)이라 넉넉하다 */
    expect(contrast(token('color-hero-fg'), HERO)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('color-hero-meta'), HERO)).toBeGreaterThanOrEqual(4.5)
  })

  /*
   * ⚠ ★2026-09-22 정정★ — 옛 이름은 「히어로 위 text-meta 2.54:1 문제가 사라졌다」 였다.
   *   남색 팔레트에서는 정말 사라졌었다. 그런데 「서플라이 투톤」 이 `color-meta` 를
   *   ★흰 바탕용 회색(#5c6479)★ 으로 바꾸면서 ★짙은 히어로 띠 위에서 다시 미달★ 이 됐다.
   *   지금 2.95:1 이다. 띠 위에는 `color-hero-meta`(14.78:1)를 써야 한다.
   *
   *   ★이 검사가 깨지면 그건 「고쳤다」는 뜻이다★ — 그때 이 칸을 통과 쪽으로 되돌린다.
   *   (`color-faint` · 껍데기 목록이 쓰는 것과 같은 방식이다)
   */
  it('⚠ ★히어로 띠 위 `color-meta` 가 다시 미달이다★ — 흰 바탕 전환이 되살렸다', () => {
    expect(contrast(token('color-meta'), HERO)).toBeLessThan(4.5)
  })
})

describe('팔레트 — 카드 위 · ★제일 흔한 바탕★', () => {
  const CARD = token('color-card')

  /** 뜻을 가진 색들 — 카드 위에서 잰다 */
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

  /*
   * ⚠ ★2026-09-22 — 여기가 이 파일에서 제일 중요한 줄이다★
   *
   *   옛 이름: 「카드 위에서 미달인 것이 하나뿐이다 — 옛 팔레트에서는 열두 곳이었다」
   *   그 「하나뿐」 은 ★주석 속 남색 카드(#0b1225)★ 를 바탕으로 잰 숫자였다. 지금 진짜
   *   바탕은 ★흰색(#ffffff)★ 이고, 그 위에서는 ★열두 개가 전부 미달★ 이다:
   *
   *   ```
   *   승률 3      #2185d0  3.94      승리 글자  #5c80e0  3.74
   *   패 숫자     #ef4444  3.76      MVP        #5c80e0  3.74
   *   승률 낮음   #ff3d3d  3.51      강조       #5b8dff  3.13
   *   더보기      #5b8dff  3.13      승률 1     #02ab18  3.07
   *   패배 글자   #f26a6a  2.98      승률 2     #f2711c  2.94
   *   옅게        #96a0b5  2.63      입력 안내글 #96a0b5  2.63
   *   ```
   *
   *   ★색을 고치는 것은 이 파일의 일이 아니다★ — 사장님이 톤을 정하신 뒤에 한다
   *   (`docs/ORDERS.md` 「흰 카드에 흰 글자」). 여기서는 ★숫자를 굳혀 둔다.★
   *   ★한 개라도 고쳐지면 이 검사가 깨진다★ — 그때 목록에서 빼면 된다.
   */
  it('⚠ ★카드 위에서 열두 개가 모두 미달이다★ — 흰 바탕 전환이 되살렸다', () => {
    const bad = WATCHED.filter(([, n]) => contrast(token(n), CARD) < 4.5)
    expect(bad.map(([, n]) => n)).toEqual(WATCHED.map(([, n]) => n))
  })

  it('★`color-faint` 는 여전히 미달이다★ — 뜻을 가진 라벨에 쓰지 마라 (D-233)', () => {
    expect(contrast(token('color-faint'), CARD)).toBeLessThan(4.5)
  })

  /** ★글자는 멀쩡하다★ — 본문 15.84:1 · 제목 20.14:1 · 보조 5.91:1 */
  it('본문·제목·보조는 카드 위에서 통과한다', () => {
    for (const n of ['color-text', 'color-text-strong', 'color-meta']) {
      expect(contrast(token(n), CARD), n).toBeGreaterThanOrEqual(4.5)
    }
  })

  /*
   * ⚠ ★2026-09-22 정정★ — 옛 이름은 「점수에 쓰는 강조색(청록)이 잘 읽힌다」 였다.
   *   그 청록(#22e0ff)은 ★주석 속 옛 값★ 이었고, 진짜 강조색은 ★파랑 #5b8dff★ 다.
   *   흰 카드 위에서 3.13:1 이다 — 큰 글자에는 쓰되 ★작은 글자에는 쓰지 마라.★
   */
  it('⚠ ★강조색이 카드 위에서 미달이다★ — 작은 글자에 쓰지 마라', () => {
    expect(contrast(token('color-accent'), CARD)).toBeLessThan(4.5)
  })
})

describe('★한 단 올린 면(card-2)★', () => {
  const CARD = token('color-card')
  const CARD2 = token('color-card-2')

  /* 흰 카드에서도 같다 — card-2(#e5e7ec)가 카드(#ffffff)보다 어두워서 대비가 준다 */
  it('★같은 색이 카드보다 card-2 에서 더 나쁘다★ — 면을 올릴수록 나빠진다', () => {
    for (const n of ['color-win', 'color-faint', 'color-rate-1']) {
      expect(contrast(token(n), CARD2), n).toBeLessThan(contrast(token(n), CARD))
    }
  })

  /*
   * ⚠ ★2026-09-22 정정★ — 옛 이름은 「그래도 card-2 위에서 승 숫자는 통과한다」 였다.
   *   그때 잰 것은 주석 속 옛 값이었다. 진짜 `color-num-win` 은 ★#0ea5e9★ 이고
   *   흰 카드 위 2.77:1 · card-2 위 ★2.24:1★ 이다. ★둘 다 미달★ 이다.
   */
  it('⚠ ★card-2 위에서 승 숫자가 미달이다★ — 카드 위에서도 2.77:1 이다', () => {
    expect(contrast(token('color-num-win'), CARD2)).toBeLessThan(4.5)
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
