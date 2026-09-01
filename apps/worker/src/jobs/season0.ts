/**
 * 시즌0 재계산 — **2026-07-01(KST) ~ 현재(열린 구간)** 을 우리 점수 시스템으로 다시 매긴다
 * (D-171 · 창 재정의는 D-175).
 *
 * ── 무엇을 하나
 *
 * 그 창의 경기를 **미러(3rd.supply)·넥슨 가리지 않고** 시간순으로 처음부터 다시 재생해서
 * 개인 **통합 / 스나 / 라플** 랭킹과 **클랜** 랭킹을 만든다.
 * 창과 대상 origin 은 `../lib/season0Window.ts` 한 곳에만 있다.
 *
 * 창 밖(2024-05 ~ 2026-03) 기록은 **지우지 않는다.** `Match` · `MatchPlayerStat` 에
 * 그대로 남고 기록실·지난시즌 조회는 창으로 거르지 않는다. 빠지는 것은 집계뿐이다.
 *
 * ── 공식을 새로 짜지 않는다
 *
 * 계산은 `runRate` 가 한다. 운영 래더를 계산하는 그 코드 그대로다.
 * 별도 시뮬레이터를 만들면 언젠가 갈라지고, 갈라진 예측은 예측이 아니다 (D-150 과 같은 이유).
 * 여기서는 **범위만 바꿔서** 부르고, 결과를 무기별로 나눠 표로 만든다.
 *
 * ── 원본 점수를 덮지 않는다
 *
 * 항상 `dryRun` 으로 부른다. DB 에 한 줄도 쓰지 않는다 (CLAUDE.md 3-A 2번).
 * 결과는 파일로만 남긴다.
 *
 * ── 무기별 분리 (CLAUDE.md 3-B 1·2번)
 *
 * 공식은 하나다. weapon 은 계산에 **영향을 주지 않는다.**
 * 계산된 증감을 그 경기에서 쓴 무기 쪽에 **기록만** 나눈다.
 * 그래서 `통합 = 기본 + 스나 증감 + 라플 증감` 이 항상 성립한다 — 끝에서 검증한다.
 *
 * ── 랭킹 정렬 기준 (운영 화면과 같게)
 *
 *   통합   표시 점수 내림차순
 *   스나   스나 증감 합 내림차순   (`rankings.ts` 의 무기 탭과 같은 기준)
 *   라플   라플 증감 합 내림차순
 *   클랜   표시 점수 내림차순
 *
 * 배치고사(10경기 미만)는 랭킹에 넣지 않는다 — 원본 규칙 그대로다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/jobs/season0.ts
 * pnpm --filter @sacloud/worker exec tsx src/jobs/season0.ts --leagues supply
 * pnpm --filter @sacloud/worker exec tsx src/jobs/season0.ts --top 100
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'
import { log } from '../lib/log.js'
import { V2_RATING_CONSTANTS, type RatingConstants } from '@sacloud/rating'
import { runRate } from './rate.js'
import {
  season0MatchWhere as matchWhere,
  season0Scope as scope,
  season0WindowLabel,
} from '../lib/season0Window.js'
import type { JobContext } from './context.js'

/* 창·대상 origin 은 여기서 정의하지 않는다. 한 곳(`season0Window`)에서만 온다 (D-175) */
export {
  SEASON0_FROM,
  SEASON0_TO,
  SEASON0_ORIGINS,
  season0MatchWhere,
  season0Scope,
} from '../lib/season0Window.js'
/** 0 = 라이플, 1 = 스나이퍼 */
const RIFLE = 0
const SNIPER = 1

export interface Season0PlayerRow {
  rank: number
  playerId: string
  name: string
  clanName: string | null
  display: number
  internal: number
  games: number
  win: number
  lose: number
  winRate: number
  sniperDelta: number
  rifleDelta: number
  sniperGames: number
  rifleGames: number
}

export interface Season0ClanRow {
  rank: number
  leagueClanId: string
  name: string
  display: number
  internal: number
  composition: number
  games: number
  win: number
  lose: number
  avgMembers: number
}

