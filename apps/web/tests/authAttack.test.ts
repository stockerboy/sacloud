/**
 * 인증 공격 시나리오 — **실제 서버**를 상대로 확인한다 (D-120 · D-121).
 *
 * 순수 규칙은 `authSecurity.test.ts`가 본다. 여기서는 라우트가 실제로
 * 429를 내는지, `Retry-After`가 붙는지, 계정 enumeration이 되지 않는지를 확인한다.
 *
 * 실행 조건
 *   - 개발 서버가 떠 있어야 한다. 없으면 **조용히 통과시키지 않고 skip**한다.
 *   - IP별 제한을 검증하려면 서버가 신뢰 헤더를 알아야 한다:
 *     `SACLOUD_CLIENT_IP_HEADER=x-test-client-ip pnpm --filter @sacloud/web start`
 *     설정돼 있지 않으면 해당 케이스만 skip한다 (계정별 제한은 그대로 검증한다).
 *
 * 여기서 만드는 계정은 없다. 로그인은 **존재하지 않는 이메일**로만 두드리고,
 * 가입은 형식이 틀린 값으로 보내 카운터만 소비한다.
 */
import { describe, expect, it } from 'vitest'

const BASE = process.env.API_TEST_BASE_URL ?? 'http://localhost:3000/api'
const IP_HEADER = 'x-test-client-ip'

async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/infos`, { signal: AbortSignal.timeout(90_000) })
    return response.ok
  } catch {
    return false
  }
}

const up = await serverUp()

/** 매번 다른 값 — 테스트끼리 카운터를 공유하지 않게 한다 */
let seq = 0
const unique = () => `${Date.now()}-${process.pid}-${seq++}`

function login(email: string, password: string, ip?: string) {
  return fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ip ? { [IP_HEADER]: ip } : {}),
    },
    body: JSON.stringify({ email, password }),
  })
}

/** 서버가 신뢰 헤더를 인식하는가 — 같은 IP로 반복해 IP 버킷이 실제로 도는지 본다 */
async function ipHeaderHonored(): Promise<boolean> {
  if (!up) return false
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
  // IP 한도(20)를 넘기면 계정이 달라도 429가 나와야 한다
  let sawThrottle = false
  for (let i = 0; i < 24; i += 1) {
    const response = await login(`probe-${unique()}@naver.com`, 'wrong-password-1234', ip)
    if (response.status === 429) {
      sawThrottle = true
      break
    }
  }
  return sawThrottle
}

const ipAware = await ipHeaderHonored()

describe.skipIf(!up)('로그인 — 무차별 대입', () => {
  it('같은 계정을 반복해서 틀리면 429가 되고 Retry-After가 붙는다', async () => {
    const email = `brute-${unique()}@naver.com`
    const statuses: number[] = []

    for (let i = 0; i < 8; i += 1) {
      const response = await login(email, `wrong-${i}-padding`)
      statuses.push(response.status)
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        expect(retryAfter, 'Retry-After 헤더가 있어야 한다').toBeTruthy()
        expect(Number(retryAfter)).toBeGreaterThan(0)
        break
      }
    }

    expect(statuses, '반복 실패가 결국 429로 막혀야 한다').toContain(429)
    // 처음 몇 번은 401이어야 한다 (첫 시도부터 429면 정상 사용자를 막는 것이다)
    expect(statuses[0]).toBe(401)
  })

  it('막힌 뒤에도 그 이메일이 존재하는지 알려주지 않는다', async () => {
    const email = `enum-${unique()}@naver.com`
    for (let i = 0; i < 8; i += 1) {
      const response = await login(email, `wrong-${i}-padding`)
      if (response.status !== 429) continue
      const body = (await response.json()) as { message: string; data: unknown }
      expect(body.message).not.toContain('없')
      expect(body.message).not.toContain('가입')
      expect(body.data).toBeNull()
      return
    }
    throw new Error('429에 도달하지 못했다')
  })

  it('한 계정이 막혀도 다른 계정은 영향받지 않는다', async () => {
    const victim = `victim-${unique()}@naver.com`
    for (let i = 0; i < 8; i += 1) await login(victim, `wrong-${i}-padding`)

    const other = await login(`other-${unique()}@naver.com`, 'some-wrong-password')
    expect([401, 429]).toContain(other.status)
    // IP 버킷이 없는 환경에서는 401이어야 한다 (계정 버킷은 서로 독립이다)
    if (!ipAware) expect(other.status).toBe(401)
  })
})

describe.skipIf(!up || !ipAware)('로그인 — 한 IP에서 여러 계정 훑기', () => {
  it('계정을 갈아 가며 두드려도 IP 한도에서 막힌다', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    let blocked = false

    for (let i = 0; i < 30; i += 1) {
      const response = await login(`sweep-${unique()}@naver.com`, 'wrong-password-1234', ip)
      if (response.status === 429) {
        blocked = true
        expect(response.headers.get('retry-after')).toBeTruthy()
        break
      }
    }

    expect(blocked, '계정을 바꿔 가며 공격해도 IP로 막혀야 한다').toBe(true)
  })

  it('다른 IP는 막히지 않는다 (공격자 하나가 전체를 마비시키지 못한다)', async () => {
    const attacker = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
    for (let i = 0; i < 30; i += 1) {
      await login(`sweep2-${unique()}@naver.com`, 'wrong-password-1234', attacker)
    }

    const innocent = `192.0.2.${Math.floor(Math.random() * 200) + 1}`
    const response = await login(`bystander-${unique()}@naver.com`, 'wrong-password-1234', innocent)
    expect(response.status, '무관한 IP는 계속 정상 응답이어야 한다').toBe(401)
  })
})

describe.skipIf(!up || !ipAware)('회원가입 — 대량 생성', () => {
  it('같은 IP에서 짧은 시간에 반복하면 429가 된다', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    let blocked = false

    for (let i = 0; i < 8; i += 1) {
      // 형식이 틀린 값이라 계정은 만들어지지 않는다. 시도 자체만 센다
      const response = await fetch(`${BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [IP_HEADER]: ip },
        body: JSON.stringify({ email: 'not-an-email', password: 'x', nickname: '' }),
      })
      if (response.status === 429) {
        blocked = true
        expect(response.headers.get('retry-after')).toBeTruthy()
        break
      }
    }

    expect(blocked, '대량 가입 시도가 막혀야 한다').toBe(true)
  })
})

describe.skipIf(!up)('계정 연동 — 소유권 없는 선점', () => {
  it('로그인하지 않으면 신청할 수 없다', async () => {
    const response = await fetch(`${BASE}/me/link`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player_name: '씨야' }),
    })
    expect(response.status, '비로그인 신청은 401이어야 한다').toBe(401)
  })

  it('관리자 승인 경로는 비인증으로 열리지 않는다', async () => {
    const list = await fetch(`${BASE}/admin/link-claims`)
    expect(list.status).toBe(403)

    const decide = await fetch(`${BASE}/admin/link-claims/whatever`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    expect(decide.status).toBe(403)
  })
})

describe.skipIf(up)('개발 서버가 없어 인증 공격 테스트를 건너뛴다', () => {
  it('서버를 띄우면 실제 429·403을 검증한다', () => {
    expect(up).toBe(false)
  })
})
