/**
 * ★★Part 10 ⑤ — 개인 랭킹 이식★★ (2026-09-07)
 *
 * 여기서 못 박는 것
 *   1. 랭킹 화면이 v2 목록에 있다
 *   2. `PageHead` 는 없는 조각을 안 그린다
 *   3. 표의 등급 색은 ★기본이 꺼짐★ — 안 넘기면 옛 표 그대로다
 *   4. 시즌 이름은 ★리그 API 가 아니라 `SEASON_WINDOWS`★ 를 본다
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { isV2Route } from '../v2/migrated'
import { PageHead } from '../v2/PageHead'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('개인 랭킹이 v2 로 옮겨졌다', () => {
  it('세 리그 모두 옮겨진 화면이다', () => {
    expect(isV2Route('/league/supply/rank/player')).toBe(true)
    expect(isV2Route('/league/nolink/rank/player')).toBe(true)
    expect(isV2Route('/league/sanply/rank/player')).toBe(true)
  })

  it('★아직 안 옮긴 이웃 화면은 그대로다★', () => {
    expect(isV2Route('/league/supply/rank/clan')).toBe(false)
    expect(isV2Route('/league/supply/rank/player/extra')).toBe(false)
    expect(isV2Route('/league/supply/match')).toBe(false)
  })
})

describe('PageHead — 없는 조각은 안 그린다', () => {
  it('전부 주면 전부 그린다', () => {
    const html = renderToStaticMarkup(
      createElement(PageHead, {
        kicker: 'CLOUD 0',
        title: '개인랭킹',
        subtitle: '약 1시간마다 갱신',
        right: createElement('button', {}, '칩'),
      }),
    )
    expect(html).toContain('CLOUD 0')
    expect(html).toContain('개인랭킹')
    expect(html).toContain('약 1시간마다 갱신')
    expect(html).toContain('칩')
  })

  it('kicker 가 없으면 ★리본 줄 자체가 없다★', () => {
    const html = renderToStaticMarkup(createElement(PageHead, { title: '개인랭킹' }))
    expect(html).not.toContain('var(--v2-accent)')
  })

  it('제목은 34px 700 (시안 실측)', () => {
    const html = renderToStaticMarkup(createElement(PageHead, { title: 'x' }))
    expect(html).toContain('font-size:34px')
    expect(html).toContain('font-weight:700')
  })

  it('divider 를 끄면 밑줄이 없다', () => {
    const on = renderToStaticMarkup(createElement(PageHead, { title: 'x' }))
    const off = renderToStaticMarkup(createElement(PageHead, { title: 'x', divider: false }))
    expect(on).toContain('border-bottom')
    expect(off).not.toContain('border-bottom')
  })
})

describe('표는 옛 동작을 기본값으로 지킨다', () => {
  const table = read('../league/RankTable.tsx')

  it('등급 색은 ★기본이 꺼짐★ — 안 넘기면 옛 표 그대로다', () => {
    expect(table).toContain('rankTone = false')
  })

  it('옛 방식(1위만 강조색)이 지워지지 않았다', () => {
    expect(table).toContain('function rankClass')
    expect(table).toContain('RANK_TOP')
  })

  it('경계값을 표 안에서 다시 적지 않는다 — 공통 함수를 부른다', () => {
    expect(table).toContain("import { rankColor } from '../record/playerHeadCopy'")
    /* 3 / 20 / 40 / 100 같은 숫자가 표 파일에 박혀 있으면 안 된다 */
    expect(table).not.toMatch(/rank\s*<=\s*20/)
    expect(table).not.toMatch(/rank\s*<=\s*40/)
  })
})

describe('시즌 이름 — 리그 API 를 안 본다', () => {
  const hook = read('../v2/useSeasonLabel.ts')

  it('`SEASON_WINDOWS` 를 본다', () => {
    expect(hook).toContain('seasonWindowAt')
    expect(hook).toContain('cloudSeasonLabel')
  })

  it('★리그 API 의 season_type 을 안 읽는다★ (주석은 걷어내고 센다)', () => {
    const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('season_type')
    expect(code).not.toContain('leagueShow')
  })

  it('모르면 null — 지어내지 않는다', () => {
    expect(hook).toContain('return null')
  })
})

describe('포디움 — 순위가 없는 리그에는 없다', () => {
  const podium = read(
    '../../../../apps/web/app/league/[leagueSlug]/rank/player/PodiumCards.tsx',
  )

  it('`columns.rank` 가 꺼져 있으면 안 그린다', () => {
    expect(podium).toContain('if (!columns.rank) return null')
  })

  it('1·2·3위가 다 있을 때만 그린다', () => {
    expect(podium).toContain('podium.some((row) => row === undefined)')
  })

  it('색 경계를 여기서 다시 적지 않는다', () => {
    expect(podium).toContain('rankColor(row.rank)')
    expect(podium).toContain('rateClass(')
    expect(podium).not.toMatch(/<=\s*20/)
  })
})
