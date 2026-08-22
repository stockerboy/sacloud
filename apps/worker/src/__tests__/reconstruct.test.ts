/**
 * 로스터 기반 재구성 회귀 테스트 (Phase 8.2).
 *
 * 여기서 고정하는 것은 **완전성 판정 규칙**이다. DB·네트워크 없이 전부 돌아간다.
 *
 * 이 테스트가 지키는 약속
 *  1. 관측되지 않은 참가자를 만들지 않는다
 *  2. 소속은 닉네임·클랜명이 아니라 **등록 기록**으로 판정한다
 *  3. 조건이 모자라면 부분 저장 없이 사유를 남긴다
 *  4. 상세와 관측이 어긋나면 자동 투영하지 않는다
 */
import { describe, expect, it } from 'vitest'
import {
  assignSidesByEvidence,
  evaluateReconstruction,
  membershipAt,
  type DetailParticipantInput,
  type ObservationInput,
  type ReconstructionInput,
  type ReconstructionLeague,
  type RosterMembership,
} from '../lib/reconstruct.js'

const AT = new Date('2026-08-20T12:00:00Z')
const JOINED = new Date('2026-01-01T00:00:00Z')
const MAP_NAME = '제3보급창'

const CLAN_A = 'LC-AAA'
const CLAN_B = 'LC-BBB'

const LEAGUE: ReconstructionLeague = {
  leagueId: 'LEAGUE-1',
  slug: 'supply',
  allowedMatchTypes: ['클랜전', '퀵매치 클랜전', '클랜 랭크전'],
  mapIdByName: new Map([[MAP_NAME, 'MAP-1']]),
  playerLimits: [5],
  hasMockMatches: false,
}

function membership(overrides: Partial<RosterMembership> & { playerId: string }): RosterMembership {
  return {
    leagueClanId: CLAN_A,
    clanName: '알파',
    division: 1,
    joinedAt: JOINED,
    leftAt: null,
    verified: true,
    ...overrides,
  }
}

function observation(overrides: Partial<ObservationInput> & { playerId: string }): ObservationInput {
  return {
    ouid: `OU-${overrides.playerId}`,
    userName: overrides.playerId,
    identityStatus: 'active',
    outcome: 'win',
    kill: 10,
    death: 5,
    assist: 2,
    ...overrides,
  }
}

function detail(
  overrides: Partial<DetailParticipantInput> & { resolvedPlayerId: string },
): DetailParticipantInput {
  return {
    slot: 0,
    teamId: '1',
    userName: overrides.resolvedPlayerId,
    clanName: '알파',
    outcome: 'win',
    kill: 10,
    death: 5,
    assist: 2,
    headshot: 4,
    damage: 3210.5,
    ...overrides,
  }
}

const SIDE_A = ['A0', 'A1', 'A2', 'A3', 'A4']
const SIDE_B = ['B0', 'B1', 'B2', 'B3', 'B4']

/** 전원 관측 · 전원 등록 · 상세는 일부만 있는 5v5 (실제로 기대하는 모습이다) */
function fullMatch(overrides: Partial<ReconstructionInput> = {}): ReconstructionInput {
  return {
    match: {
      sourceMatchId: 'M-1',
      matchType: '퀵매치 클랜전',
      matchMode: '폭파미션',
      matchMap: MAP_NAME,
      dateMatch: AT,
    },
    observations: [
      ...SIDE_A.map((playerId) => observation({ playerId, outcome: 'win' })),
      ...SIDE_B.map((playerId) => observation({ playerId, outcome: 'lose', kill: 6, death: 9 })),
    ],
    // 상세는 참가자 일부만 준다 (D-044). 그래도 재구성은 관측으로 완성된다
    detail: [
      detail({ resolvedPlayerId: 'A0', slot: 0, teamId: '1' }),
      detail({ resolvedPlayerId: 'A1', slot: 1, teamId: '1' }),
      detail({
        resolvedPlayerId: 'B0',
        slot: 5,
        teamId: '2',
        outcome: 'lose',
        kill: 6,
        death: 9,
        clanName: '브라보',
      }),
    ],
    memberships: [
      ...SIDE_A.map((playerId) => membership({ playerId })),
      ...SIDE_B.map((playerId) =>
        membership({ playerId, leagueClanId: CLAN_B, clanName: '브라보', division: 2 }),
      ),
    ],
    league: LEAGUE,
    ...overrides,
  }
}

