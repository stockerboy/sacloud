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
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.sacloudPrisma = prisma
}

export * from '../generated/client/index.js'
