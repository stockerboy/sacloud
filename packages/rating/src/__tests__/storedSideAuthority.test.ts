/**
 * **미러 경기는 저장된 진영을 쓴다** 회귀 (D-180).
 *
 * 왜 이 파일이 있나 — `evaluateEligibility` 는 원래 참가자 원소속 다수결을
 * 저장된 진영 클랜보다 **우선**했다 (D-133). 그 다수결의 입력은 미러 참가행의
 * 41%가 비어 있어서, 5명 중 4명이 소속 불명이면 **남은 한 명이 팀 이름을 정했다.**
 * 그렇게 정해진 두 클랜이 `Match` 의 red/blue 와 달라지면 replay 가 그 경기를
 * `side_clan_mismatch` 로 **클랜 래더에서만** 뺐다 (개인은 이미 들어간 뒤였다).
 *
 * 여기서 고정하는 약속
 *   1. `authority: 'primary'` 면 다수결이 무엇을 뽑든 **저장된 진영이 이긴다**
 *   2. 기본값(`fallback`)은 D-133 그대로다 — 다수결이 먼저다
 *   3. `primary` 라도 반쪽이거나 양쪽이 같은 클랜이면 정본이 될 수 없다 → 다수결로 내려간다
 *   4. `primary` 가 승/패 그룹·참가 인원·5v5 판정을 바꾸지 않는다
 */
import { describe, expect, it } from 'vitest'
import {
  evaluateEligibility,
  rateMatch,
  type ConfirmedParticipant,
  type SideEvidence,
} from '../index'

const STORED: SideEvidence = {
  winnerLeagueClanId: 'stored-w',
  loserLeagueClanId: 'stored-l',
  source: 'stored-match',
  authority: 'primary',
}

function p(
  id: string,
  outcome: 'win' | 'lose',
  over: Partial<ConfirmedParticipant> = {},
): ConfirmedParticipant {
  return {
    playerId: id,
    rosterLeagueClanId: null,
    detailLeagueClanId: null,
    outcome,
    kill: 5,
    death: 5,
    assist: 0,
    sources: ['player_match_list'],
    ...over,
  }
}

/** 5v5 한 경기 — 양 팀에서 `rosterWinner`/`rosterLoser` 를 가진 인원 수를 정한다 */
function squad(rosterWinner: (string | null)[], rosterLoser: (string | null)[]): ConfirmedParticipant[] {
  return [
    ...rosterWinner.map((clan, i) => p(`w${i}`, 'win', { rosterLeagueClanId: clan })),
    ...rosterLoser.map((clan, i) => p(`l${i}`, 'lose', { rosterLeagueClanId: clan })),
  ]
}

const FIVE_NULL = [null, null, null, null, null]

describe('미러 경기 — 저장된 진영이 정본이다', () => {
  it('한 명의 원소속이 팀 이름을 바꾸지 못한다 (조사 표본 B 의 형태)', () => {
    /* 진 팀 5명 중 1명만 소속이 있고 그 클랜이 기록과 다르다.
       예전에는 이 한 명이 팀 이름을 정해 경기가 통째로 래더에서 빠졌다 */
    const result = evaluateEligibility({
      participants: squad(
        ['stored-w', null, null, null, null],
        ['other-clan', null, null, null, null],
      ),
      sideEvidence: STORED,
    })
    expect(result.winnerSide?.leagueClanId).toBe('stored-w')
    expect(result.loserSide?.leagueClanId).toBe('stored-l')
    expect(result.sideEvidenceUsed).toBe('stored-match')
  })

  it('양 팀 다수결이 서로 다른 클랜을 뽑아도 저장된 진영이 이긴다', () => {
    const result = evaluateEligibility({
      participants: squad(
        ['merc-a', 'merc-a', 'merc-a', null, null],
        ['merc-b', 'merc-b', 'merc-b', null, null],
      ),
      sideEvidence: STORED,
    })
    expect(result.winnerSide?.leagueClanId).toBe('stored-w')
    expect(result.loserSide?.leagueClanId).toBe('stored-l')
  })

  it('매치 상세 클랜명(`detailLeagueClanId`)보다도 저장된 진영이 앞선다', () => {
    const result = evaluateEligibility({
      participants: [
        p('a', 'win', { detailLeagueClanId: 'detail-w' }),
        p('b', 'lose', { detailLeagueClanId: 'detail-l' }),
      ],
      sideEvidence: STORED,
    })
    expect(result.winnerSide?.leagueClanId).toBe('stored-w')
    expect(result.loserSide?.leagueClanId).toBe('stored-l')
  })

  it('rateMatch 가 돌려주는 클랜이 저장된 red/blue 와 같다 — replay 가 경기를 빼지 않는다', () => {
    /* `rate.ts` 는 `rated.clans` 에서 red/blue 를 못 찾으면 `side_clan_mismatch` 로 뺀다.
       그 조건이 다시는 미러 경기에서 성립하지 않아야 한다 */
    const rated = rateMatch({
      participants: squad(
        ['merc-a', 'merc-a', 'merc-a', null, null],
        ['merc-b', 'merc-b', 'merc-b', null, null],
      ),
      sideEvidence: STORED,
      clanRatings: { 'stored-w': 3000, 'stored-l': 3000 },
    })
    expect(rated.eligibility.ratingEligible).toBe(true)
    expect(rated.clans.map((c) => c.leagueClanId).sort()).toEqual(['stored-l', 'stored-w'])
  })

  it('승/패 그룹과 참가 인원은 그대로다 — 이름표만 바뀐다', () => {
    const result = evaluateEligibility({
      participants: squad(['merc-a', 'merc-a', 'merc-a', null, null], FIVE_NULL),
      sideEvidence: STORED,
    })
    expect(result.completeness).toBe('5v5')
    expect(result.assigned).toHaveLength(10)
    expect(result.assigned.filter((a) => a.outcome === 'win')).toHaveLength(5)
    // 기록 클랜 소속이 한 명도 없으므로 전원 용병이다 (역할 판정은 그대로다)
    expect(result.winnerSide?.members).toBe(0)
    expect(result.winnerSide?.mercenaries).toBe(5)
  })
})

