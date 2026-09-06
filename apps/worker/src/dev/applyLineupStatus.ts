/**
 * ★lineupStatus 칸을 붙인다★ (2026-09-06 · Part 4). ★칸 추가뿐 — 값은 안 건드린다.★
 *
 * `prisma migrate deploy` 를 쓰지 않는다 — 이 저장소는 로컬/운영 이력이 어긋나 있어
 * 그 명령이 ★멀쩡한 운영 DB 를 되돌리려 들 수 있다★. DDL 만 직접 넣는다.
 */
import { prisma } from '@sacloud/db'
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] ?? '20260906120000_match_lineup_status'
const raw = readFileSync(`../../packages/db/prisma/migrations/${FILE}/migration.sql`, 'utf8')
const sql = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')

for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
  try {
    await prisma.$executeRawUnsafe(stmt)
    console.info(`  ✔ ${stmt.replace(/\s+/g, ' ').slice(0, 78)}`)
  } catch (e) {
    console.info(`  ✘ ${(e as Error).message.split('\n').slice(-2).join(' ').slice(0, 110)}`)
  }
}
const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = ANY(ARRAY['Match','LeaguePlayerSeason'])
      AND (column_name LIKE 'lineup%' OR column_name IN ('games','dropoutCount','rifleGames','rifleKill','rifleDeath','sniperGames','sniperKill','sniperDeath'))
    ORDER BY 1`)
console.info('\n★붙은 칸★')
for (const c of cols) console.info(`  ${c.column_name} · ${c.data_type}`)
const [n] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
  `SELECT COUNT(*)::int AS n FROM "Match" WHERE "lineupStatus" IS NOT NULL`)
console.info(`\n★값이 든 줄★ ${n?.n ?? 0}개 (붙인 직후이므로 0 이어야 한다)`)
await prisma.$disconnect()
