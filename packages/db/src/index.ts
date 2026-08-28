/**
 * Prisma 클라이언트 단일 인스턴스.
 *
 * Next.js 개발 모드는 파일이 바뀔 때마다 모듈을 다시 평가하므로,
 * 그때마다 `new PrismaClient()`를 만들면 연결이 계속 쌓여 결국 커넥션이 고갈된다.
 * `globalThis`에 캐시해 하나만 쓰게 한다.
 *
 * **운영(서버리스)에서도 캐시한다.** 예전에는 개발 모드에서만 캐시했는데,
 * 서버리스 인스턴스 하나 안에서 이 모듈이 두 번 평가되면(번들 청크가 나뉘면 생긴다)
 * 쿼리 엔진 프로세스가 하나 더 뜨고 커넥션도 하나 더 잡는다.
 * 인스턴스 수명이 곧 클라이언트 수명이라 캐시가 오래 남을 위험도 없다.
 */
import { PrismaClient } from '../generated/client/index.js'

const globalForPrisma = globalThis as unknown as { sacloudPrisma?: PrismaClient }

/**
 * 풀러(pgbouncer transaction mode) 뒤에 있는데 설정이 빠졌는지 본다.
 *
 * Supabase 의 6543 포트는 **transaction pooler** 다. 여기서는 세션이 매 트랜잭션마다
 * 바뀌므로 Prisma 가 기본으로 쓰는 prepared statement 가 살아남지 못한다.
 * `pgbouncer=true` 가 없으면 `prepared statement "s0" already exists` 로 간헐적으로 죽고,
 * `connection_limit=1` 이 없으면 람다마다 커넥션을 여러 개 잡아 풀을 말린다.
 *
 * 값을 **고쳐 주지는 않는다** — 6543 을 직결로 쓰는 구성도 있을 수 있어서다.
 * 경고만 남긴다. URL 자체는 절대 찍지 않는다(비밀번호가 들어 있다).
 */
function warnIfPoolerMisconfigured(url: string | undefined): void {
  if (!url) return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.port !== '6543') return

  const missing: string[] = []
  if (parsed.searchParams.get('pgbouncer') !== 'true') missing.push('pgbouncer=true')
  if (!parsed.searchParams.has('connection_limit')) missing.push('connection_limit=1')
  if (missing.length > 0) {
    console.warn(
      `[db] DATABASE_URL 이 transaction pooler(6543) 인데 ${missing.join(' · ')} 가 없다. ` +
        '서버리스에서 커넥션이 새거나 prepared statement 오류가 난다.',
    )
  }
}

if (!globalForPrisma.sacloudPrisma) warnIfPoolerMisconfigured(process.env.DATABASE_URL)

export const prisma: PrismaClient =
  globalForPrisma.sacloudPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    /**
     * 기본 `errorFormat`은 오류마다 **소스 발췌를 붙이는데**, 번들된 Prisma 런타임에서는
     * 그 발췌가 압축된 코드 수천 자다. DB가 안 떠 있을 때 로그가 통째로 묻힌다(실제로 겪었다).
     * 원인만 보이게 줄인다.
     */
    errorFormat: 'minimal',
  })

globalForPrisma.sacloudPrisma = prisma

export * from '../generated/client/index.js'
