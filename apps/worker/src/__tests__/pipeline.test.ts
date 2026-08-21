import { describe, expect, it } from 'vitest'
import {
  allocateInternalMatchId,
  buildInternalMatchId,
  internalMatchIdPrefix,
} from '../lib/internalMatchId.js'
import { isRefreshDue, refreshDueAt, staleSince } from '../lib/freshness.js'
import {
  buildCandidateKey,
  planIdentityObservation,
  resolveParticipant,
  type IdentityRow,
} from '../lib/identity.js'
import {
  assignSides,
  evaluateProjection,
  type LeagueProfile,
  type ProjectionMatch,
  type ProjectionParticipant,
} from '../lib/projectionRule.js'
import { parseEnvFile } from '../lib/env.js'

/* --------------------------------------------------------------- 내부 ID --- */

describe('내부 매치 ID', () => {
  it('KST 기준 YYMMDDHHmmss + 6자리이며 계약(18자리 숫자)을 만족한다', () => {
    // 2026-08-01T05:12:33Z = KST 2026-08-01 14:12:33
    const id = buildInternalMatchId(internalMatchIdPrefix(new Date('2026-08-01T05:12:33Z')), 1)
    expect(id).toBe('260801141233000001')
    expect(id).toMatch(/^\d{18}$/)
  })

  it('넥슨 match_id를 내부 ID로 쓰지 않는다 — 같은 초면 일련번호를 올린다', async () => {
    const taken = new Set(['260801141233000001', '260801141233000002'])
    const id = await allocateInternalMatchId(new Date('2026-08-01T05:12:33Z'), async (candidate) =>
      taken.has(candidate),
    )
    expect(id).toBe('260801141233000003')
  })
})

/* --------------------------------------------------------------- 신선도 --- */

describe('신선도 정책', () => {
  const base = new Date('2026-08-01T00:00:00Z')

  it('주기는 설정값이다 (코드에 30일을 박지 않는다)', () => {
    expect(refreshDueAt(base, 30).toISOString()).toBe('2026-08-31T00:00:00.000Z')
    expect(refreshDueAt(base, 7).toISOString()).toBe('2026-08-08T00:00:00.000Z')
  })

  it('기한이 지나야 갱신 대상이다', () => {
    const due = refreshDueAt(base, 30)
    expect(isRefreshDue(due, new Date('2026-08-30T00:00:00Z'))).toBe(false)
    expect(isRefreshDue(due, new Date('2026-09-01T00:00:00Z'))).toBe(true)
    expect(isRefreshDue(null, new Date())).toBe(false)
  })

  it('기한을 넘기면 넘긴 시각을 남긴다', () => {
    const now = new Date('2026-09-02T00:00:00Z')
    expect(staleSince(refreshDueAt(base, 30), now)).toEqual(now)
    expect(staleSince(refreshDueAt(base, 90), now)).toBeNull()
  })
})

/* ----------------------------------------------------------------- 신원 --- */

