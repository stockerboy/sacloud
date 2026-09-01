import { prisma } from '@sacloud/db'
import {
  normalizeUsername,
  SIGNUP_ALLOWED_EMAIL_DOMAINS,
  type AuthSession,
} from '@sacloud/contract'
import { randomBytes, createHash } from 'node:crypto'
import { toKstIso } from '../format'
import { toUser } from '../mappers'
import { issueAccessToken, issueRefreshToken, setSessionCookie } from '../session'

/**
 * 인증 공통 로직.
 *
 * 원본의 실제 요청/응답 본문은 관측 범위 밖이라 계약(`entities/user.ts`)에서 우리가 확정했다.
 * 관측된 것은 화면 제약뿐이다 — **네이버 메일만 가입 가능**, 가입 시 이메일 인증 진행.
 */

/** 사용자 조회 시 항상 같은 관계를 함께 읽어 `toUser`에 넘긴다 */
export const USER_INCLUDE = {
  playerLink: { include: { player: { include: { clan: true } } } },
} as const

/**
 * 가입 가능한 이메일 도메인인지.
 *
 * ⚠ **정정 (2026-09-01 · D-252)** — 옛 동작은 「네이버 메일만」이었다.
 * 그 제약이 살아 있는 한 **대부분의 사람이 가입할 수 없다.** 사용자가 «회원가입 무조건
 * 가능하게» 라고 못 박아서 제한을 풀었다.
 *
 * 옛 동작을 지우지는 않았다 (CLAUDE.md 10-4). `SACLOUD_SIGNUP_EMAIL_DOMAINS` 에
 * `naver.com` 을 넣으면 그때 동작이 그대로 돌아온다. 비어 있으면(기본) 전부 허용한다.
 */
export function allowedSignupEmailDomains(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.SACLOUD_SIGNUP_EMAIL_DOMAINS?.trim()
  if (configured) {
    return configured
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }
  return [...(SIGNUP_ALLOWED_EMAIL_DOMAINS as readonly string[])]
}

export function isAllowedSignupEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allowed = allowedSignupEmailDomains(env)
  if (allowed.length === 0) return true // 제한 없음 (기본)
  const domain = email.split('@')[1]?.toLowerCase()
  return domain !== undefined && allowed.includes(domain)
}

/**
 * 아이디 또는 이메일로 사용자를 찾는다 (로그인).
 *
 * 아이디는 **소문자로 정규화**해서 찾는다. 저장할 때도 같은 함수를 거치므로
 * 대소문자만 다른 아이디로는 절대 다른 계정이 되지 않는다.
 */
export async function findUserForLogin(input: { username?: string; email?: string }) {
  const username = input.username ? normalizeUsername(input.username) : null

  if (username) {
    const byUsername = await prisma.user.findUnique({ where: { username } })
    if (byUsername) return byUsername
    /* 아이디 칸에 이메일을 적은 사람을 막지 않는다 — 옛 계정은 이메일이 곧 로그인 값이었다 */
    if (username.includes('@')) {
      return prisma.user.findUnique({ where: { email: username } })
    }
    return null
  }

  if (input.email) return prisma.user.findUnique({ where: { email: input.email } })
  return null
}

/** 로그인 성공 후 세션을 발급하고 계약 형태로 돌려준다 */
export async function startSession(userId: string): Promise<AuthSession> {
  const [{ token, expiresAt }, refreshToken, user] = await Promise.all([
    issueAccessToken(userId),
    issueRefreshToken(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: USER_INCLUDE }),
  ])

  await setSessionCookie(token, expiresAt)

  return {
    access_token: token,
    refresh_token: refreshToken,
    expires_at: toKstIso(expiresAt),
    user: toUser(user),
  }
}

/**
 * 일회용 토큰 발급 (이메일 인증 / 비밀번호 재설정).
 *
 * 평문은 **응답이나 로그에 남기지 않고** 메일로만 보낸다. DB에는 해시만 저장한다.
 * 메일 발송은 아직 없다 — Phase 7 뒷부분에서 붙인다.
 */
export async function issueAuthToken(
  userId: string,
  kind: 'email_verify' | 'password_reset',
  ttlMinutes: number,
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await prisma.authToken.create({
    data: {
      userId,
      kind,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    },
  })
  return token
}

/** 일회용 토큰을 소모한다. 유효하지 않으면 null. */
export async function consumeAuthToken(
  token: string,
  kind: 'email_verify' | 'password_reset',
): Promise<string | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const row = await prisma.authToken.findUnique({ where: { tokenHash } })
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) return null
  await prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return row.userId
}
