/**
 * sanply 래더 백업 — `nexon rating-backup` 이 죽어서 만든 **대체 백업**.
 *
 * ── 왜 필요한가
 *   `rating-backup` 은 리그 전체의 `MatchPlayerStat` 을 한 번에 findMany 한다.
 *   supply(130만 행 · 492MB)는 통과했지만 sanply(202만 행)는
 *   `Failed to convert rust String into napi string` 로 죽는다.
 *   Prisma 의 결과 변환이 V8 문자열 한계에 걸린 것이다.
 *
 * ── 그래서 무엇을 담는가
 *   `season0Apply` 가 **실제로 쓰는 표만** 담는다:
 *     LeaguePlayer · LeagueClan · LeaguePlayerWeaponStat
 *   `MatchPlayerStat` 과 `Match` 는 `season0Apply` 가 한 줄도 건드리지 않으므로
 *   (파일 전체를 읽어 확인했다) 되돌릴 대상이 아니다. 개수만 세어 기록해 둔다.
 *
 * ── 읽기 전용이다. 이 스크립트는 DB 에 아무것도 쓰지 않는다.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PrismaClient } from '../generated/client/index.js'

const SLUG = process.argv[2] ?? 'sanply'
const OUT_DIR = process.argv[3] ?? 'C:/Users/LG/Desktop/서플라이/apps/worker/backups/rating'

const prisma = new PrismaClient()

const league = await prisma.league.findUnique({ where: { slug: SLUG }, select: { id: true, slug: true } })
if (!league) throw new Error(`리그를 찾을 수 없다: ${SLUG}`)

const leaguePlayers = await prisma.leaguePlayer.findMany({
  where: { leagueId: league.id },
  orderBy: { id: 'asc' },
})
const leagueClans = await prisma.leagueClan.findMany({
  where: { leagueId: league.id },
  orderBy: { id: 'asc' },
})
const weaponStats = await prisma.leaguePlayerWeaponStat.findMany({
  where: { leaguePlayerId: { in: leaguePlayers.map((r) => r.id) } },
  orderBy: [{ leaguePlayerId: 'asc' }, { weapon: 'asc' }],
})

/* 되돌릴 대상은 아니지만, 반영 전후로 변하지 않았음을 확인할 수 있게 개수를 박아 둔다 */
const untouched = {
  matchPlayerStats: await prisma.matchPlayerStat.count({ where: { match: { leagueId: league.id } } }),
  matches: await prisma.match.count({ where: { leagueId: league.id } }),
}

const body = { leaguePlayers, leagueClans, weaponStats }
const json = JSON.stringify(body, (_k, v) => (v instanceof Date ? v.toISOString() : v))
const checksum = createHash('sha256').update(json).digest('hex').slice(0, 32)

const takenAt = new Date().toISOString()
const snapshot = {
  version: 1,
  kind: 'season0Apply-writable-tables',
  leagueSlug: league.slug,
  takenAt,
  note:
    'nexon rating-backup 이 sanply 크기에서 죽어 만든 대체 백업. ' +
    'season0Apply 가 쓰는 표만 담는다 (MatchPlayerStat · Match 는 건드리지 않는다)',
  counts: {
    leaguePlayers: leaguePlayers.length,
    leagueClans: leagueClans.length,
    weaponStats: weaponStats.length,
  },
  untouched,
  checksum,
  ...JSON.parse(json),
}

mkdirSync(OUT_DIR, { recursive: true })
const path = `${OUT_DIR}/${league.slug}-writable-${takenAt.replace(/[:.]/g, '-')}.json`
writeFileSync(path, JSON.stringify(snapshot, null, 1), 'utf8')

console.log(`백업 완료 — ${path}`)
console.log(
  `  LeaguePlayer ${snapshot.counts.leaguePlayers} · LeagueClan ${snapshot.counts.leagueClans} · ` +
    `LeaguePlayerWeaponStat ${snapshot.counts.weaponStats}`,
)
console.log(`  건드리지 않는 표 — MatchPlayerStat ${untouched.matchPlayerStats} · Match ${untouched.matches}`)
console.log(`  checksum ${checksum}`)

await prisma.$disconnect()
