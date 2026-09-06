/**
 * ★★Part 10 ②단계 — 공통 토큰 · 조각 4개★★ (2026-09-06)
 *
 * 여기서 지키려는 것은 「예쁘나」가 아니라 ★거짓말을 안 하나★ 다.
 *
 *   1. 순위 색 경계는 사장님이 정한 ★3 / 20 / 40 / 100★ 한 곳뿐이다
 *   2. 옛 경계(10 / 50 / 100 / 200)는 ★지우지 않았다★ (`CLAUDE.md` 1-4)
 *   3. 값이 없으면 ★0 이나 `-` 로 채우지 않는다★ — 「집계 없음」을 흐리게 그린다
 *   4. 데이터가 없는 장식(워터마크 · 설명 · 필터 종류)은 ★요소 자체를 안 만든다★
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { rankTone, rankToneV1 } from '@sacloud/contract'
import { rankColor } from '../record/playerHeadCopy'
import { Panel } from '../v2/Panel'
import { SectionHead } from '../v2/SectionHead'
import { StatRow } from '../v2/StatRow'
import { FilterChip } from '../v2/FilterChip'

describe('rankTone — 순위 색 경계 3 / 20 / 40 / 100 (2026-09-06 사장님 결정)', () => {
  it('1~3 위는 빨강', () => {
    expect(rankTone(1)).toBe('red')
    expect(rankTone(3)).toBe('red')
  })

  it('4~20 금색 · 21~40 파랑 · 41~100 초록 · 그 밖은 무채색', () => {
    expect(rankTone(4)).toBe('gold')
    expect(rankTone(20)).toBe('gold')
    expect(rankTone(21)).toBe('blue')
    expect(rankTone(40)).toBe('blue')
    expect(rankTone(41)).toBe('green')
    expect(rankTone(100)).toBe('green')
    expect(rankTone(101)).toBe('plain')
  })

  it('순위가 없으면 색도 없다 — 0 위 같은 것을 만들지 않는다', () => {
    expect(rankTone(null)).toBeNull()
    expect(rankTone(undefined)).toBeNull()
    expect(rankTone(0)).toBeNull()
    expect(rankColor(null)).toBeNull()
  })

  it('모든 등급에 실제 색이 있다 — red 가 빠져 있으면 1위가 무색이 된다', () => {
    for (const rank of [1, 4, 21, 41, 101]) {
      expect(rankColor(rank)).toMatch(/^var\(--/)
    }
  })

  /* ★옛 방식을 지우지 않았다★ — `CLAUDE.md` 1-4 */
  it('옛 경계(10 / 50 / 100 / 200)는 rankToneV1 에 그대로 있다', () => {
    expect(rankToneV1(1)).toBe('gold')
    expect(rankToneV1(10)).toBe('gold')
    expect(rankToneV1(11)).toBe('blue')
    expect(rankToneV1(50)).toBe('blue')
    expect(rankToneV1(51)).toBe('brown')
    expect(rankToneV1(100)).toBe('brown')
    expect(rankToneV1(101)).toBe('green')
    expect(rankToneV1(200)).toBe('green')
    expect(rankToneV1(201)).toBe('plain')
  })
})

describe('StatRow — 없는 값을 0 으로 만들지 않는다', () => {
  it('값이 있으면 숫자와 단위를 그린다', () => {
    const html = renderToStaticMarkup(
      createElement(StatRow, { label: '승률', sub: '12승 6패', value: '66.7', unit: '%' }),
    )
    expect(html).toContain('66.7')
    expect(html).toContain('12승 6패')
    expect(html).not.toContain('집계 없음')
  })

  it('값이 null 이면 「집계 없음」이고 0 이 아니다', () => {
    const html = renderToStaticMarkup(createElement(StatRow, { label: '승률', value: null }))
    expect(html).toContain('집계 없음')
    expect(html).not.toContain('>0<')
    expect(html).not.toContain('>-<')
  })

  it('부제가 없으면 요소 자체를 안 만든다', () => {
    const html = renderToStaticMarkup(createElement(StatRow, { label: '승률', value: '1' }))
    expect(html.match(/<span/g)?.length).toBeLessThan(6)
  })

  it('색을 스스로 정하지 않는다 — 부르는 쪽이 준 클래스만 붙는다', () => {
    const plain = renderToStaticMarkup(createElement(StatRow, { label: 'KD', value: '0.4' }))
    expect(plain).not.toContain('text-rate')
    const toned = renderToStaticMarkup(
      createElement(StatRow, { label: 'KD', value: '0.4', toneClass: 'text-rate-low' }),
    )
    expect(toned).toContain('text-rate-low')
  })
})

