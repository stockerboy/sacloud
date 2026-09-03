/**
 * **시안 톤 대비 — ★바탕별로★ 잰다** (O-050 · 2026-09-03).
 *
 * ══ 왜 검사로 굳히나 ══
 *
 * ★우리가 O-041 에 직접 박은 규칙★ — «4.5:1 미만이면 정체성이 아니라 결함이다».
 * 그런데 시안을 만들면서 ★17곳 중 다섯이 미달★ 이었다. 사장님 «톤을 낮춰라» 를
 * ★글자를 어둡게★ 로 읽은 탓이다. 그건 ★금속 면이 번들거린다★ 는 뜻이었다.
 *
 * ══ ★★그리고 한 번 더 놓쳤다 — 바탕이 하나가 아니었다★★ ══
 *
 * 고친 뒤에도 ★바탕을 `#131515` 하나로만 재서★ 두 자리를 통째로 놓쳤다.
 * ```
 * 리그 탭 꺼진 글자  패널 위 6.61:1 ✓ 인데  ★자기 바탕(#282d30) 위 4.49:1 ✗★
 * 그래프판(#3c4142)  ★아예 안 쟀다★ — K/D 선이 ★1.38:1★ 이었다
 * ```
 * → ★「글자냐 아니냐」가 아니라 「무엇 위에 놓였느냐」다.★
 *   그래서 이 검사는 ★색을 그것이 실제로 놓이는 바탕과 짝지어★ 잰다.
 *
 * ══ 기준 ══
 * ```
 * 글자          4.5:1
 * 선·표시(비글자) 3:1
 * ```
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8')

/** `styles.css` 에서 토큰 값을 읽는다 — ★검사가 진짜 파일을 본다★ */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS)
  if (!m) throw new Error(`토큰이 없다: --${name}`)
  return m[1]!
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 상대 휘도 */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** 패널 안 — 대부분의 글자가 여기 얹힌다 */
const PANEL = '#131515'
/** 탭·맨윗줄 칸의 면 (꺼짐) */
const TAB_OFF = '#282d30'
/** 켜진 리그 탭의 면 */
const TAB_ON = '#31373a'
/** 무기 서브탭 (꺼짐 / 켜짐) */
const SUB_OFF = '#232829'
const SUB_ON = '#2e3437'

/** [무엇, 색(토큰이면 이름), 놓이는 바탕, 글자인가] */
const SPOTS: readonly [string, string, string, boolean][] = [
  ['라벨', token('color-sa-label'), PANEL, true],
  ['값', token('color-sa-val'), PANEL, true],
  ['보조 숫자', token('color-sa-dim'), PANEL, true],
  ['안내문·맵이름', token('color-sa-faint'), PANEL, true],
  ['노랑 — 순위', token('color-sa-yellow'), PANEL, true],
  ['빨강 — 래더', token('color-sa-red'), PANEL, true],
  ['주황 — 승률', token('color-sa-orange'), PANEL, true],
  ['파랑 — 킬뎃', token('color-sa-blue'), PANEL, true],
  ['경기 승', token('color-sa-win'), PANEL, true],
  ['경기 패', token('color-sa-lose'), PANEL, true],
  ['맨윗줄 칸', token('color-sa-top'), TAB_OFF, true],
  ['★리그탭 꺼짐 — 자기 바탕 위★', token('color-sa-tab-idle'), TAB_OFF, true],
  ['리그탭 켜짐', token('color-sa-tab-on'), TAB_ON, true],
  ['무기탭 꺼짐', token('color-sa-sub-idle'), SUB_OFF, true],
  ['무기탭 켜짐', token('color-sa-sub-on'), SUB_ON, true],
  /* ↓ 비글자 — 3:1 */
  ['★그래프 K/D 선★', token('color-sa-red'), token('color-sa-graph-bg'), false],
  ['그래프 승률 선', token('color-sa-blue'), token('color-sa-graph-bg'), false],
  ['그래프 격자', token('color-sa-graph-grid'), token('color-sa-graph-bg'), false],
  ['무기탭 켜짐 밑줄', token('color-sa-sub-mark'), SUB_ON, false],
]

describe('시안 톤 대비 — 바탕별 (O-050)', () => {
  it('★패널 바탕은 #131515★ — 대부분의 글자가 여기 얹힌다', () => {
    expect(token('color-sa-in').toLowerCase()).toBe(PANEL)
  })

  it('★★그래프판도 같은 어두운 바탕이다★★ — 시안의 밝은 판(#3c4142)에서 바꾼 유일한 자리', () => {
    expect(token('color-sa-graph-bg').toLowerCase()).toBe(PANEL)
  })

  for (const [what, fg, bg, isText] of SPOTS) {
    const need = isText ? 4.5 : 3
    it(`${what} — ${isText ? '글자 4.5' : '비글자 3'}:1 이상`, () => {
      const c = contrast(fg, bg)
      expect(c, `${fg} 이 ${bg} 위에서 ${c.toFixed(2)}:1 (기준 ${need})`).toBeGreaterThanOrEqual(
        need,
      )
    })
  }
})