describe('신원 판단', () => {
  const observedAt = new Date('2026-08-01T00:00:00Z')

  it('처음 보는 ouid는 unresolved로 만들고 자동 연결하지 않는다', () => {
    const plan = planIdentityObservation({
      ouid: 'OU-NEW',
      userName: '홍길동',
      existing: null,
      sameNicknameIdentities: [],
      observedAt,
    })
    expect(plan.createIdentity).toBe(true)
    expect(plan.autoLink).toBe(false)
    expect(plan.candidates).toHaveLength(0)
  })

  it('닉네임이 같고 이미 연결된 다른 ouid가 있으면 **후보만** 만든다 (ouid 변경 가능성)', () => {
    const plan = planIdentityObservation({
      ouid: 'OU-NEW',
      userName: '홍길동',
      existing: null,
      sameNicknameIdentities: [
        { ouid: 'OU-OLD', playerId: 'player-1', status: 'active', userName: '홍길동' },
      ],
      observedAt,
    })
    expect(plan.autoLink).toBe(false)
    expect(plan.candidates).toHaveLength(1)
    expect(plan.candidates[0]).toMatchObject({
      reason: 'ouid_change',
      targetOuid: 'OU-OLD',
      targetPlayerId: 'player-1',
    })
  })

  it('이름이 같은 플레이어가 둘 이상이면 후보조차 만들지 않는다', () => {
    const plan = planIdentityObservation({
      ouid: 'OU-NEW',
      userName: '홍길동',
      existing: null,
      sameNicknameIdentities: [],
      playerIdsWithSameName: ['player-1', 'player-2'],
      observedAt,
    })
    expect(plan.candidates).toHaveLength(0)
  })

  it('이름이 같은 플레이어가 하나면 약한 근거의 후보를 만든다 (연결은 하지 않는다)', () => {
    const plan = planIdentityObservation({
      ouid: 'OU-NEW',
      userName: '홍길동',
      existing: null,
      sameNicknameIdentities: [],
      playerIdsWithSameName: ['player-1'],
      observedAt,
    })
    expect(plan.candidates[0]).toMatchObject({ reason: 'nickname_match', targetPlayerId: 'player-1' })
  })

  it('후보 키는 NULL 없이 만들어진다 (중복 후보 방지)', () => {
    expect(
      buildCandidateKey({
        ouid: 'OU-1',
        targetPlayerId: null,
        targetOuid: 'OU-2',
        reason: 'ouid_change',
      }),
    ).toBe('OU-1|-|OU-2|ouid_change')
  })

  it('참가자 해석은 연결된 신원만 근거로 쓴다', () => {
    const identities: IdentityRow[] = [
      { ouid: 'OU-1', playerId: 'player-1', status: 'active', userName: '홍길동' },
      { ouid: 'OU-2', playerId: null, status: 'unresolved', userName: '홍길동' },
    ]
    expect(resolveParticipant('홍길동', identities)).toEqual({
      status: 'resolved',
      playerId: 'player-1',
      ouid: 'OU-1',
    })
    expect(resolveParticipant('임꺽정', identities).status).toBe('unresolved')
  })

  it('연결된 신원이 둘이면 하나를 고르지 않는다', () => {
    const identities: IdentityRow[] = [
      { ouid: 'OU-1', playerId: 'player-1', status: 'active', userName: '홍길동' },
      { ouid: 'OU-2', playerId: 'player-2', status: 'active', userName: '홍길동' },
    ]
    expect(resolveParticipant('홍길동', identities).status).toBe('ambiguous')
  })
})

/* ----------------------------------------------------------------- 투영 --- */

function participant(overrides: Partial<ProjectionParticipant>): ProjectionParticipant {
  return {
    slot: 0,
    teamId: '1',
    userName: '가가',
    clanName: '알파클랜',
    outcome: 'win',
    resolvedPlayerId: 'p0',
    kill: 10,
    death: 5,
    assist: 2,
    headshot: 3,
    damage: 1200.5,
    ...overrides,
  }
}

function clanMatch(overrides: Partial<ProjectionMatch> = {}): ProjectionMatch {
  const red = Array.from({ length: 5 }, (_, index) =>
    participant({
      slot: index,
      teamId: '1',
      clanName: '알파클랜',
      outcome: 'win',
      resolvedPlayerId: `r${index}`,
      userName: `레드${index}`,
    }),
  )
  const blue = Array.from({ length: 5 }, (_, index) =>
    participant({
      slot: index + 5,
      teamId: '2',
      clanName: '브라보클랜',
      outcome: 'lose',
      resolvedPlayerId: `b${index}`,
      userName: `블루${index}`,
    }),
  )
  return {
    sourceMatchId: 'AAAA-1111',
    matchType: '클랜전',
    matchMap: '제3보급창고',
    dateMatch: new Date('2026-08-01T05:12:33Z'),
    participants: [...red, ...blue],
    ...overrides,
  }
}

function league(overrides: Partial<LeagueProfile> = {}): LeagueProfile {
  return {
    leagueId: 'league-1',
    slug: 'supply',
    allowedMatchTypes: ['클랜전', '퀵매치 클랜전', '클랜 랭크전'],
    mapIdByName: new Map([['제3보급창고', 'map-1']]),
    playerLimits: [5, 6],
    leagueClanByClanName: new Map([
      ['알파클랜', { leagueClanId: 'lc-red', clanId: 'clan-red', division: 1 }],
      ['브라보클랜', { leagueClanId: 'lc-blue', clanId: 'clan-blue', division: 2 }],
    ]),
    hasMockMatches: false,
    ...overrides,
  }
}

