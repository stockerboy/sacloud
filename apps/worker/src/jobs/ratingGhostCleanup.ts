/**
 * 미러 리그에 남은 **우리 공식 잔재 집계 행** 정리 (D-170).
 *
 * ── 무엇을 지우나
 *
 * 미러(3rd.supply)를 들여온 리그에서, **원본 경기를 한 판도 뛰지 않은 선수**의
 * `LeaguePlayer` 행만 지운다. 그 행은 넥슨 재구성 경기(미러 구간 안)를
 * `rate` 가 계산하면서 만든 것이고, `rate` 쪽은 D-170 으로 이미 막았다.
 * 여기서는 **이미 만들어져 화면에 뜨고 있는 행**을 치운다.
 *
 * 실측 (2026-08-29 · supply)
 * ```
 * 원본 점수   10,329명   0 ~ 3,432 (평균 834)
 * 우리 공식       59명   2,940 ~ 3,049 (평균 3,001)   ← 이것들
 * 개인랭킹 상위 100 중 판수 10 미만 61명
 * ```
 *
 * ── 지우지 않는 것
 *
 * · `Player` 행 — 남긴다. 사람을 지우는 게 아니다
 * · `MatchPlayerStat` — 남긴다. 경기 기록은 그대로다
 * · 원본 경기를 한 판이라도 뛴 선수의 집계 행 — 건드리지 않는다
 *
 * ── 안전장치
 *
 * · `--confirm` 없이는 한 줄도 쓰지 않는다
 * · 지우기 전에 지울 행을 통째로 백업 파일에 적는다
 * · 백업 파일 하나로 되돌릴 수 있다 (`--revert <파일>`)
 * · 멱등하다 — 두 번 돌려도 같은 결과다
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/jobs/ratingGhostCleanup.ts                 # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/jobs/ratingGhostCleanup.ts --confirm
 * pnpm --filter @sacloud/worker exec tsx src/jobs/ratingGhostCleanup.ts --revert <파일>
 * ```
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

const MIRROR_ORIGIN = '3rd.supply'
const BACKUP_DIR = path.join(REPO_ROOT, 'apps', 'worker', 'backups', 'ratingGhost')

export interface GhostRow {
  leagueSlug: string
  leaguePlayerId: string
  playerId: string
  playerName: string
  rating: number
  played: number
}

export interface GhostBackup {
  createdAt: string
  confirmed: boolean
  ghosts: GhostRow[]
  removedLeaguePlayers: unknown[]
  removedWeaponStats: unknown[]
  removedSeasonStats: unknown[]
}

/** 미러가 있는 리그마다, 원본 경기를 한 판도 안 뛴 선수의 집계 행을 모은다 */
export async function planGhostCleanup(): Promise<GhostRow[]> {
  const leagues = await prisma.league.findMany({ select: { id: true, slug: true } })
  const ghosts: GhostRow[] = []

  for (const league of leagues) {
    const mirrorCount = await prisma.match.count({
      where: { leagueId: league.id, origin: MIRROR_ORIGIN },
    })
    /* 미러가 없는 리그는 우리 공식이 정본이다. 건드리지 않는다 */
    if (mirrorCount === 0) continue

    const rows = await prisma.leaguePlayer.findMany({
      where: {
        leagueId: league.id,
        player: {
          matchStats: {
            none: { match: { leagueId: league.id, origin: MIRROR_ORIGIN } },
          },
        },
      },
      select: {
        id: true,
        playerId: true,
        rating: true,
        win: true,
        lose: true,
        player: { select: { name: true } },
      },
    })
    for (const r of rows) {
      ghosts.push({
        leagueSlug: league.slug,
        leaguePlayerId: r.id,
        playerId: r.playerId,
        playerName: r.player.name,
        rating: r.rating,
        played: r.win + r.lose,
      })
    }
  }
  return ghosts
}

