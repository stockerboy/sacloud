/**
 * **가짜 시드 리그 삭제** — 공식전 · 세컨드 · 친목전 · 토너먼트 (2026-08-31 사용자 지시).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/mockLeaguePurge.ts            # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/mockLeaguePurge.ts --confirm  # 실제 삭제
 * node scripts/prod-run.mjs mock-league-purge --confirm                        # 운영
 * ```
 *
 * ── 무엇인가
 *   Phase 0~7 에서 **화면을 만들려고 넣은 픽스처**다. 실존하지 않는다.
 *   ```
 *   경기 3,000건 전부 origin='mock'      진짜 경기 0건
 *   클랜 이름도 지어낸 것                 뇌운기병대 · 동편전위대 · 서산수색대 …
 *   sourceClanId 없음                    원본과 대조할 근거가 없다 = 실존 클랜이 아니다
 *   ```
 *   사용자 지시: *"가짜 시드 전부 삭제해 방해되잖아"*
 *
 * ── 안전 장치
 *   · `--confirm` 없이는 한 줄도 지우지 않는다
 *   · **지우기 전에 백업 JSON 을 뜬다.** 되돌릴 수 있어야 지운다 (3-A 7번의 정신)
 *   · 진짜 데이터가 하나라도 걸리면 **멈춘다.** 아래 셋 중 하나라도 0 이 아니면 중단:
 *       - 이 리그의 `Match` 중 `origin <> 'mock'`
 *       - 지울 `Clan` 중 `sourceClanId` 가 있는 것
 *       - 지울 `Player` 중 `origin <> 'mock'`
 *   · **다른 리그에도 있는 클랜·선수는 지우지 않는다.** 여기에만 있는 것만 지운다
 *   · DPL · IPL · 열산 · 대룰은 건드리지 않는다
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

const SLUGS = ['officialmain', 'secondline', 'friendly01', 'tourney2026']
const confirm = process.argv.includes('--confirm')

const leagues = await prisma.league.findMany({
  where: { slug: { in: SLUGS } },
  select: { id: true, slug: true, name: true },
})
if (leagues.length === 0) {
  console.info('대상 리그가 없다. 이미 지워졌거나 이 DB 에는 없다.')
  await prisma.$disconnect()
  process.exit(0)
}
const ids = leagues.map((l) => l.id)
console.info(`대상 ${leagues.length}곳 — ${leagues.map((l) => `${l.name}(${l.slug})`).join(' · ')}\n`)

/* ---------------------------------------------------------------- 안전 검사 --- */

const realMatches = await prisma.match.count({
  where: { leagueId: { in: ids }, origin: { not: 'mock' } },
})

/** 이 리그들에만 있는 클랜 */
const onlyHereClans = await prisma.clan.findMany({
  where: {
    leagueClans: { some: { leagueId: { in: ids } } },
    NOT: { leagueClans: { some: { leagueId: { notIn: ids } } } },
  },
  select: { id: true, slug: true, name: true, sourceClanId: true },
})
const realClans = onlyHereClans.filter((c) => c.sourceClanId !== null)

/** 이 리그들에만 있는 선수 */
const onlyHerePlayers = await prisma.player.findMany({
  where: {
    leaguePlayers: { some: { leagueId: { in: ids } } },
    NOT: { leaguePlayers: { some: { leagueId: { notIn: ids } } } },
  },
  select: { id: true, name: true, origin: true },
})
const realPlayers = onlyHerePlayers.filter((p) => p.origin !== 'mock')

console.info('안전 검사')
console.info(`  mock 아닌 경기        ${realMatches}`)
console.info(`  원본id 있는 클랜       ${realClans.length}`)
console.info(`  mock 아닌 선수        ${realPlayers.length}`)

if (realMatches > 0 || realClans.length > 0 || realPlayers.length > 0) {
  console.error('\n⚠ 진짜 데이터가 걸린다. **지우지 않는다.**')
  if (realClans.length) console.error(`  클랜: ${realClans.slice(0, 5).map((c) => c.name).join(', ')}`)
  if (realPlayers.length) console.error(`  선수: ${realPlayers.slice(0, 5).map((p) => p.name).join(', ')}`)
  await prisma.$disconnect()
  process.exit(1)
}
console.info('  → 진짜 데이터 없음. 지워도 안전하다\n')

/* ------------------------------------------------------------------- 규모 --- */

