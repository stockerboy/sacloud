import { describe, expect, it } from 'vitest'
import {
  NexonMatchDetailResponse,
  NexonMatchListResponse,
} from '../schemas'
import {
  deriveWinnerTeamId,
  groupByTeam,
  normalizeMatchDetail,
  normalizeMatchList,
  parseNexonDateTime,
  validateMatchDetail,
  type NormalizedParticipant,
} from '../normalize'
import { SAMPLE_MATCH_DETAIL, SAMPLE_MATCH_LIST } from '../fixtures/sample'
import { contentHash, stableStringify } from '../hash'
import { toMatchOutcome } from '../endpoints'

function participant(overrides: Partial<NormalizedParticipant>): NormalizedParticipant {
  return {
    slot: 0,
    teamId: '1',
    matchResult: '1',
    outcome: 'win',
    userName: '가가',
    seasonGrade: null,
    clanName: null,
    kill: null,
    death: null,
    assist: null,
    headshot: null,
    damage: null,
    ...overrides,
  }
}

describe('스키마 파싱', () => {
  it('스펙 형태의 매치 목록을 파싱한다', () => {
    const parsed = NexonMatchListResponse.parse(SAMPLE_MATCH_LIST)
    expect(parsed.match).toHaveLength(2)
    expect(parsed.match[0]?.match_id).toBe('AAAA-1111')
  })

  it('없는 필드는 지어내지 않고 null이 된다', () => {
    const parsed = NexonMatchDetailResponse.parse({
      match_id: 'X',
      match_detail: [{ user_name: '홍길동' }],
    })
    expect(parsed.match_map).toBeNull()
    expect(parsed.match_detail[0]?.damage).toBeNull()
    expect(parsed.match_detail[0]?.clan_name).toBeNull()
  })

  it('숫자가 문자열로 와도 숫자로 읽는다', () => {
    const parsed = NexonMatchListResponse.parse({
      match: [{ match_id: 'X', kill: '13', death: '2' }],
    })
    expect(parsed.match[0]?.kill).toBe(13)
    expect(parsed.match[0]?.death).toBe(2)
  })

  it('match 배열이 없으면 빈 배열로 다룬다', () => {
    expect(NexonMatchListResponse.parse({}).match).toEqual([])
  })
})

describe('시각 해석', () => {
  it('UTC 표기를 그대로 읽는다', () => {
    expect(parseNexonDateTime('2026-08-01T05:12:33Z')?.toISOString()).toBe(
      '2026-08-01T05:12:33.000Z',
    )
  })

  it('타임존 표기가 없으면 스펙대로 UTC로 읽는다 (로컬 시간으로 읽지 않는다)', () => {
    expect(parseNexonDateTime('2026-08-01T05:12:33')?.toISOString()).toBe(
      '2026-08-01T05:12:33.000Z',
    )
  })

  it('해석할 수 없으면 null', () => {
    expect(parseNexonDateTime('언젠가')).toBeNull()
    expect(parseNexonDateTime(null)).toBeNull()
  })
})

describe('매치 목록 정규화', () => {
  it('원본 코드와 해석값을 함께 보존한다', () => {
    const { entries, skipped } = normalizeMatchList(NexonMatchListResponse.parse(SAMPLE_MATCH_LIST))
    expect(skipped).toBe(0)
    expect(entries[0]).toMatchObject({
      sourceMatchId: 'AAAA-1111',
      matchType: '클랜전',
      matchResult: '1',
      outcome: 'win',
    })
    expect(entries[1]?.outcome).toBe('lose')
  })

  it('match_id가 없는 항목은 조용히 버리지 않고 센다', () => {
    const { entries, skipped } = normalizeMatchList(
      NexonMatchListResponse.parse({ match: [{ kill: 1 }, { match_id: 'OK' }] }),
    )
    expect(entries).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('모르는 결과 코드는 추측하지 않는다', () => {
    expect(toMatchOutcome('9')).toBeNull()
    expect(toMatchOutcome(null)).toBeNull()
  })
})

describe('매치 상세 정규화', () => {
  const detail = normalizeMatchDetail(NexonMatchDetailResponse.parse(SAMPLE_MATCH_DETAIL))

  it('참가자 슬롯 순서를 유지한다 (넥슨이 참가자 식별자를 주지 않는다)', () => {
    expect(detail?.participants.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(detail?.participants[0]?.userName).toBe('가가')
  })

  it('팀을 team_id로 묶는다', () => {
    const teams = groupByTeam(detail?.participants ?? [])
    expect([...teams.keys()].sort()).toEqual(['1', '2'])
    expect(teams.get('1')).toHaveLength(5)
  })

  it('승리 팀을 판정한다', () => {
    expect(deriveWinnerTeamId(detail?.participants ?? [])).toBe('1')
  })

  it('팀 안에서 결과가 엇갈리면 승패를 정하지 않는다', () => {
    const mixed = [
      participant({ slot: 0, teamId: '1', outcome: 'win' }),
      participant({ slot: 1, teamId: '1', outcome: 'lose' }),
      participant({ slot: 2, teamId: '2', outcome: 'lose' }),
    ]
    expect(deriveWinnerTeamId(mixed)).toBeNull()
  })

  it('팀이 둘이 아니면 승패를 정하지 않는다 (개인전 등)', () => {
    const solo = [participant({ slot: 0, teamId: '1' }), participant({ slot: 1, teamId: '2' }), participant({ slot: 2, teamId: '3' })]
    expect(deriveWinnerTeamId(solo)).toBeNull()
  })

  it('match_id가 없으면 스테이징 대상이 아니다', () => {
    expect(normalizeMatchDetail(NexonMatchDetailResponse.parse({ match_detail: [] }))).toBeNull()
  })
})

describe('스테이징 검증', () => {
  it('정상 상세는 지적사항이 없다', () => {
    const detail = normalizeMatchDetail(NexonMatchDetailResponse.parse(SAMPLE_MATCH_DETAIL))!
    expect(validateMatchDetail(detail)).toEqual([])
  })

  it('참가자·시각·닉네임·team_id 결측을 잡아낸다', () => {
    const detail = normalizeMatchDetail(
      NexonMatchDetailResponse.parse({ match_id: 'X', match_detail: [] }),
    )!
    const codes = validateMatchDetail(detail).map((issue) => issue.code)
    expect(codes).toContain('no_participants')
    expect(codes).toContain('no_date')
    expect(codes).toContain('no_team_id')
  })
})

describe('내용 해시', () => {
  it('키 순서가 달라도 같은 해시다', () => {
    expect(stableStringify({ a: 1, b: [2, { d: 4, c: 3 }] })).toBe(
      stableStringify({ b: [2, { c: 3, d: 4 }], a: 1 }),
    )
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }))
  })

  it('내용이 달라지면 해시도 달라진다', () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
  })
})
