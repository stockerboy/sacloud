/**
 * **실제 넥슨 응답**으로 스키마·정규화를 검증한다.
 *
 * 픽스처는 2026-08-21 실주행에서 받은 응답을 가명화한 것이다
 * (`packages/nexon/src/fixtures/real/*.json`, 닉네임·클랜명·ouid·match_id만 가짜).
 * 스펙에서 조립한 `fixtures/sample.ts`와 달리 **이건 진짜 형태**다.
 *
 * 여기서 깨지면 넥슨 응답이 바뀐 것이므로 스키마를 실제 응답 기준으로 고친다.
 */
import { describe, expect, it } from 'vitest'
import idFixture from '../fixtures/real/id.json'
import matchListFixture from '../fixtures/real/match-list.json'
import matchDetailFixture from '../fixtures/real/match-detail.json'
import { NexonIdResponse, NexonMatchDetailResponse, NexonMatchListResponse } from '../schemas'
import { groupByTeam, normalizeMatchDetail, normalizeMatchList } from '../normalize'

describe('실제 응답 — 계정 식별자', () => {
  it('/id 응답이 스키마와 맞는다', () => {
    const parsed = NexonIdResponse.parse(idFixture.response)
    expect(parsed.ouid).toBeTruthy()
  })

  it('ouid는 32자리 16진수다 (실측)', () => {
    expect(idFixture.response.ouid).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('실제 응답 — 매치 목록', () => {
  const parsed = NexonMatchListResponse.parse(matchListFixture.response)

  it('스키마와 맞는다', () => {
    expect(parsed.match.length).toBeGreaterThan(0)
  })

  it('match_id는 18자리 숫자 문자열이다 (실측)', () => {
    for (const item of parsed.match) {
      expect(item.match_id).toMatch(/^\d{18}$/)
    }
  })

  it('date_match에 밀리초가 붙어 있어도 해석한다 (실측: 2026-...T...:...Z)', () => {
    const { entries, skipped } = normalizeMatchList(parsed)
    expect(skipped).toBe(0)
    expect(entries[0]?.dateMatch).toBeInstanceOf(Date)
    expect(Number.isNaN(entries[0]?.dateMatch?.getTime())).toBe(false)
  })
})

describe('실제 응답 — 매치 상세', () => {
  const parsed = NexonMatchDetailResponse.parse(matchDetailFixture.response)
  const detail = normalizeMatchDetail(parsed)!

  it('스키마와 맞는다', () => {
    expect(detail.participants.length).toBeGreaterThan(0)
    expect(detail.matchMap).toBeTruthy()
    expect(detail.dateMatch).toBeInstanceOf(Date)
  })

  it('클랜명은 스펙의 clan_name이 아니라 guild_name으로 온다 (D-043)', () => {
    const rawParticipant = matchDetailFixture.response.match_detail[0] as Record<string, unknown>
    expect(rawParticipant).toHaveProperty('guild_name')
    expect(rawParticipant).not.toHaveProperty('clan_name')
    // 정규화는 둘을 합쳐서 clanName으로 내려 준다
    expect(detail.participants[0]?.clanName).toBeTruthy()
  })

  it('kill/death/assist/headshot/damage가 전부 숫자로 온다', () => {
    for (const participant of detail.participants) {
      expect(typeof participant.kill).toBe('number')
      expect(typeof participant.death).toBe('number')
      expect(typeof participant.assist).toBe('number')
      expect(typeof participant.headshot).toBe('number')
      expect(typeof participant.damage).toBe('number')
    }
  })

  it('한 경기 응답에 양 팀이 모두 담기지 않는다 (실측 — Phase 9 blocker)', () => {
    // 관측: 승리 팀 전원 + (조회 대상이 졌으면) 본인 1명. 상대 팀 라인업은 오지 않는다.
    const teams = groupByTeam(detail.participants)
    const sizes = [...teams.values()].map((members) => members.length).sort((a, b) => b - a)
    expect(sizes[0]).toBeGreaterThan(1)
    // 두 번째 팀이 있더라도 인원이 맞지 않는다 (6 vs 1)
    if (sizes.length > 1) expect(sizes[0]).not.toBe(sizes[1])
  })

  it('참가자 식별자(ouid)는 오지 않는다 — 닉네임뿐이다', () => {
    const rawParticipant = matchDetailFixture.response.match_detail[0] as Record<string, unknown>
    expect(rawParticipant).not.toHaveProperty('ouid')
    expect(rawParticipant).toHaveProperty('user_name')
  })

  it('무기·MVP·탈주·플레이시간 필드는 응답에 없다 (D-034 근거)', () => {
    const keys = Object.keys(matchDetailFixture.response.match_detail[0] as object)
    expect(keys).not.toContain('weapon')
    expect(keys).not.toContain('mvp')
    expect(keys).not.toContain('dropout')
    expect(Object.keys(matchDetailFixture.response)).not.toContain('play_time')
    expect(Object.keys(matchDetailFixture.response)).not.toContain('date_end')
  })
})
