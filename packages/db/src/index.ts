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

/**
 * **로컬 개발 DB 에만** 커넥션 상한을 붙인다 (D-187).
 *
 * ── 진짜 원인은 우리 코드가 아니었다 (2026-08-30 실측)
 *   테스트 전체 실행에서 매번 1~3건이 `Can't reach database server at 127.0.0.1:5433` 로
 *   실패했고 **실패하는 파일이 실행마다 바뀌었다.** 며칠 동안 "원인 미상" 이었다.
 *
 *   원인은 이 컴퓨터의 **소켓 계층**이다. Prisma 도 PostgreSQL 도 vitest 도 아니다.
 *   생 TCP 로 재 봤다 (node `net.connect`, 프로젝트 코드 한 줄도 안 거침):
 *   ```
 *   127.0.0.1:5433 (열린 포트)  200회 중 3회 EFAULT
 *   127.0.0.1:5433 (다른 시점)  100회 중 21회 EFAULT
 *   127.0.0.1:59999 (닫힌 포트) 60회 중 3회 EFAULT · 나머지는 정상 ECONNREFUSED
 *   ```
 *   **닫힌 포트에 붙을 때도 EFAULT 가 난다.** 즉 상대가 PostgreSQL 인지와 무관하다.
 *   `EFAULT`(WSAEFAULT)는 네트워크 오류가 아니라 **시스템 호출 인자가 잘못됐다**는 뜻이라
 *   정상적인 소켓 사용에서는 나올 수 없는 값이다. 같은 이유로 `next dev` 의
 *   `listen()` 도 `EFAULT` 로 죽어서 이 환경에서는 개발 서버가 아예 뜨지 않는다.
 *   연결 간격을 0ms · 5ms · 20ms 로 벌려도 실패율이 그대로였다 — 몰림 문제도 아니다.
 *
 *   고칠 곳은 저장소가 아니라 **컴퓨터**다 (`netsh winsock reset` + 재부팅 ·
 *   네트워크 필터 드라이버 점검). 저장소에서 할 수 있는 것은 노출 횟수를 줄이는 것뿐이다.
 *
 * ── 그래서 상한을 둔다
 *   Prisma 기본 풀은 `CPU × 2 + 1`(이 컴퓨터에서 17)이라 그만큼 커넥션을 연다.
 *   5로 줄이면 **여는 횟수 자체가 줄어** 그 확률에 노출되는 빈도가 준다.
 *   근본 해결이 아니라 **완화**다. 실측: 5에서 가장 안정적이었고
 *   8·12 에서는 첫 연결부터 실패해 테스트가 통째로 skip 되는 일이 잦았다.
 *
 * ── 왜 루프백에서만 하는가
 *   운영은 Supabase **transaction pooler(6543)** 라 성격이 완전히 다르다.
 *   거기 값을 우리가 여기서 정하면 안 된다. 그래서 호스트가 루프백일 때만,
 *   그리고 URL 에 이미 `connection_limit` 이 없을 때만 붙인다.
 *   **URL 을 로그에 찍지 않는다** (비밀번호가 들어 있다).
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/** `[미확인]` 실측으로 고른 값이다. 사양에 없는 우리 값이라 원본과 무관하다 */
const LOCAL_CONNECTION_LIMIT = 5

function localDatasourceUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) return undefined
  if (parsed.searchParams.has('connection_limit')) return undefined

  parsed.searchParams.set('connection_limit', String(LOCAL_CONNECTION_LIMIT))
  return parsed.toString()
}

/**
 * **긴 배치 잡을 세션 풀러(5432)로 보낸다** (2026-09-01 · D-249 후속).
 *
 * ── 무엇을 봤나
 *   운영 DB 에 직접 붙어 재 봤다.
 *
 *   ```
 *   max_connections   60      ← 최대 60
 *   현재 총 접속       17      ← 43자리가 놀고 있다
 *   그중 Supavisor    5개     ← 중계기가 Postgres 로 여는 것은 겨우 5개
 *   ```
 *
 *   **Postgres 는 한가한데 중계기가 문을 5개만 열어 두고 손님을 돌려보내고 있었다.**
 *   그래서 사이트가 `ECHECKOUTTIMEOUT` 으로 20초 뒤 500 을 냈다 (D-249 후속 ③).
 *
 * ── 왜 수집만 옮기는가
 *   두 통로는 **풀이 서로 다르다.**
 *
 *   ```
 *   6543 transaction pooler   요청마다 붙었다 떨어진다. **서버리스(사이트)에 맞다**
 *   5432 session pooler       붙어 있는 동안 Postgres 커넥션을 하나 쥔다
 *                             → 람다 수백 개에는 못 쓴다. **긴 프로세스 하나에는 맞다**
 *   ```
 *
 *   수집 잡(`apps/worker`)은 **한 번에 하나만 도는 긴 프로세스**다. 세션 풀러가
 *   정확히 그런 것을 위한 통로이고, 옮기면 **6543 의 자리 하나가 사이트에게 돌아간다.**
 *   자리가 5개뿐인 상황에서 하나는 20% 다.
 *
 * ── ⚠ 사이트(`apps/web`)에는 절대 켜지 마라
 *   서버리스는 람다가 수십 개 뜬다. 그것들이 세션 모드로 붙으면 **Postgres 커넥션
 *   60개를 그대로 먹어치우고** DB 자체가 멎는다. 지금 6543 을 쓰는 것이 옳다.
 *   그래서 기본값이 «끔» 이고, 켜는 것은 **환경변수를 명시적으로 준 곳뿐**이다.
 *
 * ── 왜 새 시크릿을 만들지 않는가
 *   비밀번호를 한 번 더 복사해 두면 샐 자리가 하나 더 생긴다. 기존 `DATABASE_URL` 의
 *   **포트만 바꿔** 쓴다. 호스트·사용자·비밀번호는 그대로다.
 *
 * ── `pgbouncer=true` 를 떼는 이유
 *   그 옵션은 **트랜잭션 모드에서 prepared statement 가 못 사는 것**을 피하려고 붙인다.
 *   세션 모드에서는 문장이 살아 있으므로 붙일 이유가 없고, 붙이면 오히려 손해다.
 */
