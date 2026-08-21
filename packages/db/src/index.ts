/**
 * Prisma 클라이언트 단일 인스턴스.
 *
 * Next.js 개발 모드는 파일이 바뀔 때마다 모듈을 다시 평가하므로,
 * 그때마다 `new PrismaClient()`를 만들면 연결이 계속 쌓여 결국 커넥션이 고갈된다.
 * `globalThis`에 캐시해 개발 중에는 하나만 쓰게 한다.
 */
import { PrismaClient } from '../generated/client/index.js'

const globalForPrisma = globalThis as unknown as { sacloudPrisma?: PrismaClient }

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

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.sacloudPrisma = prisma
}

export * from '../generated/client/index.js'
