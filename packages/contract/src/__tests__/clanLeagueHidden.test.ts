import { describe, expect, it } from 'vitest'
import {
  CLAN_HIDDEN_IN_LEAGUE,
  CLAN_LEAGUE_EXCLUSIVE,
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
  /**
   * ⚠ ★2026-09-21 — 겸업 금지를 껐다★ (사장님: 「중복으로 두가지 이상의 리그에
   *   겸할 수 있음 (…) 상관없어 ★다 되게해★」).
   *
   *   ★표는 그대로 지킨다★ — 사장님이 직접 나누신 46곳이라 지우면 되살릴 수 없다.
   *   바뀐 것은 ★그 표를 쓰느냐★ 뿐이다. 스위치를 되돌리면 이 시험도 옛 뜻으로 돌아간다.
   */
  it('★표는 그대로 46곳이다★ — 사장님이 직접 분류하셨다 (2026-09-12 셋 추가)', () => {
    const total = CLAN_HIDDEN_IN_LEAGUE.reduce((n, r) => n + r.clanSlugs.length, 0)
    expect(total).toBe(46)
    expect(CLAN_HIDDEN_IN_LEAGUE.find((r) => r.league === 'sanply')?.clanSlugs).toHaveLength(29)
    expect(CLAN_HIDDEN_IN_LEAGUE.find((r) => r.league === 'supply')?.clanSlugs).toHaveLength(17)
  })

  it('★지금은 아무 데서도 안 감춘다★ — 겸업을 연 뒤', () => {
    expect(CLAN_LEAGUE_EXCLUSIVE).toBe(false)
    expect(hiddenClanSlugsIn('sanply')).toHaveLength(0)
    expect(hiddenClanSlugsIn('supply')).toHaveLength(0)
    expect(isClanHiddenInLeague('Gurisi', 'sanply')).toBe(false)
  })

  it('★같은 클랜이 두 리그에서 다 감춰지지 않는다★', () => {
    /* 양쪽에서 감추면 그 클랜은 ★아무 데서도 안 보인다.★ 사장님 뜻은 「한쪽에만 남긴다」다.
       ⚠ 스위치를 끈 뒤에도 ★표 자체★ 는 이 성질을 지켜야 한다 — 되돌릴 때를 위해 표를 본다 */
    const rowOf = (l: string) => CLAN_HIDDEN_IN_LEAGUE.find((r) => r.league === l)?.clanSlugs ?? []
    const spl = new Set(rowOf('supply'))
    const both = rowOf('sanply').filter((s) => spl.has(s))
    expect(both, `양쪽에서 감춰진 클랜: ${both.join(', ')}`).toHaveLength(0)
  })

  it('slug 가 겹치지 않는다', () => {
    for (const row of CLAN_HIDDEN_IN_LEAGUE) {
      expect(new Set(row.clanSlugs).size, `${row.league} 에 중복 slug`).toBe(row.clanSlugs.length)
    }
  })

  it('★표 안에서는 아는 몇 곳이 제자리에 있다★ — 되돌릴 때를 위해', () => {
    const inRow = (slug: string, league: string) =>
      (CLAN_HIDDEN_IN_LEAGUE.find((r) => r.league === league)?.clanSlugs ?? []).includes(slug)
    /* Castle=Gurisi 은 SPL 로 남았다 → 열산에서 감춘다 */
    expect(inRow('Gurisi', 'sanply')).toBe(true)
    expect(inRow('Gurisi', 'supply')).toBe(false)
    /* MiraGe.=lpcrew 은 열산으로 남았다 → SPL 에서 감춘다 */
    expect(inRow('lpcrew', 'supply')).toBe(true)
    expect(inRow('lpcrew', 'sanply')).toBe(false)
  })

  it('상관없는 리그·클랜은 안 건드린다', () => {
    expect(hiddenClanSlugsIn('nolink')).toHaveLength(0)
    expect(hiddenClanSlugsIn('daerule')).toHaveLength(0)
    expect(isClanHiddenInLeague('아무클랜', 'sanply')).toBe(false)
  })
})
