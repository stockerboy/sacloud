/**
 * 계정 연동 정책 회귀 테스트 (D-121).
 *
 * 실제 승인 흐름은 DB가 필요하므로 `authAttack.test.ts`가 서버 상대로 확인한다.
 * 여기서는 **코드가 약속한 것을 지키는지** 소스 수준에서 고정한다 —
 * 규칙이 조용히 되돌려지는 것을 막는 것이 목적이다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const route = readFileSync(join(ROOT, 'app/api/me/link/route.ts'), 'utf8')
const logic = readFileSync(join(ROOT, 'lib/server/queries/playerLink.ts'), 'utf8')
const adminRoute = readFileSync(
  join(ROOT, 'app/api/admin/link-claims/[claimId]/route.ts'),
  'utf8',
)

describe('사용자 경로는 연결을 만들지 않는다', () => {
  it('PUT /me/link 가 UserPlayerLink 를 직접 쓰지 않는다', () => {
    // 연결 생성은 관리자 승인 경로에만 있어야 한다
    expect(route).not.toMatch(/userPlayerLink\.(create|upsert|update)\b/)
  })

  it('신청 함수도 연결을 만들지 않는다', () => {
    const requestSection = logic.slice(
      logic.indexOf('export async function requestPlayerLink'),
      logic.indexOf('export async function cancelPlayerLinkClaim'),
    )
    expect(requestSection).not.toMatch(/userPlayerLink\.(create|upsert)\b/)
    expect(requestSection).toContain('playerLinkClaim.upsert')
  })

  it('연결 생성은 승인 함수 안에만 있다', () => {
    const approveSection = logic.slice(
      logic.indexOf('export async function approvePlayerLinkClaim'),
      logic.indexOf('export async function rejectPlayerLinkClaim'),
    )
    expect(approveSection).toContain('userPlayerLink.create')
  })
})

describe('닉네임만으로 소유권을 인정하지 않는다', () => {
  it('유사 검색(contains/startsWith)을 쓰지 않는다', () => {
    expect(logic).not.toMatch(/name:\s*\{\s*contains/)
    expect(logic).not.toMatch(/name:\s*\{\s*startsWith/)
    expect(logic).not.toMatch(/mode:\s*'insensitive'/)
  })

  it('동명이인이면 임의로 고르지 않는다', () => {
    expect(logic).toContain('take: 2')
    expect(logic).toMatch(/players\.length > 1/)
  })

  it('시드 선수는 연동 후보가 아니다', () => {
    expect(logic).toMatch(/origin:\s*\{\s*not:\s*'mock'\s*\}/)
  })
})

describe('탈취 방지', () => {
  it('이미 연결된 선수는 신청 자체를 막는다', () => {
    expect(logic).toContain('playerTaken')
    expect(logic).toContain('이미 다른 계정에 연동된 플레이어입니다')
  })

  it('한 사람에게 열린 신청은 하나뿐이다', () => {
    expect(logic).toMatch(/status:\s*'pending'/)
    expect(logic).toContain('이미 처리 대기 중인 신청이 있습니다')
  })

  it('승인은 트랜잭션 안에서 하고 유니크 제약 충돌을 삼키지 않는다', () => {
    const approveSection = logic.slice(
      logic.indexOf('export async function approvePlayerLinkClaim'),
      logic.indexOf('export async function rejectPlayerLinkClaim'),
    )
    expect(approveSection).toContain('prisma.$transaction')
    expect(approveSection).toContain('P2002')
    expect(approveSection).toContain('그 사이 다른 계정에 연동됐습니다')
  })

  it('이미 처리된 신청은 다시 처리되지 않는다 (재생 공격 방지)', () => {
    expect(logic).toContain('이미 처리된 신청입니다')
  })
})

describe('감사 기록', () => {
  it('승인과 거부 모두 AdminAuditLog 를 남긴다', () => {
    expect(logic).toContain("action: 'player_link.approve'")
    expect(logic).toContain("action: 'player_link.reject'")
    const auditCalls = logic.match(/adminAuditLog\.create/g) ?? []
    expect(auditCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('관리자 경로는 requireAdmin 을 먼저 부른다', () => {
    expect(adminRoute).toContain('requireAdmin')
    expect(adminRoute.indexOf('requireAdmin')).toBeLessThan(adminRoute.indexOf('approvePlayerLink'))
  })
})

describe('비밀 정보를 흘리지 않는다', () => {
  it('연동 코드에 비밀번호·토큰·해시가 등장하지 않는다', () => {
    for (const source of [route, logic, adminRoute]) {
      expect(source).not.toMatch(/passwordHash/)
      expect(source).not.toMatch(/sessionToken|refreshToken/)
    }
  })
})
