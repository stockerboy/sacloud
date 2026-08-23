/**
 * 인증 보안 회귀 테스트 (D-120 · D-121).
 *
 * DB·서버 없이 **판정 규칙**만 고정한다. 실제 429 동작은 아래 `authAttack.test.ts`가
 * 개발 서버를 상대로 확인한다.
 */
import { describe, expect, it } from 'vitest'
import {
  clientIdentity,
  ipQuotaFor,
  loginAccountKey,
  loginIpKey,
  signupIpKey,
  LOGIN_ACCOUNT_QUOTA,
  LOGIN_IP_QUOTA,
  LOGIN_UNKNOWN_IP_QUOTA,
  SIGNUP_IP_QUOTA,
  windowVerdict,
} from '../lib/server/rateLimit'

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/auth/login', { method: 'POST', headers })
}

describe('클라이언트 IP — 헤더를 함부로 믿지 않는다', () => {
  it('설정이 없으면 x-forwarded-for를 믿지 않는다', () => {
    const identity = clientIdentity(req({ 'x-forwarded-for': '1.2.3.4' }), {})
    expect(identity.ip).toBeNull()
    expect(identity.trust).toBe('unknown')
  })

  it('공격자가 넣은 x-real-ip도 믿지 않는다', () => {
    const identity = clientIdentity(req({ 'x-real-ip': '9.9.9.9' }), {})
    expect(identity.ip).toBeNull()
  })

  it('프록시가 덮어쓰는 헤더를 지정하면 그것만 쓴다', () => {
    const env = { SACLOUD_CLIENT_IP_HEADER: 'cf-connecting-ip' }
    const identity = clientIdentity(
      req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }),
      env,
    )
    expect(identity.ip).toBe('203.0.113.7')
    expect(identity.trust).toBe('trusted-header')
  })

  it('지정한 헤더가 없으면 XFF로 몰래 넘어가지 않는다', () => {
    const env = { SACLOUD_CLIENT_IP_HEADER: 'cf-connecting-ip' }
    expect(clientIdentity(req({ 'x-forwarded-for': '1.2.3.4' }), env).ip).toBeNull()
  })

  it('명시적으로 켰을 때만 XFF를 차선책으로 쓴다', () => {
    const env = { SACLOUD_TRUST_FORWARDED_FOR: 'true' }
    const identity = clientIdentity(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }), env)
    expect(identity.ip).toBe('1.2.3.4')
    expect(identity.trust).toBe('forwarded')
  })

  it("'true' 이외의 값으로는 켜지지 않는다", () => {
    for (const value of ['1', 'yes', 'TRUE', '']) {
      const env = { SACLOUD_TRUST_FORWARDED_FOR: value }
      expect(clientIdentity(req({ 'x-forwarded-for': '1.2.3.4' }), env).ip).toBeNull()
    }
  })
})

describe('제한 키에 식별 정보를 원문으로 넣지 않는다', () => {
  it('이메일이 키에 그대로 들어가지 않는다', () => {
    const key = loginAccountKey('victim@naver.com')
    expect(key).not.toContain('victim')
    expect(key).not.toContain('@')
  })

  it('대소문자·공백이 달라도 같은 계정으로 센다 (우회 방지)', () => {
    expect(loginAccountKey('  Victim@Naver.com ')).toBe(loginAccountKey('victim@naver.com'))
  })

  it('IP도 원문으로 들어가지 않는다', () => {
    const identity = { ip: '203.0.113.7', trust: 'trusted-header' as const }
    expect(loginIpKey(identity)).not.toContain('203.0.113.7')
    expect(signupIpKey(identity)).not.toContain('203.0.113.7')
  })

  it('로그인과 가입 키는 서로 섞이지 않는다', () => {
    const identity = { ip: '203.0.113.7', trust: 'trusted-header' as const }
    expect(loginIpKey(identity)).not.toBe(signupIpKey(identity))
  })
})

describe('한도 선택', () => {
  it('IP를 알면 엄격한 한도를 쓴다', () => {
    const identity = { ip: '203.0.113.7', trust: 'trusted-header' as const }
    expect(ipQuotaFor(identity, 'login')).toEqual(LOGIN_IP_QUOTA)
    expect(ipQuotaFor(identity, 'signup')).toEqual(SIGNUP_IP_QUOTA)
  })

  it('IP를 모르면 느슨한 전체 한도를 쓴다 (정상 사용자를 막지 않으려고)', () => {
    const identity = { ip: null, trust: 'unknown' as const }
    expect(ipQuotaFor(identity, 'login')).toEqual(LOGIN_UNKNOWN_IP_QUOTA)
    expect(ipQuotaFor(identity, 'login').limit).toBeGreaterThan(LOGIN_IP_QUOTA.limit)
  })

  it('계정 한도가 IP 한도보다 엄격하다 (한 계정 집중 공격을 먼저 끊는다)', () => {
    expect(LOGIN_ACCOUNT_QUOTA.limit).toBeLessThan(LOGIN_IP_QUOTA.limit)
  })

  it('사람이 몇 번 틀리는 것은 통과한다', () => {
    expect(LOGIN_ACCOUNT_QUOTA.limit).toBeGreaterThanOrEqual(5)
  })
})

describe('창(window) 판정 — 시간이 지나면 회복된다', () => {
  const quota = { limit: 5, windowSeconds: 900 }
  const now = new Date('2026-08-23T12:00:00Z')
  const windowEnd = new Date(now.getTime() + 900 * 1000)

  it('기록이 없으면 새 창을 연다', () => {
    expect(windowVerdict(null, quota, now).action).toBe('reset')
  })

  it('한도 안이면 센다', () => {
    expect(windowVerdict({ count: 4, windowEnd }, quota, now).action).toBe('increment')
  })

  it('한도를 채우면 거부하고 남은 시간을 알려준다', () => {
    const verdict = windowVerdict({ count: 5, windowEnd }, quota, now)
    expect(verdict.action).toBe('deny')
    expect(verdict.retryAfterSeconds).toBe(900)
  })

  it('시간이 흐르면 남은 시간이 줄어든다', () => {
    const later = new Date(now.getTime() + 600 * 1000)
    expect(windowVerdict({ count: 5, windowEnd }, quota, later).retryAfterSeconds).toBe(300)
  })

  it('창이 지나면 한도를 채웠어도 **회복된다**', () => {
    const after = new Date(windowEnd.getTime() + 1)
    expect(windowVerdict({ count: 99, windowEnd }, quota, after).action).toBe('reset')
  })

  it('창 경계 정각에도 회복된다 (영원히 잠기지 않는다)', () => {
    expect(windowVerdict({ count: 99, windowEnd }, quota, windowEnd).action).toBe('reset')
  })
})
