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

/* ═══════════════════════════════════════════════════════════════════════════
 * ★★slug 로 증명되는 것만 잇는다★★ (2026-09-05 · Part 3 ⑤단계 · 사장님 지시)
 *
 * > «같은 이름의 다른 클랜 9곳은 ★이름만으로 절대 합치지 마라★»
 * > «지금 목표는 unclassified 0개가 아니다. ★잘못 분류된 경기 0개★ 가 목표다»
 * ═══════════════════════════════════════════════════════════════════════════ */
import { resolveSides, verdictFromSides, type ClanLeague } from '../lib/leagueVerdict.js'

/* 실측을 본뜬 판 — `recent.wct-` 가 IPL(friendliness1)과 열산(recent15) 둘에 있다 */
const IPL = { clanId: 'c-ipl', league: 'nolink' as const }
const SAN = { clanId: 'c-san', league: 'sanply' as const }
const SPL = { clanId: 'c-spl', league: 'supply' as const }

const clanBySlug = new Map<string, ClanLeague>([
  ['friendliness1', IPL],
  ['recent15', SAN],
  ['someSpl', SPL],
])
const namesByClanId = new Map<string, ReadonlySet<string>>([
  ['c-ipl', new Set(['recent.wct-', 'pIacebo'])],
  ['c-san', new Set(['recent.wct-'])],
  ['c-spl', new Set(['saint'])],
])
/* ★모호한 이름은 표에서 빠져 있다★ — `recent.wct-` 가 없다 */
const nameIndex = new Map<string, ClanLeague>([['saint', SPL]])

describe('slug 로 앉히기', () => {
  it('★모호한 이름도 subject 가 있으면 앉는다★ — 원본이 「이 클랜이 나왔다」고 말했다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: ['friendliness1'],
      clanBySlug,
      namesByClanId,
      nameIndex,
    })
    expect(r.red?.clanId).toBe('c-ipl')
    expect(r.redBy).toBe('subject_slug')
    expect(r.blue?.clanId).toBe('c-spl')
    expect(r.blueBy).toBe('clan_name')
  })

  it('★subject 가 없으면 모호한 이름은 안 앉는다★ — 이름만으로 합치지 않는다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: [],
      clanBySlug,
      namesByClanId,
      nameIndex,
    })
    expect(r.red).toBeNull()
    expect(r.redBy).toBe('none')

    const v = verdictFromSides('recent.wct-', 'saint', r)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('unknown_clan')
  })

  it('★같은 이름이라도 subject 가 가리키는 클랜이 앉는다★ (IPL 쪽 slug)', () => {
    const ipl = resolveSides({
      redClanName: 'recent.wct-', blueClanName: 'saint',
      subjects: ['friendliness1'], clanBySlug, namesByClanId, nameIndex,
    })
    expect(ipl.red?.league).toBe('nolink')

    const san = resolveSides({
      redClanName: 'recent.wct-', blueClanName: 'saint',
      subjects: ['recent15'], clanBySlug, namesByClanId, nameIndex,
    })
    /* ★열산 쪽 slug 면 열산 클랜이 앉는다★ — 이름이 같아도 다른 클랜이다 */
    expect(san.red?.league).toBe('sanply')
  })

  it('★양쪽 이름에 다 맞는 subject 는 안 앉힌다★ — 어느 자리인지 모른다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'recent.wct-',
      subjects: ['friendliness1'],
      clanBySlug,
      namesByClanId,
      nameIndex,
    })
    expect(r.red).toBeNull()
    expect(r.blue).toBeNull()
  })

  it('★같은 클랜이 양쪽에 앉으면 둘 다 물린다★', () => {
    const r = resolveSides({
      redClanName: 'saint',
      blueClanName: 'saint',
      subjects: ['someSpl'],
      clanBySlug,
      namesByClanId,
      nameIndex,
    })
    expect(r.red).toBeNull()
    expect(r.blue).toBeNull()
  })

  it('두 subject 가 양쪽을 각각 증명하면 둘 다 앉는다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: ['friendliness1', 'someSpl'],
      clanBySlug,
      namesByClanId,
      nameIndex,
    })
    expect(r.redBy).toBe('subject_slug')
    expect(r.blueBy).toBe('subject_slug')
    const v = verdictFromSides('recent.wct-', 'saint', r)
    /* ★서로 다른 리그다 — 넣지 않는다★ */
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('cross_league')
  })
})

