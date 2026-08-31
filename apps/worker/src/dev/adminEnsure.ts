/**
 * **관리자 계정 만들기 / 비밀번호 새로 정하기** (2026-08-31 사용자 요청).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/adminEnsure.ts --email a@naver.com            # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/adminEnsure.ts --email a@naver.com --confirm  # 실제
 * node scripts/prod-run.mjs admin-ensure --email a@naver.com --confirm                          # 운영
 * ```
 *
 * ── 하는 일
 *   · 그 이메일의 사용자가 없으면 **만든다**
 *   · 있으면 `role` 을 관리자(2)로 올리고 **비밀번호를 새로 정한다**
 *   · 이메일 인증을 완료 표시한다 (메일 발송이 아직 없다 — `CLAUDE.md` 8장 숙제)
 *
 * ── 비밀번호
 *   `--password` 로 직접 줄 수 있다. 안 주면 **여기서 만들어 화면에 한 번 찍는다.**
 *   찍힌 그 순간이 유일하게 볼 수 있는 때다 — DB 에는 bcrypt 해시만 남는다.
 *
 * ── 왜 스크립트인가
 *   가입 화면은 네이버 메일만 받고(`SIGNUP_ALLOWED_EMAIL_DOMAINS`) 관리자 승격 화면이 없다.
 *   관리자를 만드는 길이 지금은 이것뿐이다.
 *
 * ⚠ 비밀번호를 로그 파일에 남기지 마라. 화면에서 읽고 바로 쓰고 지운다.
 */
import { randomBytes } from 'node:crypto'
import { prisma } from '@sacloud/db'
import bcrypt from 'bcryptjs'

/** `apps/web/lib/server/session.ts` 의 `ADMIN_ROLE` 과 같아야 한다 */
const ADMIN_ROLE = 2
/** 가입 화면과 같은 비용 (`hashSync(password, 10)`) */
const BCRYPT_COST = 10

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const confirm = process.argv.includes('--confirm')

const email = (arg('email') ?? '').trim().toLowerCase()
if (!email) {
  console.error('--email <주소> 가 필요하다')
  process.exit(1)
}
const nickname = (arg('nickname') ?? '관리자').trim()

/** 사람이 옮겨 적기 쉬운 글자만 쓴다 — 헷갈리는 0/O/1/l/I 를 뺀다 */
function makePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(20)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

const password = arg('password') ?? makePassword()
if (password.length < 8) {
  console.error('비밀번호는 8자 이상이어야 한다 (가입 규칙과 같다)')
  process.exit(1)
}

const existing = await prisma.user.findUnique({
  where: { email },
  select: { id: true, nickname: true, role: true },
})

console.info(`대상 ${email}`)
console.info(existing ? `  이미 있다 — 닉 ${existing.nickname} · role ${existing.role}` : '  없다 — 새로 만든다')
console.info(`  할 일: role 을 ${ADMIN_ROLE}(관리자) 로 두고 비밀번호를 새로 정한다`)

if (!confirm) {
  console.info('\n--confirm 없이는 한 줄도 쓰지 않았다')
  await prisma.$disconnect()
  process.exit(0)
}

const passwordHash = bcrypt.hashSync(password, BCRYPT_COST)
const now = new Date()

const user = await prisma.user.upsert({
  where: { email },
  create: { email, passwordHash, nickname, role: ADMIN_ROLE, emailVerifiedAt: now },
  update: { passwordHash, role: ADMIN_ROLE, emailVerifiedAt: now },
  select: { id: true, email: true, nickname: true, role: true },
})

console.info('\n관리자 준비 완료')
console.info(`  이메일   ${user.email}`)
console.info(`  비밀번호 ${password}`)
console.info(`  닉네임   ${user.nickname}`)
console.info(`  role     ${user.role} (관리자)`)
console.info('\n⚠ 비밀번호는 지금 이 화면에서만 볼 수 있다. DB 에는 해시만 남는다.')

await prisma.$disconnect()
