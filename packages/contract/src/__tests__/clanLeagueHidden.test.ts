import { describe, expect, it } from 'vitest'
import {
  CLAN_HIDDEN_IN_LEAGUE,
  hiddenClanSlugsIn,
  isClanHiddenInLeague,
} from '../clanLeagueHidden'

/**
 * **감춘 곳을 지킨다** (O-044 · 2026-09-03).
 *
 * ⚠ 2026-09-12 — 43 → 46. 사장님이 SPL 에서 셋을 더 감추라고 하셨다
 *   (supremacy- · daytona · UlsaN_CIaN). 경기 기록은 그대로 두고 목록에서만 뺀다.
 *
 * > 사장님: «등록도 겹치면 안된다 **못박아라**»
 *
 * ★한 클랜이 두 리그에 다 보이면 그게 이 판이 고치려던 결함이다.★
 * 표가 흐트러지면 여기서 잡는다.
 */
describe('리그마다 감출 클랜', () => {
  it('★46곳이다★ — 사장님이 직접 분류하셨다 (2026-09-12 셋 추가)', () => {
    const total = CLAN_HIDDEN_IN_LEAGUE.reduce((n, r) => n + r.clanSlugs.length, 0)
    expect(total).toBe(46)
    expect(hiddenClanSlugsIn('sanply')).toHaveLength(29)
    expect(hiddenClanSlugsIn('supply')).toHaveLength(17)
  })

  it('★같은 클랜이 두 리그에서 다 감춰지지 않는다★', () => {
    /* 양쪽에서 감추면 그 클랜은 ★아무 데서도 안 보인다.★ 사장님 뜻은 「한쪽에만 남긴다」다 */
    const spl = new Set(hiddenClanSlugsIn('supply'))
    const both = hiddenClanSlugsIn('sanply').filter((s) => spl.has(s))
    expect(both, `양쪽에서 감춰진 클랜: ${both.join(', ')}`).toHaveLength(0)
  })

  it('slug 가 겹치지 않는다', () => {
    for (const row of CLAN_HIDDEN_IN_LEAGUE) {
      expect(new Set(row.clanSlugs).size, `${row.league} 에 중복 slug`).toBe(row.clanSlugs.length)
    }
  })

  it('아는 몇 곳이 제자리에 있다', () => {
    /* Castle=Gurisi 은 SPL 로 남았다 → 열산에서 감춘다 */
    expect(isClanHiddenInLeague('Gurisi', 'sanply')).toBe(true)
    expect(isClanHiddenInLeague('Gurisi', 'supply')).toBe(false)
    /* MiraGe.=lpcrew 은 열산으로 남았다 → SPL 에서 감춘다 */
    expect(isClanHiddenInLeague('lpcrew', 'supply')).toBe(true)
    expect(isClanHiddenInLeague('lpcrew', 'sanply')).toBe(false)
  })

  it('상관없는 리그·클랜은 안 건드린다', () => {
    expect(hiddenClanSlugsIn('nolink')).toHaveLength(0)
    expect(hiddenClanSlugsIn('daerule')).toHaveLength(0)
    expect(isClanHiddenInLeague('아무클랜', 'sanply')).toBe(false)
  })
})