export interface Season0LeagueResult {
  league: string
  matchesConsidered: number
  matchesRated: number
  skipped: Record<string, number>
  placementHeld: number
  overall: Season0PlayerRow[]
  sniper: Season0PlayerRow[]
  rifle: Season0PlayerRow[]
  clans: Season0ClanRow[]
  checks: {
    zeroSumDrift: number
    weaponSplitMismatch: number
    unknownWeaponStats: number
    nonFinite: number
  }
  /** DB 반영용 원자료. 결과 파일에는 넣지 않는다 (용량) */
  raw?: {
    players: {
      playerId: string
      display: number
      internal: number
      penalty: number
      games: number
      win: number
      lose: number
    }[]
    clans: {
      leagueClanId: string
      display: number
      internal: number
      composition: number
      penalty: number
      games: number
      win: number
      lose: number
    }[]
    weapon: {
      playerId: string
      sniperDelta: number
      rifleDelta: number
      sniperGames: number
      rifleGames: number
    }[]
    statKeys: { matchId: string; playerId: string }[]
  }
}

const DRY_CTX: JobContext = {
  config: {} as never,
  client: null,
  dryRun: true,
  limit: null,
  resume: false,
}

export async function runSeason0(
  leagueSlug: string,
  constants: RatingConstants = V2_RATING_CONSTANTS,
): Promise<Season0LeagueResult | null> {
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true },
  })
  if (!league) return null

  log(`[${leagueSlug}] 시즌0 재계산 — ${season0WindowLabel()}`)

  const rated = await runRate(DRY_CTX, {
    leagueSlug,
    matchScope: scope(),
    collectStats: true,
    constants,
  })

  /* ---- 무기별 분리 ----
     경기별 참가행의 weapon 을 읽어, 계산된 증감을 그 무기 쪽에 **기록만** 나눈다 */
  const weaponRows = await prisma.matchPlayerStat.findMany({
    where: { match: { leagueId: league.id, ...matchWhere() } },
    select: { matchId: true, playerId: true, weapon: true },
  })
  const weaponOf = new Map<string, number | null>()
  for (const row of weaponRows) weaponOf.set(`${row.matchId}\u0000${row.playerId}`, row.weapon)

  const sniperDelta = new Map<string, number>()
  const rifleDelta = new Map<string, number>()
  const sniperGames = new Map<string, number>()
  const rifleGames = new Map<string, number>()
  let unknownWeaponStats = 0
  let totalDrift = 0

  for (const stat of rated.stats ?? []) {
    totalDrift += stat.ratingUpdate
    const weapon = weaponOf.get(`${stat.matchId}\u0000${stat.playerId}`) ?? null
    if (weapon === SNIPER) {
      sniperDelta.set(stat.playerId, (sniperDelta.get(stat.playerId) ?? 0) + stat.ratingUpdate)
      sniperGames.set(stat.playerId, (sniperGames.get(stat.playerId) ?? 0) + 1)
    } else if (weapon === RIFLE) {
      rifleDelta.set(stat.playerId, (rifleDelta.get(stat.playerId) ?? 0) + stat.ratingUpdate)
      rifleGames.set(stat.playerId, (rifleGames.get(stat.playerId) ?? 0) + 1)
    } else {
      /* 무기를 모르는 참가행. 추측해서 어느 한쪽에 넣지 않는다 — 세기만 한다 */
      unknownWeaponStats += 1
    }
  }

  /* ---- 이름 붙이기 ---- */
  const playerIds = rated.report.players.map((p) => p.playerId)
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, name: true, clan: { select: { name: true } } },
  })
  const nameOf = new Map(players.map((p) => [p.id, { name: p.name, clan: p.clan?.name ?? null }]))

  const clanIds = rated.report.clans.map((c) => c.leagueClanId)
  const leagueClans = await prisma.leagueClan.findMany({
    where: { id: { in: clanIds } },
    select: { id: true, clan: { select: { name: true } } },
  })
  const clanNameOf = new Map(leagueClans.map((c) => [c.id, c.clan?.name ?? '(이름 없음)']))

  /* ---- 랭킹 만들기 ----

     ⚠ 예전에는 여기 `const PLACEMENT = 10` 이 **박혀 있었다.** 상수를 0 으로 내려도
     이 줄 때문에 계산만 바뀌고 랭킹 표는 그대로 10판에서 잘렸다. 상수를 참조한다.

     배치고사가 폐지된 지금(`placementMatches = 0`)은 `p.games < 0` 이 항상 거짓이라
     한 명도 걸러지지 않는다 — 1판만 뛰어도 랭킹에 나온다. */
  const PLACEMENT = constants.placementMatches
  let placementHeld = 0
  const rows = rated.report.players
    .filter((p) => {
      /* 배치고사 중이면 랭킹에 넣지 않는다. 폐지 후에는 아무도 여기 걸리지 않는다 */
      if (p.games < PLACEMENT) {
        placementHeld += 1
        return false
      }
      return true
    })
    .map((p) => ({
      rank: 0,
      playerId: p.playerId,
      name: nameOf.get(p.playerId)?.name ?? '(알수없음)',
      clanName: nameOf.get(p.playerId)?.clan ?? null,
      display: p.display,
      internal: p.internal,
      games: p.games,
      win: p.win,
      lose: p.lose,
      winRate: p.winRate,
      sniperDelta: sniperDelta.get(p.playerId) ?? 0,
      rifleDelta: rifleDelta.get(p.playerId) ?? 0,
      sniperGames: sniperGames.get(p.playerId) ?? 0,
      rifleGames: rifleGames.get(p.playerId) ?? 0,
    }))

  const ranked = (list: Season0PlayerRow[]): Season0PlayerRow[] =>
    list.map((row, index) => ({ ...row, rank: index + 1 }))

  const overall = ranked([...rows].sort((a, b) => b.display - a.display || a.name.localeCompare(b.name)))
  const sniper = ranked(
    [...rows].filter((r) => r.sniperGames > 0).sort((a, b) => b.sniperDelta - a.sniperDelta),
  )
  const rifle = ranked(
    [...rows].filter((r) => r.rifleGames > 0).sort((a, b) => b.rifleDelta - a.rifleDelta),
  )

  const clans: Season0ClanRow[] = rated.report.clans
    .slice()
    .sort((a, b) => b.display - a.display)
    .map((c, index) => ({
      rank: index + 1,
      leagueClanId: c.leagueClanId,
      name: clanNameOf.get(c.leagueClanId) ?? '(이름 없음)',
      display: c.display,
      internal: c.internal,
      composition: c.composition,
      games: c.games,
      win: c.win,
      lose: c.lose,
      avgMembers: c.avgMembers,
    }))

  /* ---- 검증 ----
     1) 제로섬 — 모든 증감의 합은 0 이어야 한다 (억제는 양쪽에 같이 걸린다)
     2) 무기 분리 — 통합 증감 = 스나 증감 + 라플 증감 (무기 미상 제외) */
  let weaponSplitMismatch = 0
  const totalDeltaOf = new Map<string, number>()
  for (const stat of rated.stats ?? []) {
    totalDeltaOf.set(stat.playerId, (totalDeltaOf.get(stat.playerId) ?? 0) + stat.ratingUpdate)
  }
  if (unknownWeaponStats === 0) {
    for (const [playerId, total] of totalDeltaOf) {
      const split = (sniperDelta.get(playerId) ?? 0) + (rifleDelta.get(playerId) ?? 0)
      if (Math.abs(total - split) > 1e-6) weaponSplitMismatch += 1
    }
  }

  const weaponIds = new Set([...sniperGames.keys(), ...rifleGames.keys()])

  return {
    raw: {
      players: rated.report.players.map((p) => ({
        playerId: p.playerId,
        display: p.display,
        internal: p.internal,
        penalty: p.penalty,
        games: p.games,
        win: p.win,
        lose: p.lose,
      })),
      clans: rated.report.clans.map((c) => ({
        leagueClanId: c.leagueClanId,
        display: c.display,
        internal: c.internal,
        composition: c.composition,
        penalty: c.penalty,
        games: c.games,
        win: c.win,
        lose: c.lose,
      })),
      weapon: [...weaponIds].map((playerId) => ({
        playerId,
        sniperDelta: sniperDelta.get(playerId) ?? 0,
        rifleDelta: rifleDelta.get(playerId) ?? 0,
        sniperGames: sniperGames.get(playerId) ?? 0,
        rifleGames: rifleGames.get(playerId) ?? 0,
      })),
      statKeys: (rated.stats ?? []).map((s) => ({ matchId: s.matchId, playerId: s.playerId })),
    },
    league: leagueSlug,
    matchesConsidered: rated.matchesConsidered,
    matchesRated: rated.matchesRated,
    skipped: rated.skipped,
    placementHeld,
    overall,
    sniper,
    rifle,
    clans,
    checks: {
      zeroSumDrift: totalDrift,
      weaponSplitMismatch,
      unknownWeaponStats,
      nonFinite: rated.report.nonFinite,
    },
  }
}