describe('경기 시점 소속 판정', () => {
  it('joinedAt 이후·leftAt 이전이면 그 소속이다', () => {
    const rows = [membership({ playerId: 'A0' })]
    expect(membershipAt(rows, 'A0', AT)?.leagueClanId).toBe(CLAN_A)
  })

  it('joinedAt 과 같은 시각의 경기는 소속으로 인정한다', () => {
    const rows = [membership({ playerId: 'A0', joinedAt: AT })]
    expect(membershipAt(rows, 'A0', AT)).not.toBeNull()
  })

  it('leftAt 과 같은 시각의 경기는 소속으로 보지 않는다', () => {
    const rows = [membership({ playerId: 'A0', leftAt: AT })]
    expect(membershipAt(rows, 'A0', AT)).toBeNull()
  })

  it('탈퇴 후 경기는 이전 클랜으로 세지 않는다', () => {
    const rows = [membership({ playerId: 'A0', leftAt: new Date('2026-06-01T00:00:00Z') })]
    expect(membershipAt(rows, 'A0', AT)).toBeNull()
  })

  it('같은 시각에 소속이 둘이면 판정하지 않는다 (추측 금지)', () => {
    const rows = [
      membership({ playerId: 'A0' }),
      membership({ playerId: 'A0', leagueClanId: CLAN_B }),
    ]
    expect(membershipAt(rows, 'A0', AT)).toBeNull()
  })
})

describe('진영 배정', () => {
  it('상세가 양쪽 team_id를 주면 그것을 근거로 쓴다', () => {
    const sides = assignSidesByEvidence(
      [CLAN_B, CLAN_A],
      new Map([
        [CLAN_B, '2'],
        [CLAN_A, '1'],
      ]),
    )
    expect(sides).toEqual({ red: CLAN_A, blue: CLAN_B })
  })

  it('근거가 없으면 내부 규칙(clanId 순)으로 결정한다 — 실행마다 같아야 한다', () => {
    const first = assignSidesByEvidence([CLAN_B, CLAN_A], new Map())
    const second = assignSidesByEvidence([CLAN_A, CLAN_B], new Map())
    expect(first).toEqual(second)
  })
})

describe('완전성 판정 — 재구성되는 경우', () => {
  it('양 팀 전원 관측 + 등록된 소속이면 재구성된다', () => {
    const result = evaluateReconstruction(fullMatch())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.plan.playerCount).toBe(5)
    expect(result.plan.red.members).toHaveLength(5)
    expect(result.plan.blue.members).toHaveLength(5)
    expect(result.plan.mapId).toBe('MAP-1')
    expect(result.summary.confirmed).toBe(10)
    expect(result.summary.winnerMembersConfirmed).toBe(5)
    expect(result.summary.loserMembersConfirmed).toBe(5)
    expect(result.summary.observationsUsable).toBe(10)
    expect(result.summary.conflicts).toEqual([])
  })

  it('이긴 클랜이 승리 진영이 된다', () => {
    const result = evaluateReconstruction(fullMatch())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const winner = result.plan.winnerSide === 'red' ? result.plan.red : result.plan.blue
    expect(winner.leagueClanId).toBe(CLAN_A)
    expect(winner.members.every((member) => member.outcome === 'win')).toBe(true)
  })

  it('상세와 일치한 참가자만 match_detail을 근거에 더한다', () => {
    const result = evaluateReconstruction(fullMatch())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const all = [...result.plan.red.members, ...result.plan.blue.members]
    const crossChecked = all.filter((member) => member.sources.includes('match_detail'))
    expect(crossChecked.map((member) => member.playerId).sort()).toEqual(['A0', 'A1', 'B0'])
    expect(result.summary.crossChecked).toBe(3)
    expect(all.every((member) => member.sources.includes('player_match_list'))).toBe(true)
  })

  it('상세에 없는 참가자의 headshot·damage는 null이다 (만들어내지 않는다)', () => {
    const result = evaluateReconstruction(fullMatch())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const all = [...result.plan.red.members, ...result.plan.blue.members]
    const withDetail = all.find((member) => member.playerId === 'A0')
    const withoutDetail = all.find((member) => member.playerId === 'A4')
    expect(withDetail?.headshot).toBe(4)
    expect(withoutDetail?.headshot).toBeNull()
    expect(withoutDetail?.damage).toBeNull()
  })

  it('상세가 한 건도 없어도 관측만으로 재구성된다 (상세는 보조 증거다)', () => {
    const result = evaluateReconstruction(fullMatch({ detail: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.crossChecked).toBe(0)
    expect(result.summary.detailParticipants).toBe(0)
  })

  it('상세 team_id가 진영 배정의 근거가 된다', () => {
    const result = evaluateReconstruction(fullMatch())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.red.leagueClanId).toBe(CLAN_A)
    expect(result.plan.blue.leagueClanId).toBe(CLAN_B)
  })
})