const counts = {
  leagues: leagues.length,
  matches: await prisma.match.count({ where: { leagueId: { in: ids } } }),
  stats: await prisma.matchPlayerStat.count({ where: { match: { leagueId: { in: ids } } } }),
  leagueClans: await prisma.leagueClan.count({ where: { leagueId: { in: ids } } }),
  leaguePlayers: await prisma.leaguePlayer.count({ where: { leagueId: { in: ids } } }),
  seasons: await prisma.season.count({ where: { leagueId: { in: ids } } }),
  clans: onlyHereClans.length,
  players: onlyHerePlayers.length,
}
console.info('지울 것')
for (const [k, v] of Object.entries(counts)) console.info(`  ${k.padEnd(16)} ${v.toLocaleString()}`)

if (!confirm) {
  console.info('\n--confirm 없이는 한 줄도 지우지 않았다')
  await prisma.$disconnect()
  process.exit(0)
}

/* ------------------------------------------------------------------- 백업 --- */

const dir = join(REPO_ROOT, 'apps', 'worker', 'backups', 'mock-league')
mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = join(dir, `purge-${stamp}.json`)

const backup = {
  purgedAt: new Date().toISOString(),
  reason: '가짜 시드 리그 삭제 (사용자 지시 2026-08-31)',
  leagues,
  counts,
  clans: onlyHereClans,
  players: onlyHerePlayers.map((p) => ({ id: p.id, name: p.name })),
  matches: await prisma.match.findMany({
    where: { leagueId: { in: ids } },
    select: {
      id: true, leagueId: true, startAt: true, winnerSide: true,
      redLeagueClanId: true, blueLeagueClanId: true, origin: true, sourceMatchId: true,
    },
  }),
}
writeFileSync(file, JSON.stringify(backup), 'utf8')
console.info(`\n백업을 떴다: ${file}`)

/* ------------------------------------------------------------------- 삭제 --- */

/* 순서가 중요하다 — 자식부터 지운다. `Match` 는 cascade 라 `MatchPlayerStat` 이 따라간다 */
const delStats = await prisma.matchPlayerStat.deleteMany({ where: { match: { leagueId: { in: ids } } } })
const delMatches = await prisma.match.deleteMany({ where: { leagueId: { in: ids } } })
const delLP = await prisma.leaguePlayer.deleteMany({ where: { leagueId: { in: ids } } })
const delLC = await prisma.leagueClan.deleteMany({ where: { leagueId: { in: ids } } })
const delSeason = await prisma.season.deleteMany({ where: { leagueId: { in: ids } } })
/*
  선수·클랜은 **묶어서 조금씩** 지운다.
  운영(Supabase)에서 810명을 한 번에 지우다가 `statement timeout` 이 났다 (2026-08-31).
  다른 표의 참조를 확인하느라 오래 걸린다. 한 번에 50명씩 끊는다.
*/
const CHUNK = 50
const chunk = <T,>(xs: T[]) => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK))
  return out
}

let deletedPlayers = 0
for (const part of chunk(onlyHerePlayers.map((p) => p.id))) {
  const r = await prisma.player.deleteMany({ where: { id: { in: part } } })
  deletedPlayers += r.count
  console.info(`  ... 선수 ${deletedPlayers.toLocaleString()} / ${onlyHerePlayers.length.toLocaleString()}`)
}
const delPlayers = { count: deletedPlayers }

let deletedClans = 0
for (const part of chunk(onlyHereClans.map((c) => c.id))) {
  const r = await prisma.clan.deleteMany({ where: { id: { in: part } } })
  deletedClans += r.count
}
const delClans = { count: deletedClans }
const delLeagues = await prisma.league.deleteMany({ where: { id: { in: ids } } })

console.info('\n삭제 완료')
console.info(`  MatchPlayerStat ${delStats.count.toLocaleString()}`)
console.info(`  Match           ${delMatches.count.toLocaleString()}`)
console.info(`  LeaguePlayer    ${delLP.count.toLocaleString()}`)
console.info(`  LeagueClan      ${delLC.count.toLocaleString()}`)
console.info(`  Season          ${delSeason.count.toLocaleString()}`)
console.info(`  Player          ${delPlayers.count.toLocaleString()}`)
console.info(`  Clan            ${delClans.count.toLocaleString()}`)
console.info(`  League          ${delLeagues.count.toLocaleString()}`)

await prisma.$disconnect()
