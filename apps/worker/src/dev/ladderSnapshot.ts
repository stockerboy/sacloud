/**
 * 래더 반영 결과 **스냅샷** — 규칙을 바꾸기 전/후를 같은 잣대로 비교하기 위한 도구.
 * **읽기만 한다. 한 줄도 쓰지 않는다** (D-180).
 *
 * ── 무엇을 재나
 *
 *   1. 클랜 `승 + 패 ≠ 판수` — 화면의 클랜 승률과 판수가 서로 다른 모집단을 보는지
 *   2. 클랜 랭킹 상위 N (순위 이동 대조용)
 *   3. 개인 랭킹 상위 N · 랭킹에 뜨는 선수 수 · 점수 합계(체크섬)
 *
 * 개인 점수 합계를 함께 찍는 이유는 "클랜만 고쳤는데 개인이 안 변했다" 를
 * 눈이 아니라 **숫자로** 확인하기 위해서다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/ladderSnapshot.ts --leagues supply,sanply --out before.json
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

export interface LadderSnapshot {
  league: string
  clans: {
    total: number
    /** `승 + 패 ≠ 판수` 인 클랜 수 — 0 이어야 한다 */
    tallyMismatch: number
    /** 잘못 더해진 클랜-경기 합계 = Σ|(승+패) − 판수| */
    tallyDrift: number
    top: { name: string; rating: number; games: number; win: number; lose: number }[]
  }
  players: {
    total: number
    ranked: number
    ratingSum: number
    top: { name: string; rating: number; games: number; win: number; lose: number }[]
  }
}

export async function snapshotLeague(slug: string, top = 10): Promise<LadderSnapshot | null> {
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
  if (!league) return null

  const clanRows = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: {
      rating: true,
      win: true,
      lose: true,
      placement: true,
      placementPlayed: true,
      clan: { select: { name: true } },
    },
  })
  /* 판수(`placementPlayed`)는 래더에 반영된 경기 수다. 승·패는 집계 경로가 달랐다 —
     그 둘이 어긋나 있으면 화면이 서로 다른 모집단을 보고 있다는 뜻이다 */
  const bad = clanRows.filter((c) => c.win + c.lose !== c.placementPlayed)

  const playerRows = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: {
      rating: true,
      win: true,
      lose: true,
      placement: true,
      placementPlayed: true,
      player: { select: { name: true } },
    },
  })

  return {
    league: slug,
    clans: {
      total: clanRows.length,
      tallyMismatch: bad.length,
      tallyDrift: bad.reduce((sum, c) => sum + Math.abs(c.win + c.lose - c.placementPlayed), 0),
      top: clanRows
        .filter((c) => !c.placement)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, top)
        .map((c) => ({
          name: c.clan?.name ?? '(이름 없음)',
          rating: c.rating,
          games: c.placementPlayed,
          win: c.win,
          lose: c.lose,
        })),
    },
    players: {
      total: playerRows.length,
      ranked: playerRows.filter((p) => !p.placement).length,
      ratingSum: playerRows.reduce((sum, p) => sum + p.rating, 0),
      top: playerRows
        .filter((p) => !p.placement)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, top)
        .map((p) => ({
          name: p.player.name,
          rating: p.rating,
          games: p.placementPlayed,
          win: p.win,
          lose: p.lose,
        })),
    },
  }
}

function argOf(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]!
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null
}

async function main(): Promise<void> {
  const leagues = (argOf('leagues') ?? 'supply,sanply')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const top = Number(argOf('top') ?? 10)
  const out = argOf('out')

  const results: LadderSnapshot[] = []
  for (const slug of leagues) {
    const snapshot = await snapshotLeague(slug, top)
    if (!snapshot) {
      console.log(`리그를 찾을 수 없다: ${slug}`)
      continue
    }
    results.push(snapshot)
    console.log(`\n================ ${slug} ================`)
    console.log(
      `클랜 ${snapshot.clans.total} · 승+패 ≠ 판수 ${snapshot.clans.tallyMismatch} · ` +
        `어긋난 클랜-경기 ${snapshot.clans.tallyDrift}`,
    )
    console.log(
      `선수 ${snapshot.players.total} · 랭킹 노출 ${snapshot.players.ranked} · ` +
        `점수 합계 ${snapshot.players.ratingSum}`,
    )
    console.log(`\n## 클랜 TOP ${top}`)
    console.table(
      snapshot.clans.top.map((c, i) => ({
        순위: i + 1,
        클랜: c.name,
        점수: c.rating,
        판수: c.games,
        승: c.win,
        패: c.lose,
      })),
    )
    console.log(`\n## 개인 TOP ${top}`)
    console.table(
      snapshot.players.top.map((p, i) => ({
        순위: i + 1,
        선수: p.name,
        점수: p.rating,
        판수: p.games,
        승: p.win,
        패: p.lose,
      })),
    )
  }

  if (out) {
    const file = path.isAbsolute(out)
      ? out
      : path.join(REPO_ROOT, 'apps', 'worker', 'reports', 'season0', out)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(results, null, 2), 'utf8')
    console.log(`\n결과 파일: ${file}`)
  }
  await prisma.$disconnect()
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('ladderSnapshot.ts')
if (invokedDirectly) {
  main().catch(async (e: unknown) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
}