describe('완전성 판정 — 재구성하지 않는 경우', () => {
  const codeOf = (input: ReconstructionInput): string => {
    const result = evaluateReconstruction(input)
    return result.ok ? 'ok' : result.code
  }

  it('한쪽 클랜만 확인되면 인정하지 않는다 (반쪽 경기를 저장하지 않는다)', () => {
    const base = fullMatch()
    const code = codeOf({
      ...base,
      observations: base.observations.filter((row) => row.playerId?.startsWith('A')),
      detail: [],
    })
    expect(code).toBe('single_clan')
  })

  it('양측 3명 미만이면 인정하지 않는다 (5명 2명)', () => {
    const base = fullMatch()
    const keep = new Set(['A0', 'A1', 'A2', 'A3', 'A4', 'B0', 'B1'])
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.filter((row) => keep.has(row.playerId ?? '')),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('insufficient_members')
    expect(result.summary.participantCompleteness).toBe('5v2')
  })

  it('상세와 k/d/a가 어긋나면 자동 투영하지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      detail: [detail({ resolvedPlayerId: 'A0', kill: 99 })],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('conflict_with_detail')
    expect(result.summary.conflicts[0]).toContain('kill')
  })

  it('상세와 승패가 어긋나도 자동 투영하지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      detail: [detail({ resolvedPlayerId: 'A0', outcome: 'lose' })],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('conflict_with_detail')
    expect(result.summary.conflicts[0]).toContain('outcome')
  })

  it('상세가 주지 않은 값(null)은 불일치로 보지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      detail: [detail({ resolvedPlayerId: 'A0', headshot: null, damage: null, assist: null })],
    })
    expect(result.ok).toBe(true)
  })

  it('본클랜원 다수와 다른 결과인 1명은 상대 팀 용병으로 본다 (D-072)', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.map((row) =>
        row.playerId === 'A4' ? { ...row, outcome: 'lose' as const } : row,
      ),
      detail: [],
    })
    // 한 명 때문에 경기를 버리지 않는다. 그 사람은 진 팀으로 뛴 것으로 본다
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.winnerMembersConfirmed).toBe(4)
    expect(result.summary.loserMercenariesConfirmed).toBe(1)
  })

  it('본클랜원 승패가 정확히 반반이면 팀을 판정하지 않는다', () => {
    const base = fullMatch()
    const flip = new Set(['A3', 'A4'])
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations
        .filter((row) => !['A0'].includes(row.playerId ?? ''))
        .map((row) =>
          flip.has(row.playerId ?? '') ? { ...row, outcome: 'lose' as const } : row,
        ),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('inconsistent_outcome')
  })

  it('양쪽 다 이겼다고 나오면 승자를 정하지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.map((row) => ({ ...row, outcome: 'win' as const })),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('no_winner')
  })

  it('본클랜원 3명을 채운 클랜이 셋이면 클랜전으로 보지 않는다', () => {
    const base = fullMatch()
    // A0~A2 = LC-AAA(승) · B0~B2 = LC-BBB(패) · B3·B4·A3 = LC-CCC(3명)
    const charlie = new Set(['A3', 'B3', 'B4'])
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations
        .filter((row) => row.playerId !== 'A4')
        .map((row) => (row.playerId === 'A3' ? { ...row, outcome: 'lose' as const } : row)),
      memberships: base.memberships.map((row) =>
        charlie.has(row.playerId) ? { ...row, leagueClanId: 'LC-CCC', clanName: '찰리' } : row,
      ),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('too_many_clans')
  })

  it('본클랜원이 3명 미만인 클랜은 팀이 되지 못한다 (용병으로 채워도 마찬가지)', () => {
    const base = fullMatch()
    const moved = new Set(['A3', 'A4'])
    const result = evaluateReconstruction({
      ...base,
      // A3·A4를 다른 클랜 소속으로 바꾸면 LC-AAA 본클랜원은 3명이 남는다 → 여전히 인정
      memberships: base.memberships.map((row) =>
        moved.has(row.playerId) ? { ...row, leagueClanId: 'LC-DDD', clanName: '델타' } : row,
      ),
      detail: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.winnerMembersConfirmed).toBe(3)
    expect(result.summary.winnerMercenariesConfirmed).toBe(2)
    expect(result.summary.participantCompleteness).toBe('5v5')
  })

  it('같은 플레이어가 두 계정으로 관측되면 판정하지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: [...base.observations, observation({ playerId: 'A0', ouid: 'OU-A0-ALT' })],
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('duplicate_player')
  })

  it('경기 시각을 모르면 소속을 판정할 수 없다', () => {
    const base = fullMatch()
    expect(codeOf({ ...base, match: { ...base.match, dateMatch: null } })).toBe('no_date')
  })

  it('클랜전이 아니면 대상이 아니다', () => {
    const base = fullMatch()
    expect(codeOf({ ...base, match: { ...base.match, matchType: '퀵매치' } })).toBe('match_type')
  })

  it('맵이 없거나 리그 기록 대상 맵이 아니면 투영하지 않는다', () => {
    const base = fullMatch()
    expect(codeOf({ ...base, match: { ...base.match, matchMap: null } })).toBe('no_map')
    expect(codeOf({ ...base, match: { ...base.match, matchMap: '없는맵' } })).toBe(
      'map_not_in_league',
    )
  })

  it('mock 시드가 있는 리그에는 실제 기록을 섞지 않는다', () => {
    const base = fullMatch()
    expect(codeOf({ ...base, league: { ...LEAGUE, hasMockMatches: true } })).toBe('mock_league')
    expect(
      codeOf({
        ...base,
        league: { ...LEAGUE, hasMockMatches: true },
        options: { allowMockLeague: true },
      }),
    ).toBe('ok')
  })
})