export async function runGhostCleanup(confirm: boolean): Promise<GhostBackup> {
  const ghosts = await planGhostCleanup()
  console.log(`원본 경기가 없는 집계 행 ${ghosts.length}건`)
  for (const g of ghosts) {
    console.log(`  [${g.leagueSlug}] ${g.playerName} — 래더 ${g.rating} · ${g.played}전`)
  }

  const backup: GhostBackup = {
    createdAt: new Date().toISOString(),
    confirmed: confirm,
    ghosts,
    removedLeaguePlayers: [],
    removedWeaponStats: [],
    removedSeasonStats: [],
  }

  if (confirm && ghosts.length > 0) {
    const ids = ghosts.map((g) => g.leaguePlayerId)
    backup.removedLeaguePlayers = await prisma.leaguePlayer.findMany({ where: { id: { in: ids } } })
    backup.removedWeaponStats = await prisma.leaguePlayerWeaponStat.findMany({
      where: { leaguePlayerId: { in: ids } },
    })
    backup.removedSeasonStats = await prisma.leaguePlayerSeason.findMany({
      where: { leaguePlayerId: { in: ids } },
    })
    const file = writeBackup(backup)

    await prisma.leaguePlayerWeaponStat.deleteMany({ where: { leaguePlayerId: { in: ids } } })
    await prisma.leaguePlayerSeason.deleteMany({ where: { leaguePlayerId: { in: ids } } })
    await prisma.leaguePlayer.deleteMany({ where: { id: { in: ids } } })
    console.log(`적용 완료 — 집계행 ${ids.length}건 제거. 되돌리려면 --revert ${file}`)
  } else {
    writeBackup(backup)
    if (!confirm) console.log('미리보기다. 아무것도 쓰지 않았다. 적용하려면 --confirm')
  }
  return backup
}

export async function revertGhostCleanup(file: string): Promise<void> {
  if (!file) throw new Error('되돌릴 백업 파일 경로가 필요하다')
  const backup = JSON.parse(readFileSync(file, 'utf8')) as GhostBackup
  if (!backup.confirmed) {
    console.log('이 백업은 미리보기 기록이다. 되돌릴 것이 없다')
    return
  }
  for (const row of backup.removedLeaguePlayers as Array<Record<string, unknown>>) {
    await prisma.leaguePlayer.upsert({
      where: { id: row.id as string },
      create: row as never,
      update: row as never,
    })
  }
  /* 무기별 기록은 `id` 가 없다. 키가 (leaguePlayerId, weapon) 복합이다 */
  for (const row of backup.removedWeaponStats as Array<Record<string, unknown>>) {
    await prisma.leaguePlayerWeaponStat.upsert({
      where: {
        leaguePlayerId_weapon: {
          leaguePlayerId: row.leaguePlayerId as string,
          weapon: row.weapon as number,
        },
      },
      create: row as never,
      update: row as never,
    })
  }
  for (const row of backup.removedSeasonStats as Array<Record<string, unknown>>) {
    await prisma.leaguePlayerSeason.upsert({
      where: { id: row.id as string },
      create: row as never,
      update: row as never,
    })
  }
  console.log(
    `되돌렸다 — 집계행 ${backup.removedLeaguePlayers.length} · 무기 ${backup.removedWeaponStats.length} · 시즌 ${backup.removedSeasonStats.length}`,
  )
}

function writeBackup(backup: GhostBackup): string {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = backup.createdAt.replace(/[:.]/g, '-')
  const file = path.join(BACKUP_DIR, `${backup.confirmed ? 'applied' : 'plan'}-${stamp}.json`)
  writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`백업/계획 파일: ${file}`)
  return file
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('ratingGhostCleanup.ts')
if (invokedDirectly) {
  const revertIndex = process.argv.indexOf('--revert')
  const task =
    revertIndex >= 0
      ? revertGhostCleanup(process.argv[revertIndex + 1] ?? '')
      : runGhostCleanup(process.argv.includes('--confirm')).then(() => undefined)
  task
    .then(async () => {
      await prisma.$disconnect()
    })
    .catch(async (e: unknown) => {
      console.error(e)
      await prisma.$disconnect()
      process.exit(1)
    })
}
