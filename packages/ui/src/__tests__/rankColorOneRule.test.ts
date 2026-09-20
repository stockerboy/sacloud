import { describe, expect, it } from 'vitest'

import { rankTone, rankToneOf, RANK_MIN_GAMES_DEFAULT } from '@sacloud/contract'

import { rateTone } from '../common/rate'
import { rankColor, rankColorOf, statColor, RANK_COLORS, STAT_COLORS } from '../v3/rankColors'

/**
 * ★★등수 색·승률 색의 규칙은 한 곳뿐이다★★ (2026-09-20 · 비판 검수가 찾았다)
 *
 * ── 왜 이 시험이 있나
 *
 *   `CLAUDE.md` 4절이 ★«화면마다 rankColor 를 복사해 두지 않는다 — 우리는
 *   한 곳뿐이다»★ 라고 적어 뒀는데, ★실제로는 두 곳★ 이었다.
 *
 *     · 등수 경계  `@sacloud/contract` 의 `rankTone` · `rankToneOf`
 *     · 승률 경계  `packages/ui/src/common/rate.ts` 의 `rateTone`
 *     · ★그리고 `packages/ui/src/v3/rankColors.ts` 가 같은 숫자를 또 갖고 있었다★
 *
 *   오늘은 두 곳의 숫자가 우연히 같아서 화면이 멀쩡했다. 그러나 사장님이
 *   경계를 바꾸는 날 ★한쪽만 고쳐지면 화면마다 색이 달라진다.★
 *   («이 화면은 빨간데 저 화면은 노랗네» — 사장님이 먼저 보게 된다)
 *
 * ── 무엇을 보나
 *
 *   ★두 길로 낸 답이 같은가★ 하나다. 경계 숫자를 외우지 않는다 —
 *   사장님이 경계를 바꾸면 양쪽이 같이 움직여 그대로 통과한다.
 *   ★한쪽만 바꾸면 그때 빨개진다.★ 그게 이 시험이 막고 싶은 것 전부다.
 */

/** 등수 색 이름 → v3 팔레트. 이 표만 이 시험이 안다 */
const RANK_HEX: Record<string, string> = {
  red: RANK_COLORS.top3,
  gold: RANK_COLORS.top20,
  blue: RANK_COLORS.top40,
  green: RANK_COLORS.top100,
  brown: '#c08a5a',
  plain: RANK_COLORS.rest,
}

/** 승률 색 이름 → v3 팔레트 */
const STAT_HEX: Record<string, string> = {
  low: STAT_COLORS.red,
  base: STAT_COLORS.white,
  r1: STAT_COLORS.green,
  r2: STAT_COLORS.brown,
  r3: STAT_COLORS.blue,
  r4: STAT_COLORS.yellow,
}

describe('색 규칙은 한 곳뿐이다', () => {
  it('★등수 색 — v3 의 답이 계약(rankTone)의 답과 같다★', () => {
    const 어긋남: string[] = []
    for (let rank = 1; rank <= 300; rank += 1) {
      const tone = rankTone(rank)
      const 기대 = tone === null ? RANK_COLORS.rest : RANK_HEX[tone]
      if (rankColor(rank) !== 기대) 어긋남.push(`${rank}위 — v3 ${rankColor(rank)} vs 계약 ${기대}`)
    }
    expect(어긋남, `\n★등수 색이 두 갈래로 갈라졌다★\n${어긋남.slice(0, 10).join('\n')}\n`).toEqual([])
  })

  it('★비율 등수 색 — v3 의 답이 계약(rankToneOf)의 답과 같다★', () => {
    const 어긋남: string[] = []
    /* 모집단을 여러 크기로 — 작은 리그(10곳)부터 큰 리그(749명)까지 */
    for (const total of [null, 0, 10, 42, 120, 533, 749]) {
      for (let rank = 1; rank <= 60; rank += 1) {
        const tone = rankToneOf(rank, total)
        const 기대 = tone === null ? RANK_COLORS.rest : RANK_HEX[tone]
        const 실제 = rankColorOf(rank, total)
        if (실제 !== 기대) 어긋남.push(`${rank}/${String(total)} — v3 ${실제} vs 계약 ${기대}`)
      }
    }
    expect(어긋남, `\n★비율 등수 색이 두 갈래로 갈라졌다★\n${어긋남.slice(0, 10).join('\n')}\n`).toEqual([])
  })

  it('★승률·킬뎃 색 — v3 의 답이 rateTone 의 답과 같다★', () => {
    const 어긋남: string[] = []
    for (let v = 0; v <= 1000; v += 1) {
      const value = v / 10
      const 기대 = STAT_HEX[rateTone(value)]
      if (statColor(value) !== 기대) 어긋남.push(`${value} — v3 ${statColor(value)} vs rate ${기대}`)
    }
    expect(어긋남, `\n★승률 색이 두 갈래로 갈라졌다★\n${어긋남.slice(0, 10).join('\n')}\n`).toEqual([])
  })

  it('★숫자가 아니면 색을 지어내지 않는다★ — 회색 (D-106)', () => {
    expect(statColor(Number.NaN)).toBe('#8a8a93')
    /* 이 줄은 계약이 실제로 붙어 있는지 확인하는 겸사겸사다 */
    expect(RANK_MIN_GAMES_DEFAULT).toBeGreaterThan(0)
  })
})
