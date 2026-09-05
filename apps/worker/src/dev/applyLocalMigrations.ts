/** ★로컬 DB 에 최근 마이그레이션 DDL 을 직접 넣는다★ — 로컬은 마이그레이션 이력이 어긋나 있다 */
import { prisma } from '@sacloud/db'
import { readFileSync } from 'node:fs'
const url = process.env['DATABASE_URL'] ?? ''
if (!/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('★로컬에서만★')
const files = [
  '20260905050000_match_superseded',
  '20260905060000_match_new_unique',
]
for (const f of files) {
  const raw = readFileSync(`../../packages/db/prisma/migrations/${f}/migration.sql`, 'utf8')
  const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      await prisma.$executeRawUnsafe(stmt)
      console.info(`✔ ${f} · ${stmt.slice(0, 60).replace(/\s+/g, ' ')}`)
    } catch (e) {
      console.info(`✘ ${f} · ${(e as Error).message.split('\n').find((x) => x.includes('Message'))?.slice(0, 110) ?? (e as Error).message.slice(0, 110)}`)
    }
  }
}
const cols = await prisma.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name='Match' AND column_name LIKE 'superseded%' ORDER BY 1`)
console.info('★칸 확인★ ' + JSON.stringify(cols))
await prisma.$disconnect()
