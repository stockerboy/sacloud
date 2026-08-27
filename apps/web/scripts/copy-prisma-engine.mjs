/**
 * Prisma 쿼리 엔진을 `apps/web/generated/client/` 로 복사한다 (D-151).
 *
 * ── 왜 필요한가
 *   생성된 Prisma 클라이언트는 `packages/db/generated/client` 에 있다. Next 가 그 클라이언트를
 *   번들하면 모듈이 원래 위치를 잃어서, 런타임에 Prisma 는 네이티브 엔진(`.so.node`)을
 *   **자기가 아는 몇 군데**에서만 찾는다. 로그가 그 목록을 그대로 찍어 준다.
 *
 *     /var/task/apps/web/generated/client      ← 첫 번째로 보는 곳
 *     /var/task/apps/web/.next/server
 *     /vercel/path0/packages/db/generated/client   ← 빌드 시 경로. 런타임에는 없다
 *
 *   `outputFileTracingIncludes` 로 파일을 번들에 넣어도 **원래 상대 경로가 유지되므로**
 *   `packages/db/...` 아래에 떨어진다. Prisma 는 거기를 보지 않는다.
 *   그래서 파일을 애초에 `apps/web/generated/client/` 에 둔다 — 첫 번째 검색 경로다.
 *
 * ── 이 스크립트는 빌드 산출물만 만든다
 *   `apps/web/generated/` 는 커밋하지 않는다. 매 빌드마다 다시 만든다.
 */
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, '..')
const source = join(webRoot, '..', '..', 'packages', 'db', 'generated', 'client')
const target = join(webRoot, 'generated', 'client')

if (!existsSync(source)) {
  console.error(`[prisma-engine] 원본이 없다: ${source}`)
  console.error('[prisma-engine] `prisma generate` 를 먼저 돌려야 한다')
  process.exit(1)
}

mkdirSync(target, { recursive: true })

/* 네이티브 엔진만 옮긴다. 클라이언트 JS 는 Next 가 번들한다 */
const engines = readdirSync(source).filter(
  (name) => /^libquery_engine-.*\.so\.node$/.test(name) || /^query_engine-.*\.node$/.test(name),
)

if (engines.length === 0) {
  console.error('[prisma-engine] 엔진 파일을 찾지 못했다. binaryTargets 를 확인한다')
  process.exit(1)
}

for (const name of engines) {
  copyFileSync(join(source, name), join(target, name))
  console.info(`[prisma-engine] 복사 ${name}`)
}
console.info(`[prisma-engine] → ${target}`)
