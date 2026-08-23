/**
 * 계정 보안 — 공용 개발 비밀번호 폐기 · 검수 계정 분리 (D-119).
 *
 * ── 무엇이 문제였나
 *   시드가 만든 계정 **전원이 같은 비밀번호 하나**를 썼고, 그중 둘이 운영자(role 2)였다.
 *   그 값은 저장소의 `seed.ts`에 평문으로 적혀 있었고 실행할 때마다 콘솔에도 찍혔다.
 *   사이트가 잠깐이라도 외부에 열리면, 문서를 본 적 없는 사람도 관리자 권한
 *   (시즌 종료·시작 · 경기 공식 전환 · 클랜 조작)에 도달할 수 있었다.
 *   게다가 로그인에는 시도 제한이 없다.
 *
 * ── 방침
 *   1. **공용 비밀번호를 쓰는 계정은 로그인 불가로 만든다.**
 *      새 비밀번호를 "정하지" 않는다 — 아무도 모르는 무작위 값으로 덮는다.
 *      우리도 모르는 값이라 유출될 것 자체가 없다.
 *   2. **검수 계정은 운영 관리자와 분리한다.** 필요하면 최소 권한으로 따로 만들고,
 *      비밀번호는 **환경변수로만** 받는다. 인자·로그·문서·저장소에 남기지 않는다.
 *
 * ── 여기서 원문을 절대 반환하지 않는다
 *   모든 함수는 **건수만** 돌려준다. 호출부가 실수로 찍을 수 있는 값을 애초에 주지 않는다.
 */
import { randomBytes } from 'node:crypto'
import { compareSync, hashSync } from 'bcryptjs'
import { prisma } from '../src/index'

/**
 * 저장소에 평문으로 적혀 있던 공용 개발 비밀번호.
 *
 * **이 값을 쓰는 계정을 찾아내기 위해서만** 존재한다. 새로 부여하지 않는다.
 * 여기 남아 있는 이유는, 이 값으로 만들어진 계정이 어딘가에 아직 있을 수 있어서다.
 */
const LEGACY_SHARED_PASSWORD = 'sacloud1234'

const BCRYPT_ROUNDS = 10

/** 아무도 모르는 비밀번호 해시. 되돌릴 수 없고, 어디에도 기록하지 않는다 */
function unusablePasswordHash(): string {
  // 32바이트 난수 → 그대로 해시하고 버린다. 평문은 이 함수 밖으로 나가지 않는다
  return hashSync(randomBytes(32).toString('base64'), BCRYPT_ROUNDS)
}

export interface RotationResult {
  /** 검사한 계정 수 */
  scanned: number
  /** 공용 비밀번호를 쓰고 있어 무효화한 계정 수 */
  rotated: number
  /** 그중 운영자(role 2) 계정 수 */
  rotatedAdmins: number
  /** 공용 비밀번호가 아니어서 건드리지 않은 계정 수 */
  untouched: number
}

/**
 * 공용 개발 비밀번호를 쓰는 계정을 **로그인 불가**로 만든다.
 *
 * 판별은 `origin`이나 id 규칙이 아니라 **실제로 그 비밀번호가 맞는가**로 한다.
 * 그래야 시드가 아닌 경로로 만들어진 계정에 같은 값이 들어갔더라도 함께 잡힌다.
 * 반대로 정상적으로 만든 계정은 절대 건드리지 않는다.
 *
 * 멱등하다. 두 번 돌려도 두 번째는 `rotated = 0`이다.
 */
export async function rotateSharedDevPasswords(): Promise<RotationResult> {
  const users = await prisma.user.findMany({
    select: { id: true, passwordHash: true, role: true },
  })

  const result: RotationResult = { scanned: users.length, rotated: 0, rotatedAdmins: 0, untouched: 0 }

  for (const user of users) {
    if (!compareSync(LEGACY_SHARED_PASSWORD, user.passwordHash)) {
      result.untouched += 1
      continue
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: unusablePasswordHash() },
    })
    result.rotated += 1
    if (user.role === 2) result.rotatedAdmins += 1
  }

  return result
}

/** 공용 비밀번호로 로그인 가능한 계정이 남아 있는가 (검증용) */
export async function countSharedPasswordAccounts(): Promise<{ total: number; admins: number }> {
  const users = await prisma.user.findMany({ select: { passwordHash: true, role: true } })
  const hits = users.filter((user) => compareSync(LEGACY_SHARED_PASSWORD, user.passwordHash))
  return { total: hits.length, admins: hits.filter((user) => user.role === 2).length }
}

/* -------------------------------------------------------------------------- */
/* 검수 계정                                                                     */
/* -------------------------------------------------------------------------- */

/** 검수 계정 비밀번호를 받는 환경변수. **인자로 받지 않는다** (셸 히스토리에 남는다) */
export const TEST_ACCOUNT_PASSWORD_ENV = 'SACLOUD_TEST_ACCOUNT_PASSWORD'

export interface TestAccountInput {
  email: string
  nickname: string
  /**
   * 운영자 권한을 줄 것인가. **기본은 아니다.**
   *
   * 검수 계정은 원칙적으로 최소 권한(role 0)이다. 관리자 화면을 봐야 한다면
   * 그때만 명시적으로 켜고, **실제 운영 관리자 계정과는 별도로** 둔다.
   */
  admin?: boolean
  env?: NodeJS.ProcessEnv
}

export type TestAccountResult =
  | { ok: true; created: boolean; email: string; role: number }
  | { ok: false; reason: string }

/**
 * 검수 계정을 만들거나 비밀번호를 재설정한다.
 *
 * 비밀번호는 **환경변수로만** 받는다. 함수는 그 값을 저장 외에 아무 데도 쓰지 않고,
 * 결과에도 담지 않는다.
 *
 * ```bash
 * SACLOUD_TEST_ACCOUNT_PASSWORD='...' pnpm nexon:accounts --provision-test --email qa@example.invalid
 * ```
 */
export async function provisionTestAccount(input: TestAccountInput): Promise<TestAccountResult> {
  const env = input.env ?? process.env
  const password = env[TEST_ACCOUNT_PASSWORD_ENV]

  if (!password || password.trim().length < 12) {
    return {
      ok: false,
      reason: `${TEST_ACCOUNT_PASSWORD_ENV} 환경변수에 12자 이상의 비밀번호를 넣어라 (인자로 받지 않는다)`,
    }
  }
  if (compareSync(LEGACY_SHARED_PASSWORD, hashSync(password, BCRYPT_ROUNDS))) {
    return { ok: false, reason: '폐기된 공용 비밀번호는 다시 쓸 수 없다' }
  }

  const role = input.admin === true ? 2 : 0
  const passwordHash = hashSync(password, BCRYPT_ROUNDS)

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  })

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, role } })
    return { ok: true, created: false, email: input.email, role }
  }

  await prisma.user.create({
    data: {
      email: input.email,
      nickname: input.nickname,
      passwordHash,
      role,
      emailVerifiedAt: new Date(),
    },
  })
  return { ok: true, created: true, email: input.email, role }
}