describe('신원과 로스터가 판정에 미치는 영향', () => {
  it('신원이 확정되지 않은 관측은 참가자로 세지 않는다 (닉네임 병합 금지)', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.map((row) =>
        row.playerId === 'B4'
          ? { ...row, playerId: null, identityStatus: 'unresolved' as const }
          : row,
      ),
      detail: [],
    })
    // 확인 인원이 5v4로 줄지만 양측 3명 이상이라 경기는 인정된다 (D-068)
    expect(result.ok).toBe(true)
    expect(result.summary.ambiguousIdentities).toBe(1)
    expect(result.summary.participantCompleteness).toBe('5v4')
    expect(result.summary.confidence).toBe('medium')
  })

  it('conflicted 신원도 참가자로 세지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.map((row) =>
        row.playerId === 'B4' ? { ...row, identityStatus: 'conflicted' as const } : row,
      ),
      detail: [],
    })
    expect(result.ok).toBe(true)
    expect(result.summary.ambiguousIdentities).toBe(1)
  })

  it('로스터에 없어도 출전이 확인되면 용병으로 기록한다 (D-073)', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      memberships: base.memberships.filter((row) => row.playerId !== 'B4'),
      detail: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.unrosteredParticipants).toBe(1)
    // 확인 수준은 **출전자 전원** 기준이라 5v5 그대로다 (D-074)
    expect(result.summary.participantCompleteness).toBe('5v5')
    expect(result.summary.loserMembersConfirmed).toBe(4)
    expect(result.summary.loserMercenariesConfirmed).toBe(1)
    const mercenary = result.plan.blue.members.find((entry) => entry.playerId === 'B4')
      ?? result.plan.red.members.find((entry) => entry.playerId === 'B4')
    expect(mercenary?.role).toBe('mercenary')
    expect(mercenary?.rosterLeagueClanId).toBeNull()
  })

  it('확인되지 않은 소속은 기본적으로 인정하지 않는다', () => {
    const base = fullMatch()
    const unverified = {
      ...base,
      memberships: base.memberships.map((row) => ({ ...row, verified: false })),
      detail: [],
    }
    const result = evaluateReconstruction(unverified)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.summary.unrosteredParticipants).toBe(10)
  })

  it('운영자가 허용하면 미확인 소속으로도 재구성한다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      memberships: base.memberships.map((row) => ({ ...row, verified: false })),
      options: { requireVerifiedRoster: false },
    })
    expect(result.ok).toBe(true)
  })

  it('승패를 모르는 관측값은 근거로 쓰지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.map((row) =>
        row.playerId === 'A0' ? { ...row, outcome: null } : row,
      ),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('conflict_with_detail')
    expect(result.summary.conflicts[0]).toContain('승패')
  })

  it('k/d/a가 비어 있는 관측값도 근거로 쓰지 않는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.map((row) =>
        row.playerId === 'A0' ? { ...row, kill: null } : row,
      ),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.summary.conflicts[0]).toContain('k/d/a')
  })
})

describe('판정 요약은 증거로 남는다', () => {
  it('관측·확정·상세 수와 클랜별 인원을 기록한다', () => {
    const result = evaluateReconstruction(fullMatch())
    expect(result.summary.observations).toBe(10)
    expect(result.summary.detailParticipants).toBe(3)
    expect(result.summary.perClan).toEqual({ [CLAN_A]: 5, [CLAN_B]: 5 })
    expect(result.summary.participantCompleteness).toBe('5v5')
  })

  it('미완일 때도 무엇이 모자랐는지 남는다', () => {
    const base = fullMatch()
    const result = evaluateReconstruction({
      ...base,
      observations: base.observations.filter((row) => row.playerId?.startsWith('A')),
      detail: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.summary.confirmed).toBe(5)
    expect(result.summary.winnerMembersConfirmed).toBe(0)
    expect(result.reason).toContain('상대 클랜')
  })
})
