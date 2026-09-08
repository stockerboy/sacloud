/* 운영 DB 에 ★읽기로★ 붙는다. ★세션 풀러(5432)★ 를 쓴다 — 사이트는 6543 을 쓴다 (D-249)
 *
 * ⚠ `@sacloud/db` 로 못 부른다 — `scripts/` 는 워크스페이스 패키지가 아니라
 *   pnpm 의 node_modules 심볼릭 링크가 없다. ★생성된 클라이언트를 경로로 직접★ 부른다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

/* ⚠ ★한글 경로★ 라 `new URL(...).pathname` 은 퍼센트 인코딩된 값을 준다.
     반드시 `fileURLToPath` 로 풀어야 한다 (2026-09-08 실측 — 서플라이 → %EC%84%9C...) */
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
const clientUrl = pathToFileURL(path.join(root, 'packages', 'db', 'generated', 'client', 'index.js')).href
const { PrismaClient } = await import(clientUrl)

const envFile = path.join(root, 'packages', 'db', '.env.production.local')
const url = /^DATABASE_URL=(.*)$/m.exec(readFileSync(envFile, 'utf8'))[1]
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(':6543', ':5432')

export const prisma = new PrismaClient({ datasources: { db: { url } } })
/** 시즌0 창 — 값의 진실은 `apps/worker/src/lib/season0Window.ts` 다 */
export const FROM = new Date('2026-09-02T22:00:00.000Z')
export const TO = new Date('2026-09-30T15:00:00.000Z')
export const t = (n, w = 8) => String(n).padStart(w)
