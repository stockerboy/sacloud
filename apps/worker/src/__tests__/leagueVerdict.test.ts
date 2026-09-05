/**
 * ★★한 경기를 IPL / SPL / 열산 중 정확히 하나로★★ (2026-09-05 · Part 3 ②단계).
 *
 * 사장님 완료 조건 3~7 을 여기서 고정한다.
 * ```
 * 3 IPL 클랜끼리   → IPL 하나
 * 4 SPL 클랜끼리   → SPL 하나
 * 5 열산 클랜끼리   → 열산 하나
 * 6 서로 다른 리그  → ★unclassified★ (임의 생성 안 함)
 * 7 판정 불가      → ★unclassified★
 * ```
 *
 * ── ★애매하면 안 고른다★
 *   골라 넣으면 그게 곧 ★조용한 오분류★ 다. 이 저장소가 계속 당한 모양이다 —
 *   조용히 건너뛰던 미러 · 실패를 성공으로 넘기던 자물쇠 · 남의 리그 카드.
 *   ★사유와 함께 남기면 「왜 안 들어왔나」에 답할 수 있다.★
 */
import { describe, expect, it } from 'vitest'
import {
  LEAGUE_LABEL,
  LIVE_LEAGUE_SLUGS,
  buildClanIndex,
  decideLeague,
  type LiveLeagueSlug,
} from '../lib/leagueVerdict.js'

const entry = (name: string, clanId: string, league: LiveLeagueSlug) => ({ name, clanId, league })

/** 실제 이름을 쓴다 — 규칙이 진짜 데이터에서 도는지 보이게 */
const { index } = buildClanIndex([
  entry('hingˇ', 'c-ipl-1', 'nolink'),
  entry('idylic', 'c-ipl-2', 'nolink'),
  entry('CeIebrity', 'c-spl-1', 'supply'),
  entry('recent.wct', 'c-spl-2', 'supply'),
  /* 개명 전 이름도 같은 클랜을 가리킨다 */
  entry('melody', 'c-spl-2', 'supply'),
  entry('어린이', 'c-san-1', 'sanply'),
  entry('사신', 'c-san-2', 'sanply'),
])

describe('운영 대상은 세 리그뿐이다', () => {
  it('★대룰은 없다★ — 사장님이 두 번 말씀하셨다 (O-042)', () => {
    expect([...LIVE_LEAGUE_SLUGS]).toEqual(['nolink', 'supply', 'sanply'])
    expect(LIVE_LEAGUE_SLUGS).not.toContain('daerule')
  })

  it('이름표가 있다 — 로그가 사람에게 읽혀야 한다', () => {
    expect(LEAGUE_LABEL.nolink).toBe('IPL')
    expect(LEAGUE_LABEL.supply).toBe('SPL')
    expect(LEAGUE_LABEL.sanply).toBe('10mountain')
  })
})

describe('같은 리그끼리 — 그 리그 하나로', () => {
  it('③ IPL 클랜끼리 → IPL', () => {
    const v = decideLeague('hingˇ', 'idylic', index)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.league).toBe('nolink')
      expect(v.redClanId).toBe('c-ipl-1')
      expect(v.blueClanId).toBe('c-ipl-2')
    }
  })

  it('④ SPL 클랜끼리 → SPL', () => {
    const v = decideLeague('CeIebrity', 'recent.wct', index)
    expect(v.ok && v.league).toBe('supply')
  })

  it('⑤ 열산 클랜끼리 → 열산', () => {
    const v = decideLeague('어린이', '사신', index)
    expect(v.ok && v.league).toBe('sanply')
  })

  it('★개명 전 이름으로 와도 같은 클랜으로 본다★', () => {
    /* 실측 2026-08-31: melody 1,901건이 개명 때문에 통째로 빠졌었다 */
    const v = decideLeague('CeIebrity', 'melody', index)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.league).toBe('supply')
      expect(v.blueClanId).toBe('c-spl-2')
    }
  })
})

describe('갈리면 안 넣는다 — unclassified', () => {
  it('⑥ 서로 다른 리그 → cross_league (★임의로 안 고른다★)', () => {
    const v = decideLeague('hingˇ', '어린이', index)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.reason).toBe('cross_league')
    expect(v.redLeague).toBe('nolink')
    expect(v.blueLeague).toBe('sanply')
    /* ★사유가 사람 말로 남는다★ */
    expect(v.detail).toContain('IPL')
    expect(v.detail).toContain('10mountain')
  })

  it('⑦ 모르는 클랜이 끼면 → unknown_clan', () => {
    const v = decideLeague('hingˇ', '처음보는클랜', index)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.reason).toBe('unknown_clan')
    expect(v.detail).toContain('처음보는클랜')
    /* ★아는 쪽은 남긴다★ — 나중에 원인을 좁힐 수 있다 */
    expect(v.redLeague).toBe('nolink')
    expect(v.blueLeague).toBeNull()
  })

  it('양쪽 다 모르면 둘 다 남긴다', () => {
    const v = decideLeague('모름A', '모름B', index)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.reason).toBe('unknown_clan')
    expect(v.redLeague).toBeNull()
    expect(v.blueLeague).toBeNull()
  })
})

describe('★같은 이름 다른 클랜은 표에서 뺀다★', () => {
  it('모호한 이름은 「모른다」가 된다 — 골라 넣지 않는다', () => {
    /* 실측 2026-09-05: daytona · hingˇ · recent.wct- 가 같은 이름 다른 클랜이다 */
    const built = buildClanIndex([
      entry('daytona', 'c-a', 'supply'),
      entry('daytona', 'c-b', 'sanply'),
      entry('멀쩡한클랜', 'c-c', 'supply'),
    ])
    expect(built.ambiguous).toEqual(['daytona'])
    expect(built.index.has('daytona')).toBe(false)
    expect(built.index.get('멀쩡한클랜')?.league).toBe('supply')

    const v = decideLeague('daytona', '멀쩡한클랜', built.index)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('unknown_clan')
  })

  it('같은 클랜을 두 번 넣은 것은 모호한 것이 아니다', () => {
    const built = buildClanIndex([
      entry('같은클랜', 'c-x', 'supply'),
      entry('같은클랜', 'c-x', 'supply'),
    ])
    expect(built.ambiguous).toEqual([])
    expect(built.index.get('같은클랜')?.clanId).toBe('c-x')
  })
})
