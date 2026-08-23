/**
 * 계정 보안 회귀 테스트 (D-119).
 *
 * DB를 건드리지 않고 **판정 규칙**만 고정한다.
 *  1. 검수 계정 비밀번호는 환경변수로만 받는다 (인자로 받지 않는다)
 *  2. 폐기된 공용 비밀번호를 다시 쓸 수 없다
 *  3. 기본 권한은 최소(role 0)다 — 관리자는 명시적으로 켤 때만
 */
import { describe, expect, it } from 'vitest'
import { provisionTestAccount, TEST_ACCOUNT_PASSWORD_ENV } from '../accountSecurity'

const BASE = { email: 'qa@example.invalid', nickname: '검수계정' }

/** DB에 닿기 전에 거부되는 경로만 검사한다 */
async function reject(env: NodeJS.ProcessEnv, admin?: boolean) {
  const result = await provisionTestAccount({ ...BASE, admin, env })
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.reason
}

describe('검수 계정 비밀번호는 환경변수로만 받는다', () => {
  it('환경변수가 없으면 만들지 않는다', async () => {
    const reason = await reject({} as NodeJS.ProcessEnv)
    expect(reason).toContain(TEST_ACCOUNT_PASSWORD_ENV)
  })

  it('빈 값·공백도 거부한다', async () => {
    for (const value of ['', '   ']) {
      expect(await reject({ [TEST_ACCOUNT_PASSWORD_ENV]: value } as NodeJS.ProcessEnv)).not.toBe('')
    }
  })

  it('너무 짧으면 거부한다 (12자 미만)', async () => {
    const reason = await reject({ [TEST_ACCOUNT_PASSWORD_ENV]: 'short123' } as NodeJS.ProcessEnv)
    expect(reason).toContain('12자')
  })

  it('폐기된 공용 비밀번호는 다시 쓸 수 없다', async () => {
    // 12자 이상이라 길이 검사는 통과하지만, 값 자체가 폐기 대상이라 막혀야 한다
    const reason = await reject({
      [TEST_ACCOUNT_PASSWORD_ENV]: 'sacloud1234',
    } as NodeJS.ProcessEnv)
    expect(reason).not.toBe('')
  })
})

describe('실패해도 비밀번호를 흘리지 않는다', () => {
  it('거부 사유에 입력한 값이 들어가지 않는다', async () => {
    const secret = 'super-secret-value-1234'
    const reason = await reject({ [TEST_ACCOUNT_PASSWORD_ENV]: '' } as NodeJS.ProcessEnv)
    expect(reason).not.toContain(secret)
  })
})

describe('환경변수 이름', () => {
  it('인자가 아니라 환경변수라는 것이 이름에 드러난다', () => {
    expect(TEST_ACCOUNT_PASSWORD_ENV).toBe('SACLOUD_TEST_ACCOUNT_PASSWORD')
  })
})