describe('넥슨 경기의 규칙은 그대로다 (D-133)', () => {
  it('authority 를 주지 않으면 다수결이 먼저다', () => {
    const result = evaluateEligibility({
      participants: squad(
        ['merc-a', 'merc-a', 'merc-a', null, null],
        ['merc-b', 'merc-b', 'merc-b', null, null],
      ),
      sideEvidence: { ...STORED, authority: undefined },
    })
    expect(result.winnerSide?.leagueClanId).toBe('merc-a')
    expect(result.loserSide?.leagueClanId).toBe('merc-b')
    expect(result.sideEvidenceUsed).toBeNull()
  })

  it("authority: 'fallback' 도 마찬가지다", () => {
    const result = evaluateEligibility({
      participants: squad(
        ['merc-a', 'merc-a', 'merc-a', null, null],
        ['merc-b', 'merc-b', 'merc-b', null, null],
      ),
      sideEvidence: { ...STORED, authority: 'fallback' },
    })
    expect(result.winnerSide?.leagueClanId).toBe('merc-a')
  })

  it('fallback 은 다수결이 실패했을 때만 쓰인다 — 예전 동작 그대로', () => {
    const result = evaluateEligibility({
      participants: squad(FIVE_NULL, FIVE_NULL),
      sideEvidence: { ...STORED, authority: 'fallback' },
    })
    expect(result.winnerSide?.leagueClanId).toBe('stored-w')
    expect(result.sideEvidenceUsed).toBe('stored-match')
  })
})

describe('primary 라도 정본이 될 수 없는 경우', () => {
  it('한쪽이 비어 있으면 다수결로 내려간다', () => {
    const result = evaluateEligibility({
      participants: squad(
        ['merc-a', 'merc-a', 'merc-a', null, null],
        ['merc-b', 'merc-b', 'merc-b', null, null],
      ),
      sideEvidence: { ...STORED, loserLeagueClanId: null },
    })
    expect(result.winnerSide?.leagueClanId).toBe('merc-a')
    expect(result.loserSide?.leagueClanId).toBe('merc-b')
  })

  it('양 진영이 같은 클랜이면 정본으로 쓰지 않는다', () => {
    const result = evaluateEligibility({
      participants: squad(
        ['merc-a', 'merc-a', 'merc-a', null, null],
        ['merc-b', 'merc-b', 'merc-b', null, null],
      ),
      sideEvidence: { ...STORED, loserLeagueClanId: 'stored-w' },
    })
    expect(result.winnerSide?.leagueClanId).toBe('merc-a')
    expect(result.loserSide?.leagueClanId).toBe('merc-b')
  })

  it('저장된 진영이 정본이어도 한쪽 팀만 있으면 기록하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [p('a', 'win'), p('b', 'win')],
      sideEvidence: STORED,
    })
    expect(result.recordable).toBe(false)
    expect(result.status).toBe('single_clan')
  })
})
