/**
 * 라인업 보조 증거 회귀 (D-133).
 *
 * 여기서 고정하는 약속
 *   1. 진영·승패는 `perspectives` 에서 **계산으로** 나온다 (추측하지 않는다)
 *   2. 넥슨 승패와 어긋나면 **보조 증거를 버린다** (넥슨 우선)
 *   3. 겹치는 참가자가 없으면 검증 불가 → 쓰지 않는다
 *   4. 양쪽 클랜이 **둘 다** 우리 리그 클랜으로 연결될 때만 쓴다
 *   5. 보조 증거는 **참가자를 만들지 않는다** — 팀 이름표일 뿐이다
 */
import { describe, expect, it } from 'vitest'
import { evaluateEligibility, type ConfirmedParticipant } from '@sacloud/rating'
import {
  buildLineupSides,
  toSideEvidence,
  verifyAgreement,
  LINEUP_EVIDENCE_SOURCE,
} from '../lib/lineupSideEvidence.js'

const BASE_MATCH = {
  id: '260820000000000001',
  // red = 클랜A 쪽, blue = 클랜B 쪽
  red: [
    [11, '에이1', 1, 0],
    [12, '에이2', 1, 0],
  ] as [number, string, number, number][],
  blue: [
    [21, '비1', 2, 0],
    [22, '비2', 2, 0],
  ] as [number, string, number, number][],
  // 클랜A(=1) 시점: red 진영이고 이겼다 → 승리 진영 red = 클랜A
  perspectives: [{ clan_id: 1, opponent_clan_id: 2, win: true, blue_team: false }],
}

const SNAPSHOT = {
  capturedAt: '2026-08-24T00:00:00.000Z',
  clans: { '1': { name: '클랜A', slug: 'clan-a' }, '2': { name: '클랜B', slug: 'clan-b' } },
  matches: [BASE_MATCH],
} as never

const SLUG_TO_LEAGUE_CLAN = new Map([
  ['clan-a', 'lc-a'],
  ['clan-b', 'lc-b'],
])

function sidesOf() {
  return buildLineupSides(SNAPSHOT).get('260820000000000001')!
}

describe('진영·승패 읽기', () => {
  it('perspectives 로 승리 진영과 양 진영 클랜을 정한다', () => {
    const sides = sidesOf()
    expect(sides.winnerSide).toBe('red')
    expect(sides.winnerClanSlug).toBe('clan-a')
    expect(sides.loserClanSlug).toBe('clan-b')
    expect(sides.sideByNickname.get('에이1')).toBe('red')
    expect(sides.sideByNickname.get('비1')).toBe('blue')
  })

  it('관측 클랜이 진 경우에도 승리 진영이 뒤집히지 않는다', () => {
    const flipped = buildLineupSides({
      capturedAt: '2026-08-24T00:00:00.000Z',
      clans: { '1': { name: '클랜A', slug: 'clan-a' }, '2': { name: '클랜B', slug: 'clan-b' } },
      matches: [
        {
          ...BASE_MATCH,
          perspectives: [{ clan_id: 1, opponent_clan_id: 2, win: false, blue_team: false }],
        },
      ],
    } as never).get('260820000000000001')!
    expect(flipped.winnerSide).toBe('blue')
    expect(flipped.winnerClanSlug).toBe('clan-b')
    expect(flipped.loserClanSlug).toBe('clan-a')
  })

  it('perspectives 가 비면 진영을 만들지 않는다', () => {
    const none = buildLineupSides({
      capturedAt: '2026-08-24T00:00:00.000Z',
      clans: { '1': { name: '클랜A', slug: 'clan-a' }, '2': { name: '클랜B', slug: 'clan-b' } },
      matches: [{ ...BASE_MATCH, perspectives: [] }],
    } as never).get('260820000000000001')!
    expect(none.winnerSide).toBeNull()
    expect(none.winnerClanSlug).toBeNull()
  })
})

describe('넥슨과의 일치 검증 — 넥슨이 우선이다', () => {
  it('전원 일치하면 쓸 수 있다', () => {
    const verdict = verifyAgreement(sidesOf(), [
      { userName: '에이1', outcome: 'win' },
      { userName: '비1', outcome: 'lose' },
    ])
    expect(verdict).toEqual({ agrees: true, checked: 2 })
  })

  it('한 명이라도 어긋나면 **버린다**', () => {
    const verdict = verifyAgreement(sidesOf(), [
      { userName: '에이1', outcome: 'win' },
      { userName: '비1', outcome: 'win' }, // blue 인데 승리로 와 있다
    ])
    expect(verdict.agrees).toBe(false)
    expect(verdict).toMatchObject({ checked: 2, mismatches: 1 })
  })

  it('겹치는 참가자가 없으면 검증 불가 — 쓰지 않는다', () => {
    const verdict = verifyAgreement(sidesOf(), [{ userName: '모르는사람', outcome: 'win' }])
    expect(verdict).toEqual({ agrees: false, checked: 0, mismatches: 0 })
  })

  it('승패가 없는 행은 검증에서 뺀다', () => {
    const verdict = verifyAgreement(sidesOf(), [
      { userName: '에이1', outcome: null },
      { userName: '비1', outcome: 'lose' },
    ])
    expect(verdict).toEqual({ agrees: true, checked: 1 })
  })
})