/**
 * ★★클랜번호의 거부권★★ (2026-09-20 비판 검수에서 잡았다)
 *
 *   번호로 ⓪ 가 앉히는 것만으로는 부족했다 — ★한 자리만 앉고 남은 자리는
 *   옛날처럼 이름으로 엉뚱한 클랜이 앉았다.★ 번호를 알고도 못 막은 것이다.
 *
 * ⚠ 그래서 ⓪-B 를 붙였다: ★「이 클랜의 번호가 이 경기에 없다」 면 이름이 맞아도 아니다.★
 */
describe('클랜번호가 거부권을 갖는다', () => {
  /* 세 클랜 모두 번호를 안다 */
  const noByClanId = new Map<string, readonly string[]>([
    ['c-ipl', ['111111111111']],
    ['c-san', ['222222222222']],
    ['c-spl', ['333333333333']],
  ])
  const clanByNo = new Map<string, ClanLeague>([
    ['111111111111', IPL],
    ['222222222222', SAN],
    ['333333333333', SPL],
  ])

  it('★이름이 맞아도 번호가 이 경기에 없으면 안 앉는다★', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: [],
      clanBySlug,
      namesByClanId,
      nameIndex,
      clanByNo,
      noByClanId,
      /* 나온 번호는 IPL 과 ★우리가 모르는 남의 클랜★ 이다 — saint(c-spl)는 안 나왔다 */
      matchClanNos: ['111111111111', '999999999999'],
    })
    expect(r.red?.clanId).toBe('c-ipl')
    expect(r.redBy).toBe('clan_no')
    /* ★여기가 핵심★ — 옛날에는 이름으로 c-spl 이 앉았다 */
    expect(r.blue).toBeNull()
    expect(r.blueBy).toBe('none')
  })

  it('★subject 가 가리켜도 번호가 막는다★ — 원문이 틀릴 수 있다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: ['someSpl'],
      clanBySlug,
      namesByClanId,
      nameIndex,
      clanByNo,
      noByClanId,
      matchClanNos: ['111111111111', '999999999999'],
    })
    expect(r.blue).toBeNull()
  })

  it('★번호를 모르는 클랜은 막지 않는다★ — 우리 표가 아직 다 안 찼다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: [],
      clanBySlug,
      namesByClanId,
      nameIndex,
      clanByNo,
      /* c-spl 의 번호를 ★아직 못 받았다★ */
      noByClanId: new Map([['c-ipl', ['111111111111']]]),
      matchClanNos: ['111111111111', '999999999999'],
    })
    expect(r.red?.clanId).toBe('c-ipl')
    /* 모르는 것으로 막으면 멀쩡한 경기를 버린다 — 이름으로 앉는다 */
    expect(r.blue?.clanId).toBe('c-spl')
    expect(r.blueBy).toBe('clan_name')
  })

  it('★번호가 맞으면 그대로 앉는다★ — 거부권이 정상 경기를 막지 않는다', () => {
    const r = resolveSides({
      redClanName: 'recent.wct-',
      blueClanName: 'saint',
      subjects: [],
      clanBySlug,
      namesByClanId,
      nameIndex,
      clanByNo,
      noByClanId,
      matchClanNos: ['111111111111', '333333333333'],
    })
    expect(r.red?.clanId).toBe('c-ipl')
    expect(r.blue?.clanId).toBe('c-spl')
  })
})