describe('Panel — 없는 장식은 그리지 않는다', () => {
  it('워터마크를 안 주면 요소가 없다', () => {
    const html = renderToStaticMarkup(createElement(Panel, { children: '내용' }))
    expect(html).not.toContain('v2-watermark')
    expect(html).not.toContain('v2-sweep')
    expect(html).toContain('v2-panel--edge')
  })

  it('진행중 카드는 자기 색(초록)을 쓰고 edge 로 덮이지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(Panel, { children: '내용', live: true, edge: '#ff0000' }),
    )
    expect(html).toContain('v2-panel--live')
    expect(html).not.toContain('#ff0000')
  })

  it('noEdge 면 위쪽 선 클래스가 없다', () => {
    const html = renderToStaticMarkup(createElement(Panel, { children: '내용', noEdge: true }))
    expect(html).not.toContain('v2-panel--edge')
    expect(html).toContain('v2-panel')
  })
})

describe('SectionHead — 설명이 없으면 빈 칸을 남기지 않는다', () => {
  it('설명·줄을 주면 그린다', () => {
    const html = renderToStaticMarkup(
      createElement(SectionHead, { title: '지난시즌 기록', note: '종료된 시즌' }),
    )
    expect(html).toContain('지난시즌 기록')
    expect(html).toContain('종료된 시즌')
  })

  it('리본 색은 안 주면 리그 강조색이다', () => {
    const html = renderToStaticMarkup(createElement(SectionHead, { title: '차트' }))
    expect(html).toContain('var(--v2-accent)')
  })

  it('설명이 없으면 그 요소가 아예 없다', () => {
    const withNote = renderToStaticMarkup(
      createElement(SectionHead, { title: '차트', note: 'x', hairline: false }),
    )
    const without = renderToStaticMarkup(
      createElement(SectionHead, { title: '차트', hairline: false }),
    )
    expect(withNote.match(/<span/g)?.length).toBe((without.match(/<span/g)?.length ?? 0) + 1)
  })
})

describe('FilterChip — 열림 상태를 스스로 갖지 않는다', () => {
  const options = ['전체', '1티어', '2티어'] as const

  it('닫혀 있으면 목록을 안 그린다', () => {
    const html = renderToStaticMarkup(
      createElement(FilterChip<(typeof options)[number]>, {
        kind: 'TIER',
        value: '전체',
        options,
        open: false,
        onToggle: () => {},
        onSelect: () => {},
      }),
    )
    expect(html).toContain('TIER')
    expect(html).not.toContain('role="listbox"')
    expect(html).not.toContain('1티어')
  })

  it('열리면 목록이 나오고 지금 값이 선택 표시된다', () => {
    const html = renderToStaticMarkup(
      createElement(FilterChip<(typeof options)[number]>, {
        value: '1티어',
        options,
        open: true,
        onToggle: () => {},
        onSelect: () => {},
      }),
    )
    expect(html).toContain('role="listbox"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('2티어')
  })

  it('종류(TIER 같은 것)를 안 주면 그 글자 자리를 안 만든다', () => {
    const html = renderToStaticMarkup(
      createElement(FilterChip<(typeof options)[number]>, {
        value: '전체',
        options,
        open: false,
        onToggle: () => {},
        onSelect: () => {},
      }),
    )
    expect(html.match(/<span/g)?.length).toBe(2)
  })
})