describe('리그 클랜 연결', () => {
  it('양쪽 다 연결될 때만 보조 증거를 만든다', () => {
    expect(toSideEvidence(sidesOf(), SLUG_TO_LEAGUE_CLAN)).toEqual({
      winnerLeagueClanId: 'lc-a',
      loserLeagueClanId: 'lc-b',
      source: LINEUP_EVIDENCE_SOURCE,
    })
  })

  it('한쪽만 알면 쓰지 않는다 — 반쪽짜리 이름표를 붙이지 않는다', () => {
    expect(toSideEvidence(sidesOf(), new Map([['clan-a', 'lc-a']]))).toBeNull()
  })

  it('양쪽이 같은 리그 클랜으로 오면 쓰지 않는다', () => {
    expect(
      toSideEvidence(sidesOf(), new Map([['clan-a', 'lc-x'], ['clan-b', 'lc-x']])),
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 우선순위 — 넥슨으로 정해지면 보조 증거를 보지 않는다                            */
/* -------------------------------------------------------------------------- */

function participant(
  playerId: string,
  outcome: 'win' | 'lose',
  over: Partial<ConfirmedParticipant> = {},
): ConfirmedParticipant {
  return {
    playerId,
    rosterLeagueClanId: null,
    detailLeagueClanId: null,
    outcome,
    kill: 5,
    death: 5,
    assist: 1,
    sources: ['match_detail'],
    ...over,
  }
}

const EVIDENCE = {
  winnerLeagueClanId: 'lc-evidence-win',
  loserLeagueClanId: 'lc-evidence-lose',
  source: LINEUP_EVIDENCE_SOURCE,
}

describe('보조 증거 우선순위', () => {
  it('넥슨으로 양 팀이 정해지면 **보조 증거를 무시한다**', () => {
    const result = evaluateEligibility({
      participants: [
        participant('p1', 'win', { detailLeagueClanId: 'lc-nexon-win' }),
        participant('p2', 'lose', { detailLeagueClanId: 'lc-nexon-lose' }),
      ],
      sideEvidence: EVIDENCE,
    })
    expect(result.recordable).toBe(true)
    expect(result.winnerSide?.leagueClanId).toBe('lc-nexon-win')
    expect(result.loserSide?.leagueClanId).toBe('lc-nexon-lose')
    expect(result.sideEvidenceUsed).toBeNull()
  })

  it('넥슨이 팀을 못 정하면 보조 증거로 정한다', () => {
    const result = evaluateEligibility({
      participants: [participant('p1', 'win'), participant('p2', 'lose')],
      sideEvidence: EVIDENCE,
    })
    expect(result.recordable).toBe(true)
    expect(result.winnerSide?.leagueClanId).toBe('lc-evidence-win')
    expect(result.sideEvidenceUsed).toBe(LINEUP_EVIDENCE_SOURCE)
  })

  it('넥슨이 양쪽을 같은 클랜으로 판정하면 보조 증거로 푼다', () => {
    const result = evaluateEligibility({
      participants: [
        participant('p1', 'win', { detailLeagueClanId: 'lc-same' }),
        participant('p2', 'lose', { detailLeagueClanId: 'lc-same' }),
      ],
      sideEvidence: EVIDENCE,
    })
    expect(result.recordable).toBe(true)
    expect(result.sideEvidenceUsed).toBe(LINEUP_EVIDENCE_SOURCE)
  })

  it('보조 증거가 있어도 **한쪽 팀만 있으면 기록하지 않는다** — 참가자를 만들지 않는다', () => {
    const result = evaluateEligibility({
      participants: [participant('p1', 'win'), participant('p2', 'win')],
      sideEvidence: EVIDENCE,
    })
    expect(result.recordable).toBe(false)
    expect(result.status).toBe('single_clan')
    expect(result.assigned).toHaveLength(0)
  })

  it('보조 증거가 참가자 수를 늘리지 않는다', () => {
    const withEvidence = evaluateEligibility({
      participants: [participant('p1', 'win'), participant('p2', 'lose')],
      sideEvidence: EVIDENCE,
    })
    expect(withEvidence.assigned).toHaveLength(2)
    expect(withEvidence.completeness).toBe('1v1')
  })
})