function printTop(title: string, rows: Season0PlayerRow[], top: number, key: 'display' | 'sniperDelta' | 'rifleDelta'): void {
  console.log(`\n## ${title}  (총 ${rows.length}명)`)
  console.table(
    rows.slice(0, top).map((r) => ({
      순위: r.rank,
      선수: r.name,
      클랜: r.clanName ?? '-',
      점수: key === 'display' ? Math.round(r.display) : Math.round(r[key]),
      판수: key === 'sniperDelta' ? r.sniperGames : key === 'rifleDelta' ? r.rifleGames : r.games,
      승: r.win,
      패: r.lose,
      /* `runRate` 의 리포트가 이미 백분율이다. 여기서 다시 100 을 곱하면 `6299.2%` 가 된다 */
      승률: `${r.winRate.toFixed(1)}%`,
    })),
  )
}

async function main(): Promise<void> {
  const argLeagues = process.argv.find((a) => a.startsWith('--leagues'))
  const leagues = argLeagues
    ? (argLeagues.includes('=') ? argLeagues.split('=')[1]! : process.argv[process.argv.indexOf(argLeagues) + 1]!)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['supply', 'sanply', 'daerule']
  const topArg = process.argv.indexOf('--top')
  const top = topArg >= 0 ? Number(process.argv[topArg + 1]) : 30

  const outDir = path.join(REPO_ROOT, 'apps', 'worker', 'reports', 'season0')
  mkdirSync(outDir, { recursive: true })

  for (const slug of leagues) {
    const result = await runSeason0(slug)
    if (!result) {
      console.log(`리그를 찾을 수 없다: ${slug}`)
      continue
    }
    console.log(`\n================ ${slug} ================`)
    console.log(
      `대상 ${result.matchesConsidered}경기 · 래더 반영 ${result.matchesRated}경기 · ` +
        `배치고사로 보류 ${result.placementHeld}명`,
    )
    if (Object.keys(result.skipped).length > 0) console.log('제외 사유', result.skipped)
    console.log(
      `검증 — 제로섬 오차 ${result.checks.zeroSumDrift.toFixed(6)} · ` +
        `무기분리 불일치 ${result.checks.weaponSplitMismatch} · ` +
        `무기 미상 참가행 ${result.checks.unknownWeaponStats} · NaN ${result.checks.nonFinite}`,
    )
    printTop('개인 통합 랭킹', result.overall, top, 'display')
    printTop('개인 스나 랭킹', result.sniper, top, 'sniperDelta')
    printTop('개인 라플 랭킹', result.rifle, top, 'rifleDelta')
    console.log(`\n## 클랜 랭킹  (총 ${result.clans.length}개)`)
    console.table(
      result.clans.slice(0, top).map((c) => ({
        순위: c.rank,
        클랜: c.name,
        점수: Math.round(c.display),
        판수: c.games,
        승: c.win,
        패: c.lose,
        '평균 본클랜원': c.avgMembers.toFixed(2),
      })),
    )

    const file = path.join(outDir, `${slug}.json`)
    const { raw: _raw, ...forFile } = result
    writeFileSync(file, JSON.stringify(forFile, null, 2), 'utf8')
    console.log(`\n전체 결과 파일: ${file}`)
  }

  await prisma.$disconnect()
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('season0.ts')
if (invokedDirectly) {
  main().catch(async (e: unknown) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
}
