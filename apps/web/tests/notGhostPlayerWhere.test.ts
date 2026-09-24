import { describe, expect, it } from 'vitest'
import { notGhostPlayerWhere } from '../lib/server/queries/publicScope'

/**
 * ★2026-09-24 사장님 「딥스롯 계정은 왜 남아있냐」★
 *
 * 경기·리그·병영 다리가 전혀 없는 옛 미러(3rd.supply · nexon) 껍데기 줄은
 * 검색·선수 페이지에서 「없는 것처럼」 다룬다. 조건 네 개 중 하나만 참이면 통과(=보인다):
 * ① 애초에 그 두 출처가 아니다 ② 병영수첩 다리(BRK-)가 있다 ③ 경기 기록이 있다 ④ 리그 자리가 있다.
 */
describe('notGhostPlayerWhere', () => {
  it('두 옛 출처 · 병영다리 없음 · 경기기록/★채점된★ 리그자리 있음 여부로 판정하는 OR 조건이다', () => {
    const where = notGhostPlayerWhere()
    expect(where).toEqual({
      OR: [
        { origin: { notIn: ['3rd.supply', 'nexon'] } },
        { sourcePlayerId: { startsWith: 'BRK-' } },
        { matchStats: { some: {} } },
        { leaguePlayers: { some: { lastRatedAt: { not: null } } } },
      ],
    })
  })
})