function sessionPoolerUrl(url: string | undefined): string | undefined {
  if (process.env.SACLOUD_DB_SESSION_POOLER !== '1') return undefined
  if (!url) return undefined

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }

  /* 트랜잭션 풀러(6543)일 때만 옮긴다. 직결이나 로컬은 건드리지 않는다 */
  if (parsed.port !== '6543') return undefined

  parsed.port = '5432'
  parsed.searchParams.delete('pgbouncer')
  /* 세션 모드는 **붙어 있는 내내 Postgres 커넥션을 쥔다.** 넉넉히 잡으면 안 된다 */
  parsed.searchParams.set('connection_limit', '2')
  parsed.searchParams.set('connect_timeout', '30')
  parsed.searchParams.set('pool_timeout', '30')

  /* URL 은 절대 찍지 않는다 (비밀번호가 들어 있다). 옮겼다는 사실만 남긴다 */
  console.info('[db] 세션 풀러(5432)로 붙는다 — 긴 배치 잡용. 사이트는 6543 을 쓴다 (D-249)')
  return parsed.toString()
}

const localUrl = localDatasourceUrl(process.env.DATABASE_URL)
const sessionUrl = sessionPoolerUrl(process.env.DATABASE_URL)
/** 실제로 쓸 접속 주소. 둘 다 없으면 `DATABASE_URL` 을 그대로 쓴다 */
const overrideUrl = localUrl ?? sessionUrl

/**
 * **로컬에서만** 커넥션 실패(`P1001`)를 다시 시도한다 (D-187).
 *
 * 위 주석의 EFAULT 는 커넥션이 **아예 열리지 않은** 상태다. 그러면 쿼리가 서버에서
 * 실행됐을 리가 없으므로 쓰기 작업이라도 다시 보내는 것이 안전하다 —
 * "보냈는데 응답을 못 받은" 경우와 다르다.
 *
 * 실측(동시 10 x 20회 = 커넥션 200): 첫 시도 실패 45건 → 재시도로 44건 회복 → 최종 1건.
 * `connection_limit` 만으로는 47% → 27% 밖에 못 줄였다. **재시도가 핵심이다.**
 *
 * vitest 의 `--retry` 로는 이걸 못 잡는다. 남는 실패가 대부분 `beforeAll`/`afterAll`
 * 훅 안에서 나는데 vitest 는 훅을 다시 돌리지 않는다.
 */
const RETRY_DELAYS_MS = [25, 50, 75, 100, 150, 250, 400, 600]

/**
 * "커넥션이 아예 안 열렸다"(`P1001`)인가.
 *
 * ⚠ **Prisma 는 오류 종류에 따라 코드를 다른 칸에 담는다.**
 * 쿼리 중 실패는 `PrismaClientKnownRequestError.code`, 클라이언트가 처음 붙을 때 실패는
 * `PrismaClientInitializationError.errorCode` 다. 한쪽만 보면 **처음 붙을 때의 실패를
 * 통째로 놓친다** — 테스트가 최상위에서 `SELECT 1` 로 DB 를 확인하는 자리가 정확히 그곳이라,
 * 그때 실패하면 테스트가 실패가 아니라 **조용히 skip** 된다.
 */
function isUnreachable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const holder = error as { code?: unknown; errorCode?: unknown }
  return holder.code === 'P1001' || holder.errorCode === 'P1001'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function createClient(): PrismaClient {
  const base = new PrismaClient({
    ...(overrideUrl ? { datasources: { db: { url: overrideUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    /**
     * 기본 `errorFormat`은 오류마다 **소스 발췌를 붙이는데**, 번들된 Prisma 런타임에서는
     * 그 발췌가 압축된 코드 수천 자다. DB가 안 떠 있을 때 로그가 통째로 묻힌다(실제로 겪었다).
     * 원인만 보이게 줄인다.
     */
    errorFormat: 'minimal',
  })

  /* 운영에서는 **재시도하지 않는다.** 거기서 P1001 이 나면 그건 진짜 장애이고,
     조용히 덮으면 장애를 못 본다. 로컬의 깨진 소켓과 성격이 다르다 */
  if (!localUrl) return base

  const extended = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastError: unknown
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await query(args)
          } catch (error) {
            if (!isUnreachable(error)) throw error
            lastError = error
            const delay = RETRY_DELAYS_MS[attempt]
            if (delay === undefined) throw lastError
            await sleep(delay)
          }
        }
      },
    },
  })

  /* 확장 클라이언트는 타입이 달라지지만 **동작은 같다** — 재시도만 얹혔다.
     이 캐스팅이 없으면 이 모듈을 쓰는 쪽이 전부 새 타입을 알아야 한다 */
  return extended as unknown as PrismaClient
}

export const prisma: PrismaClient = globalForPrisma.sacloudPrisma ?? createClient()

globalForPrisma.sacloudPrisma = prisma

export * from '../generated/client/index.js'
