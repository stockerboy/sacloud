/**
 * ★★Part 10 ⑥ — 선수 상세 이식★★ (2026-09-07)
 *
 * 여기서 못 박는 것
 *   1. 선수 상세(기록실 · 지난시즌)가 v2 목록에 있다
 *   2. ★없는 값은 칸을 만들지 않는다★ — 0 이나 `-` 로 채우지 않는다
 *   3. 이번 시즌 경기가 없으면 ★왜 비었는지 한 줄로 말한다★
 *   4. 색 경계를 카드 안에서 다시 적지 않는다
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isV2Route } from '../v2/migrated'
import { playerKpis } from '../v2/PlayerIdentityCard'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('선수 상세가 v2 로 옮겨졌다', () => {
  it('기록실과 지난시즌 둘 다', () => {
    expect(isV2Route('/league/supply/player/OBS-abc')).toBe(true)
    expect(isV2Route('/league/nolink/player/cmt123/season')).toBe(true)
  })

  it('이웃 화면을 잘못 물지 않는다', () => {
    expect(isV2Route('/league/supply/player/abc/setting')).toBe(false)
    expect(isV2Route('/player/abc')).toBe(false)
    /* ⚠ `/league/.../clan/...` 은 ⑦ 에서 옮겨졌다 — `v2-clan.test.ts` 가 지킨다 */
    expect(isV2Route('/league/supply/rank/clan')).toBe(false)
  })
})

describe('KPI — 없는 값은 칸을 만들지 않는다', () => {
  const base = {
    rating: 4801,
    win: 12,
    lose: 6,
    winRate: 66.7,
    kdRate: 54.2,
    killPerMatch: 8.8,
    showsRating: true,
  }

  it('다 있으면 네 칸', () => {
    expect(playerKpis(base).map((k) => k.label)).toEqual(['래더', '승률', '킬뎃', '판킬'])
  })

  it('★한 판도 안 뛰었으면 승률·판킬 칸이 없다★ — 0% 를 안 만든다', () => {
    const kpis = playerKpis({ ...base, win: 0, lose: 0, winRate: 0, killPerMatch: 0 })
    expect(kpis.map((k) => k.label)).toEqual(['래더', '킬뎃'])
    expect(JSON.stringify(kpis)).not.toContain('0승 0패')
  })

  it('킬뎃을 안 주는 리그면 킬뎃 칸이 없다 (D-107)', () => {
    expect(playerKpis({ ...base, kdRate: null }).map((k) => k.label)).toEqual([
      '래더',
      '승률',
      '판킬',
    ])
  })

  it('★래더가 없는 리그면 래더 칸이 없다★ (10mountain)', () => {
    expect(playerKpis({ ...base, showsRating: false }).map((k) => k.label)).toEqual([
      '승률',
      '킬뎃',
      '판킬',
    ])
  })

  it('색은 공통 함수가 붙인다', () => {
    const kpis = playerKpis(base)
    expect(kpis.find((k) => k.label === '승률')?.toneClass).toBe('text-rate-4')
    expect(kpis.find((k) => k.label === '킬뎃')?.toneClass).toBe('text-rate-1')
    /* 래더는 0~100 이 아니다 — 등급 색을 안 붙인다 */
    expect(kpis.find((k) => k.label === '래더')?.toneClass).toBeUndefined()
  })
})

describe('카드 — 지어내지 않는다', () => {
  const card = read('../v2/PlayerIdentityCard.tsx')
  /* 주석에는 「캐리머신을 안 그린다」 같은 말이 들어 있다. ★코드만 보고 센다★ */
  const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  it('순위가 없으면 「순위 없음」 — 0위를 안 만든다', () => {
    expect(code).toContain('순위 없음')
    expect(code).not.toContain('0위')
  })

  it('★캐리머신 · 별 배지를 안 그린다★ (데이터가 없다)', () => {
    expect(code).not.toContain('캐리머신')
    expect(code).not.toContain('★★★')
  })

  it('색 경계를 카드 안에서 다시 적지 않는다', () => {
    expect(code).toContain('rankColor(rank)')
    expect(card).toContain('rateClass(')
    expect(code).not.toMatch(/<=\s*20/)
    expect(code).not.toMatch(/<\s*55/)
  })
})

describe('한 판도 안 뛴 선수에게 0% 라고 하지 않는다', () => {
  const head = read('../record/PlayerHeadCard.tsx')

  it('승률 칸이 경기 수를 보고 「집계 없음」으로 갈린다', () => {
    expect(head).toContain('props.win + props.lose === 0')
    expect(head).toContain('집계 없음')
  })
})
