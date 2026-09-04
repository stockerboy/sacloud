import { prisma } from '@sacloud/db'
import { readFileSync } from 'node:fs'
const raw = readFileSync('../../packages/db/prisma/migrations/20260904180000_season_card_source_league/migration.sql', 'utf8')
const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
  await prisma.$executeRawUnsafe(stmt)
  console.info('실행: ' + stmt.slice(0, 70))
}
const cols = await prisma.$queryRawUnsafe(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name='LeaguePlayerSeason' AND column_name IN ('sourceLeagueSlug','sourceFetchedAt') ORDER BY 1`)
console.info('★칸 확인★ ' + JSON.stringify(cols))
await prisma.$disconnect()
