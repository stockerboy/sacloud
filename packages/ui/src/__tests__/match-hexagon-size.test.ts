/**
 * ★경기 육각을 키웠다★ — 그림이 그림판 밖으로 나가지 않는가 (2026-09-17 사장님).
 *
 * > 「육각 그래프 크기 더 키워주고 밑에 멘트 필요없어 전부 없애」
 *
 * ── 왜 시험으로 박아 두나
 *   반지름을 74 → 92 로 올리면서 축 이름 자리도 같이 옮겼다.
 *   ★글자가 그림판 밖으로 한 글자만 나가도 카드에서 잘린다.★ 그 일이 2026-09-16 에
 *   실제로 났고(사장님: «글씨 안튀어나가게»), 눈으로만 보고 넘기면 또 난다.
 *
 *   그림을 그리지 않고 ★좌표만★ 본다 — 브라우저가 필요 없다.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ClanHexV2AnyAxisKey, ClanHexagonV2 } from '@sacloud/contract'
import { CLAN_HEX_V2_MATCH_AXIS_KEYS } from '@sacloud/contract'
import { MatchHexagonV3 } from '../v3/MatchHexagonV3'

/** 그림판 — `MatchHexagonV3` 의 `MHEX` 와 같은 값이어야 한다 */
const VB = { x: -18, w: 338, h: 300 }

function axis(key: ClanHexV2AnyAxisKey, value: number, text: string) {
  return {
    key,
    label: key,
    numerator: 40,
    denominator: 64,
    raw: value / 100,
    value,
    text,
    pending: null,
    rank: null,
    total: null,
  }
}

function hexagon(text: string): ClanHexagonV2 {
  return {
    axes: CLAN_HEX_V2_MATCH_AXIS_KEYS.map((k, i) =>
      axis(k, 20 + i * 13, k === 'sniperInfluence' || k === 'rifleInfluence' ? text : `${20 + i * 13}%`),
    ),
  } as unknown as ClanHexagonV2
}

/* JSX 대신 `createElement` 를 쓴다 — 이 저장소의 시험은 `.ts` 만 주워 담는다 */
const html = renderToStaticMarkup(
  createElement(MatchHexagonV3, {
    won: hexagon('63% : 37% (26%p 차이)'),
    lost: hexagon('37% : 63% (26%p 차이)'),
    wonName: 'afterpray',
    lostName: '-tsAr.nTc',
  }),
)

describe('★경기 육각 — 커진 그림이 판 밖으로 안 나간다★ (2026-09-17)', () => {
  it('그림판이 커진 경기 전용 값이다 — 선수 육각(300×262)이 아니다', () => {
    expect(html).toContain(`viewBox="${VB.x} 0 ${VB.w} ${VB.h}"`)
    expect(html).not.toContain('viewBox="-34 0 368 262"')
  })

  it('모든 글자 x 가 그림판 좌우 안에 있다', () => {
    const xs = [...html.matchAll(/<(?:text|tspan)[^>]*\sx="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
    expect(xs.length).toBeGreaterThan(6)
    for (const x of xs) {
      expect(x, `x=${x}`).toBeGreaterThanOrEqual(VB.x)
      expect(x, `x=${x}`).toBeLessThanOrEqual(VB.x + VB.w)
    }
  })

  it('모든 글자 y 가 그림판 위아래 안에 있다', () => {
    const ys = [...html.matchAll(/<text[^>]*\sy="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
    expect(ys.length).toBeGreaterThan(6)
    for (const y of ys) {
      expect(y, `y=${y}`).toBeGreaterThanOrEqual(0)
      expect(y, `y=${y}`).toBeLessThanOrEqual(VB.h)
    }
  })

  it('육각 꼭짓점이 축 이름보다 안쪽이다 — 선이 글자를 뚫지 않는다', () => {
    /* 오른쪽 두 축의 이름은 x=244 에서 시작한다. 꼭짓점은 그보다 왼쪽이어야 한다 */
    const points = [...html.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
      (m[1] ?? '').split(' ').map((pair) => Number(pair.split(',')[0])),
    )
    expect(points.length).toBeGreaterThan(6)
    expect(Math.max(...points)).toBeLessThan(244)
    expect(Math.min(...points)).toBeGreaterThan(56 - 244 + 244 - 188) // = 56 보다 오른쪽
  })
})

describe('★경기 여섯 축★ — 유리한 기회가 들어오고 기회차단은 빠졌다 (2026-09-17)', () => {
  it('여섯 축 이름이 다 그려진다', () => {
    for (const name of ['스나싸움', '스나영향력', '라플영향력', '유리한 기회', '소수싸움', '세이브']) {
      expect(html, name).toContain(name)
    }
  })

  it('클랜 육각의 «기회차단» 은 경기에 안 나온다', () => {
    expect(html).not.toContain('기회차단')
  })
})

describe('★멘트를 안 그린다★ (2026-09-17 사장님: «밑에 멘트 필요없어 전부 없애»)', () => {
  it('«어디서 갈렸나» 한 줄이 없다', () => {
    expect(html).not.toContain('갈렸습니다')
  })

  it('맨 아래 잣대 안내줄이 없다', () => {
    expect(html).not.toContain('잣대가 다릅니다')
  })

  it('범례는 남는다 — 어느 색이 어느 클랜인지는 있어야 한다', () => {
    expect(html).toContain('afterpray')
    expect(html).toContain('-tsAr.nTc')
  })
})

describe('★영향력 값은 한 번만 적는다★ (2026-09-17)', () => {
  it('«63% : 37% (26%p 차이)» 가 한 축에 두 번 나오지 않는다', () => {
    /* 스나·라플 두 축이 같은 글을 쓰므로 정확히 두 번이다 — 네 번이면 양쪽을 다 적은 것이다 */
    const hits = html.split('26%p 차이').length - 1
    expect(hits).toBe(2)
  })

  it('괄호 앞에서 줄을 끊는다 — 한 줄로 두면 카드 밖으로 나간다', () => {
    expect(html).toContain('63% : 37%')
    expect(html).toContain('(26%p 차이)')
  })
})
