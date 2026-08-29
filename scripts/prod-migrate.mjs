/**
 * 운영 DB 에 **밀린 마이그레이션만** 적용한다 (D-194).
 *
 * ```
 * node scripts/prod-migrate.mjs            # 무엇이 밀렸는지 보여주기만 한다
 * node scripts/prod-migrate.mjs --confirm  # 실제 적용
 * ```
 *
 * ── 왜 스크립트로 감싸는가
 *   1. 운영 접속 주소를 **명령줄에 노출하지 않는다** (비밀번호가 들어 있다).
 *      `packages/db/.env.production.local` 에서 읽어 자식 프로세스에만 넘긴다.
 *   2. `prisma migrate dev` 를 **절대 쓰지 않는다.** 그건 드리프트가 있으면
 *      DB 리셋을 요구한다. 여기서는 `migrate deploy` 만 쓴다 —
 *      밀린 것을 순서대로 적용하고 그 외에는 아무것도 하지 않는다.
 *   3. `--confirm` 없이는 **상태만 보여준다.**
 *
 * ── 안전한 이유
 *   지금 밀린 마이그레이션 셋은 전부 `IF NOT EXISTS` 로 **추가만** 한다.
 *   `DROP` 도 `UPDATE` 도 없다. 이미 있는 것은 건너뛴다.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const confirm = process.argv.includes('--confirm')

let url
try {
  const text = readFileSync('packages/db/.env.production.local', 'utf8')
  url = (text.match(/DATABASE_URL="([^"]+)"/) ?? [])[1]
} catch {
  console.error('packages/db/.env.production.local 을 읽지 못했다. 저장소 루트에서 실행해야 한다.')
  process.exit(1)
}
if (!url) {
  console.error('그 파일에 DATABASE_URL 이 없다.')
  process.exit(1)
}

/**
 * 마이그레이션은 **풀러로 돌리면 안 된다.**
 *
 * 운영 `DATABASE_URL` 은 Supabase **transaction pooler(6543)** 다. 앱 런타임에는 맞지만,
 * 마이그레이션은 세션 단위 기능(자문 잠금 `advisory lock`)을 쓰기 때문에 거기서는
 * **잡히지 않고 그대로 멈춘다.** 실제로 `migrate status` 가 응답 없이 멈추는 것을 봤다.
 *
 * 같은 호스트의 **5432 는 session pooler** 다. 자격증명은 같고 포트만 다르다.
 * 그래서 여기서 포트를 바꾸고 풀러 전용 옵션(`pgbouncer` · `connection_limit`)을 뗀다.
 * **앱이 쓰는 주소는 건드리지 않는다** — 이 프로세스 안에서만 만든 주소다.
 */
function migrationUrlOf(runtimeUrl) {
  const parsed = new URL(runtimeUrl)
  if (parsed.port === '6543') parsed.port = '5432'
  parsed.searchParams.delete('pgbouncer')
  parsed.searchParams.delete('connection_limit')
  parsed.searchParams.delete('pool_timeout')
  return parsed.toString()
}

/** 주소는 **호스트만** 찍는다. 전체 URL 은 절대 찍지 않는다 */
const host = new URL(url).host
if (host.includes('127.0.0.1') || host.includes('localhost')) {
  console.error(`대상이 로컬이다 (${host}). 이 스크립트는 운영용이다.`)
  process.exit(1)
}
const migrationUrl = migrationUrlOf(url)
const migrationHost = new URL(migrationUrl).host
console.info(`앱이 쓰는 주소  : ${host}`)
console.info(`마이그레이션 주소: ${migrationHost}  ← 풀러(6543)로는 마이그레이션이 멈춘다`)
console.info(confirm ? '적용한다 (migrate deploy)' : '상태만 본다 — 실제로 적용하려면 --confirm')

const run = (args) =>
  spawnSync('pnpm', ['--filter', '@sacloud/db', 'exec', 'prisma', ...args], {
    env: { ...process.env, DATABASE_URL: migrationUrl },
    stdio: 'inherit',
    shell: true,
  })

const result = run(confirm ? ['migrate', 'deploy'] : ['migrate', 'status'])
process.exit(result.status ?? 1)
