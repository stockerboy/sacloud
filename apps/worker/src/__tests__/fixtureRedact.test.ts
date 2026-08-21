import { describe, expect, it } from 'vitest'
import {
  containsSecret,
  maskPreservingShape,
  pseudonymizeResponse,
} from '../lib/fixtureRedact.js'

const FAKE_KEY = 'test_fake_key_0000000000'

describe('픽스처 가명화', () => {
  it('글자 종류와 길이를 유지한 채 값을 바꾼다 (형식 근거는 남는다)', () => {
    const masked = maskPreservingShape('AB12-cd34')
    expect(masked).not.toBe('AB12-cd34')
    expect(masked).toHaveLength(9)
    expect(masked[4]).toBe('-')
    expect(/^[A-Z]{2}\d{2}-[a-z]{2}\d{2}$/.test(masked)).toBe(true)
  })

  it('실존 닉네임·클랜명을 커밋 가능한 표기로 바꾼다', () => {
    const { value } = pseudonymizeResponse({
      match_detail: [
        { user_name: '실제닉네임', clan_name: '실제클랜', kill: 12 },
        { user_name: '다른사람', clan_name: '실제클랜', kill: 3 },
      ],
    })
    const detail = (value as { match_detail: { user_name: string; clan_name: string; kill: number }[] })
      .match_detail

    expect(detail[0]?.user_name).toBe('유저01')
    expect(detail[1]?.user_name).toBe('유저02')
    // 같은 값은 같은 가명으로 — 팀 구성 관계가 유지돼야 한다
    expect(detail[0]?.clan_name).toBe(detail[1]?.clan_name)
    // 검증 대상(수치·시각 등)은 손대지 않는다
    expect(detail[0]?.kill).toBe(12)
  })

  it('ouid·match_id는 가명화하되 나머지 필드는 원본 그대로 둔다', () => {
    const { value, report } = pseudonymizeResponse({
      match_id: 'AAAA-1111',
      date_match: '2026-08-01T05:12:33Z',
      match_mode: '폭파미션',
      ouid: 'abc123',
    })
    const output = value as Record<string, unknown>

    expect(output.match_id).not.toBe('AAAA-1111')
    expect(output.ouid).not.toBe('abc123')
    expect(output.date_match).toBe('2026-08-01T05:12:33Z')
    expect(output.match_mode).toBe('폭파미션')
    expect(report.replaced).toEqual({ match_id: 1, ouid: 1 })
  })

  it('값 안에 섞인 API 키를 지운다', () => {
    const { value } = pseudonymizeResponse(
      { message: `bad request for key=${FAKE_KEY}` },
      { secrets: [FAKE_KEY] },
    )
    expect(JSON.stringify(value)).not.toContain(FAKE_KEY)
    expect(JSON.stringify(value)).toContain('[REDACTED]')
  })

  it('비밀값이 남아 있으면 저장 전에 걸러낸다', () => {
    expect(containsSecret(`{"a":"${FAKE_KEY}"}`, [FAKE_KEY])).toBe(true)
    expect(containsSecret('{"a":"ok"}', [FAKE_KEY])).toBe(false)
    // 너무 짧은 값은 오탐이 커서 검사 대상이 아니다
    expect(containsSecret('{"a":"abc"}', ['abc'])).toBe(false)
  })
})