describe('★왜 이 값들을 안 쓰는지 — 숫자로 남긴다★', () => {
  it('★그래프판을 밝게 두면 길이 없다★ — 순검정을 써도 2.03:1', () => {
    /* A 가 놓친 자리. #3c4142 는 중간 밝기라 ★색만 바꿔서는 못 고친다★ */
    expect(contrast('#98302f', '#3c4142')).toBeLessThan(3) /* 시안 K/D 선 1.38:1 */
    expect(contrast('#8b8f8a', '#3c4142')).toBeLessThan(4.5) /* 시안 축 라벨 3.15:1 */
    expect(contrast('#000000', '#3c4142')).toBeLessThan(4.5) /* ★한계 2.03:1★ */
  })

  it('★시안 리그탭 꺼짐 #8d9491 은 자기 바탕 위에서 4.49:1★ — 패널 위로 재면 통과로 보인다', () => {
    expect(contrast('#8d9491', TAB_OFF)).toBeLessThan(4.5)
    expect(contrast('#8d9491', PANEL)).toBeGreaterThan(4.5) /* ★이래서 놓쳤다★ */
    expect(contrast(token('color-sa-tab-idle'), TAB_OFF)).toBeGreaterThanOrEqual(4.5)
  })

  it('★꺼진 탭에 따뜻함이 있어야 한다★ — 원본 R−B 는 +62 였다', () => {
    const n = Number.parseInt(token('color-sa-tab-idle').slice(1), 16)
    const rb = ((n >> 16) & 255) - (n & 255)
    expect(rb, '무채색이면 원본의 「빛바랜 금색」 인상이 사라진다').toBeGreaterThanOrEqual(55)
    /* 시안 값은 −4 로 무채색이었다 */
    expect(0x8d - 0x91).toBeLessThan(0)
  })

  it('★꺼진 탭이 본문보다 밝으면 안 된다★ — 눈이 먼저 거기로 간다', () => {
    expect(contrast(token('color-sa-tab-idle'), TAB_OFF)).toBeLessThan(
      contrast(token('color-sa-val'), PANEL),
    )
  })

  it('★시안이 래더 증감에 남겨 둔 옛 값★ — 승 4.18:1 · 패 3.17:1', () => {
    expect(contrast('#4a7cae', PANEL)).toBeLessThan(4.5)
    expect(contrast('#a44949', PANEL)).toBeLessThan(4.5)
    expect(contrast(token('color-sa-win'), PANEL)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('color-sa-lose'), PANEL)).toBeGreaterThanOrEqual(4.5)
  })

  it('★탭 꺼진 글자의 더 옛 값들★', () => {
    expect(contrast('#696e6c', PANEL)).toBeLessThan(4.5)
    expect(contrast('#5e6361', PANEL)).toBeLessThan(4.5)
    expect(contrast('#4a4f4c', PANEL)).toBeLessThan(4.5)
  })
})

/* ========================================================================== */
/* 껍데기(.sa-skin)가 다시 칠한 짝 (O-050 2단계)                                */
/* ========================================================================== */

describe('껍데기가 다시 칠한 짝 — 두 면 위에서 다 재본다', () => {
  /** 껍데기 안의 두 면 — ★한 단 「올린」 면이 없다★ (아래 검사가 그 이유를 지킨다) */
  const PAGE = '#0a0b0b' /* --color-page  ← --color-sa-void */
  const CARD = '#131515' /* --color-card  ← --color-sa-in   */
  const CARD2 = '#0d0f0f' /* --color-card-2 ← --color-sa-edge-lo — ★올린 게 아니라 내린 것★ */

  const TEXTS = [
    ['본문', 'color-sa-val'],
    ['보조', 'color-sa-dim'],
    ['옅게', 'color-sa-faint'],
    ['강조(라벨)', 'color-sa-label'],
    ['승 숫자', 'color-sa-win'],
    ['패 숫자', 'color-sa-lose'],
  ] as const

  for (const [what, name] of TEXTS) {
    for (const [sn, surf] of [
      ['본문 바닥', PAGE],
      ['카드', CARD],
      ['한 단 내린 면', CARD2],
    ] as const) {
      it(`${what} — ${sn} 위 4.5:1 이상`, () => {
        const c = contrast(token(name), surf)
        expect(c, `${token(name)} 이 ${surf} 위에서 ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('★★한 단 「올린」 면을 쓰면 깨진다 — 그래서 안 쓴다★★', () => {
    /* 시안 색은 #131515 위에서 ★4.5 를 겨우 넘게★ 잡혀 있다.
       면을 한 단만 밝혀도 바로 미달이다 — 층은 ★테두리★ 가 만든다 */
    for (const raised of ['#191d1e', '#1c2020', '#232829', '#282d30']) {
      expect(contrast(token('color-sa-faint'), raised)).toBeLessThan(4.5)
    }
    /* 내린 면은 오히려 좋아진다 */
    expect(contrast(token('color-sa-faint'), CARD2)).toBeGreaterThan(
      contrast(token('color-sa-faint'), CARD),
    )
  })

  it('★강조는 라벨 금색 하나다★ — `적진` 의 파랑이 안 남아 있다', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'),
      'utf8',
    )
    /* ⚠ 정규식을 쓰지 않는다 — 이 파일을 heredoc 으로 쓰다가 이스케이프가 깨진 적이 있다 */
    const start = css.indexOf('.sa-skin {')
    expect(start, '.sa-skin 블록이 없다').toBeGreaterThan(-1)
    const end = css.indexOf('\n}', start)
    const body = css.slice(start, end)
    expect(body).toContain('--color-accent: var(--color-sa-label)')
    /* 껍데기 안에서 옛 파랑/진홍이 그대로 새어 나오면 안 된다 */
    expect(body).not.toMatch(/#5c80e0|#d92b2b/)
  })
})