describe('투영 규칙', () => {
  it('조건을 전부 만족하면 투영 계획을 만든다', () => {
    const result = evaluateProjection(clanMatch(), league())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan).toMatchObject({
      leagueId: 'league-1',
      mapId: 'map-1',
      playerCount: 5,
      winnerSide: 'red',
    })
    // 경기 시점 부리그 스냅샷을 담는다 (현재 값을 나중에 다시 읽지 않는다)
    expect(result.plan.red.division).toBe(1)
    expect(result.plan.blue.division).toBe(2)
  })

  it('진영 배정은 team_id 오름차순으로 결정적이다', () => {
    expect(assignSides(['2', '1'])).toEqual({ red: '1', blue: '2' })
    expect(assignSides(['1'])).toBeNull()
  })

  it('mock 시드가 있는 리그에는 투영하지 않는다', () => {
    const result = evaluateProjection(clanMatch(), league({ hasMockMatches: true }))
    expect(result).toMatchObject({ ok: false, code: 'mock_league' })
  })

  it('--allow-mock-league 로만 우회한다', () => {
    const result = evaluateProjection(clanMatch(), league({ hasMockMatches: true }), {
      allowMockLeague: true,
    })
    expect(result.ok).toBe(true)
  })

  it('리그가 인정하지 않는 매치 유형은 보류한다 (원본은 그대로 둔다)', () => {
    const result = evaluateProjection(clanMatch({ matchType: '일반전' }), league())
    expect(result).toMatchObject({ ok: false, code: 'match_type' })
  })

  it('리그 기록 대상 맵이 아니면 보류한다', () => {
    const result = evaluateProjection(clanMatch({ matchMap: '창고' }), league())
    expect(result).toMatchObject({ ok: false, code: 'map_not_in_league' })
  })

  it('리그 소속이 아닌 클랜은 보류한다', () => {
    const result = evaluateProjection(
      clanMatch(),
      league({
        leagueClanByClanName: new Map([
          ['알파클랜', { leagueClanId: 'lc-red', clanId: 'clan-red', division: 1 }],
        ]),
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'clan_not_in_league' })
  })

  it('대전 인원이 리그 설정과 다르면 보류한다', () => {
    const result = evaluateProjection(clanMatch(), league({ playerLimits: [6] }))
    expect(result).toMatchObject({ ok: false, code: 'player_limit' })
  })

  it('해석되지 않은 참가자가 하나라도 있으면 부분 저장하지 않는다', () => {
    const base = clanMatch()
    const participants = [...base.participants]
    participants[0] = participant({ ...participants[0]!, resolvedPlayerId: null })
    const result = evaluateProjection({ ...base, participants }, league())
    expect(result).toMatchObject({ ok: false, code: 'unresolved_participants' })
  })

  it('킬·데스·어시스트가 없으면 0으로 채우지 않고 보류한다', () => {
    const base = clanMatch()
    const participants = [...base.participants]
    participants[3] = participant({ ...participants[3]!, kill: null })
    const result = evaluateProjection({ ...base, participants }, league())
    expect(result).toMatchObject({ ok: false, code: 'missing_kda' })
  })

  it('승패를 판정할 수 없으면 보류한다', () => {
    const base = clanMatch()
    const participants = base.participants.map((entry) =>
      participant({ ...entry, outcome: 'draw' }),
    )
    const result = evaluateProjection({ ...base, participants }, league())
    expect(result).toMatchObject({ ok: false, code: 'no_winner' })
  })

  it('경기 시각을 모르면 보류한다', () => {
    const result = evaluateProjection(clanMatch({ dateMatch: null }), league())
    expect(result).toMatchObject({ ok: false, code: 'no_date' })
  })
})

/* ------------------------------------------------------------------ env --- */

describe('.env 파서', () => {
  it('따옴표와 주석을 처리한다', () => {
    const parsed = parseEnvFile(['# 주석', 'A=1', 'B="두 번째"', "C='셋'", '', 'D'].join('\n'))
    expect(parsed).toEqual({ A: '1', B: '두 번째', C: '셋' })
  })
})
