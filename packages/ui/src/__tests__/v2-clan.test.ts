/**
 * ★★Part 10 ⑦ — 클랜 상세 이식★★ (2026-09-07)
 *
 * 여기서 못 박는 것
 *   1. 클랜 상세(기록실 · 클랜원 · 지난시즌)가 v2 목록에 있다
 *   2. ★없는 값은 칸을 만들지 않는다★
 *   3. 선수 카드와 ★같은 뼈대★ 를 쓴다 — 두 곳에 같은 마크업을 두지 않는다
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isV2Route } from '../v2/migrated'
import { clanKpis } from '../v2/ClanIdentityCard'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('클랜 상세가 v2 로 옮겨졌다', () => {
  it('세 화면 모두', () => {
    expect(isV2Route('/league/supply/clan/sorentolove')).toBe(true)
    expect(isV2Route('/league/supply/clan/sorentolove/player')).toBe(true)
    expect(isV2Route('/league/supply/clan/sorentolove/season')).toBe(true)
  })

  it('이웃 화면을 잘못 물지 않는다', () => {
    expect(isV2Route('/league/supply/clan/sorentolove/setting')).toBe(false)
    expect(isV2Route('/clan/sorentolove')).toBe(false)
    expect(isV2Route('/league/supply/rank/clan')).toBe(false)
  })
})

describe('클랜 KPI — 없는 값은 칸을 만들지 않는다', () => {
  const base = {
    rating: 3139,
    win: 330,
    lose: 164,
    winRate: 66.8,
    rank: 1,
    rankCount: 24,
    showsRating: true,
  }

  it('다 있으면 세 칸', () => {
    expect(clanKpis(base).map((k) => k.label)).toEqual(['래더', '승률', '순위'])
  })

  it('★한 판도 안 뛰었으면 승률 칸이 없다★ — 0% 를 안 만든다', () => {
    const kpis = clanKpis({ ...base, win: 0, lose: 0, winRate: 0 })
    expect(kpis.map((k) => k.label)).toEqual(['래더', '순위'])
    expect(JSON.stringify(kpis)).not.toContain('0승 0패')
  })

  it('순위가 없으면 순위 칸이 없다 — 0위를 안 만든다', () => {
    const kpis = clanKpis({ ...base, rank: null })
    expect(kpis.map((k) => k.label)).toEqual(['래더', '승률'])
    expect(JSON.stringify(kpis)).not.toContain('0위')
  })

  it('모수를 모르면 `/ N팀` 을 안 붙인다', () => {
    const kpis = clanKpis({ ...base, rankCount: null })
    expect(kpis.find((k) => k.label === '순위')?.sub).toBeUndefined()
  })

  it('순위 색은 공통 함수가 정한다 (1위 = 빨강)', () => {
    expect(clanKpis(base).find((k) => k.label === '순위')?.color).toBe('var(--color-rank-red)')
  })
})

describe('클랜 카드 — 선수 카드와 같은 뼈대를 쓴다', () => {
  const clanCard = read('../v2/ClanIdentityCard.tsx')
  const playerCard = read('../v2/PlayerIdentityCard.tsx')

  it('둘 다 `RecordIdentityCard` 위에 올라간다', () => {
    expect(clanCard).toContain("from './RecordIdentityCard'")
    expect(playerCard).toContain("from './RecordIdentityCard'")
  })

  it('★카드 마크업을 각자 다시 적지 않는다★', () => {
    for (const src of [clanCard, playerCard]) {
      expect(src).not.toContain('v2-emblem-border')
      expect(src).not.toContain('v2-card-divider')
    }
  })

  it('티어는 리그가 정한다 — 카드가 slug 를 보지 않는다', () => {
    expect(clanCard).toContain('divisionCount > 1')
    expect(clanCard).not.toContain("'nolink'")
    expect(clanCard).not.toContain("'supply'")
  })
})
