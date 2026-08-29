/**
 * 시즌0 점수를 **화면에 반영한다** (D-172).
 *
 * ── 무엇을 쓰나
 *
 * `season0` 이 계산한 값(우리 공식 v2)을 `LeaguePlayer` · `LeagueClan` ·
 * `LeaguePlayerWeaponStat` 에 받아 적는다. 화면은 이 표들을 읽으므로
 * 개인 통합/스나/라플 랭킹과 클랜 랭킹이 그대로 바뀐다.
 *
 * ── 원본 점수는 어떻게 되나
 *
 * `LeaguePlayer.rating` 은 지금 **원본(3rd.supply) 점수**가 들어 있는 칸이다.
 * 그 자리를 우리 점수로 바꾼다. 원본값 자체는 지워지지 않는다 —
 * 경기마다 `redSourceRating` · `redSourceRatingUpdate` 로 남아 있고,
 * `supply-rollup` 을 다시 돌리면 언제든 원본 기준으로 되돌아간다.
 * 그래도 안전하게, **쓰기 전에 통째로 백업 파일에 적는다.**
 *
 * ── 무기 분리 불변식 (CLAUDE.md 3-B 2번)
 *
 * `통합 = 기본 + 스나 증감 + 라플 증감` 이 깨지면 안 된다.
 * 표시 점수는 `3000 + (내부 − 3000) × 배율` 이라 **선형**이므로,
 * 내부 증감을 배율만큼 키워 무기별 칸에 넣고 기본값이 나머지를 받는다.
 * 그래서 세 값을 더하면 정확히 통합이 된다 — 반영 뒤 숫자로 확인한다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/jobs/season0Apply.ts --leagues supply
 * pnpm --filter @sacloud/worker exec tsx src/jobs/season0Apply.ts --leagues supply --confirm
 * pnpm --filter @sacloud/worker exec tsx src/jobs/season0Apply.ts --revert <파일>
 * ```
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { V2_RATING_CONSTANTS } from '@sacloud/rating'
import { REPO_ROOT } from '../lib/env.js'
import { log } from '../lib/log.js'
import { runSeason0 } from './season0.js'
import { season0MatchWhere } from '../lib/season0Window.js'

const BACKUP_DIR = path.join(REPO_ROOT, 'apps', 'worker', 'backups', 'season0')
const SCALE = V2_RATING_CONSTANTS.displayScale
const PLACEMENT = V2_RATING_CONSTANTS.placementMatches

export interface Season0Backup {
  createdAt: string
  confirmed: boolean
  leagues: string[]
  leaguePlayers: unknown[]
  leagueClans: unknown[]
  weaponStats: unknown[]
}

function round(value: number): number {
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
}

export async function applySeason0(leagueSlugs: string[], confirm: boolean): Promise<void> {
  const backup: Season0Backup = {
    createdAt: new Date().toISOString(),
    confirmed: confirm,
    leagues: leagueSlugs,
    leaguePlayers: [],
    leagueClans: [],
    weaponStats: [],
  }

  interface Plan {
    leagueId: string
    slug: string
    players: {
      playerId: string
      rating: number
      baseRating: number
      internalRating: number
      activityPenalty: number
      win: number
      lose: number
      kill: number
      death: number
      assist: number
      headshot: number
      mvpCount: number
      placement: boolean
      placementPlayed: number
      lastRatedAt: Date | null
      clanId: string | null
      sniper: { delta: number; games: number; win: number; lose: number; kill: number; death: number; assist: number; headshot: number; known: number }
      rifle: { delta: number; games: number; win: number; lose: number; kill: number; death: number; assist: number; headshot: number; known: number }
    }[]
    clans: {
      leagueClanId: string
      rating: number
      internalRating: number
      compositionScore: number
      compositionMembers: number
      activityPenalty: number
      win: number
      lose: number
      placement: boolean
      placementPlayed: number
    }[]
  }

  const plans: Plan[] = []

  for (const slug of leagueSlugs) {
    const result = await runSeason0(slug)
    if (!result?.raw) {
      log(`[${slug}] 계산 결과가 없다. 건너뛴다`)
      continue
    }
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue

    /* 래더에 반영된 참가행만 모은다 — 킬·데스·무기별 승패의 근거다 */
    const rated = new Set(result.raw.statKeys.map((s) => `${s.matchId} ${s.playerId}`))
    const statRows = await prisma.matchPlayerStat.findMany({
      where: { match: { leagueId: league.id, ...season0MatchWhere() } },
      select: {
        matchId: true,
        playerId: true,
        side: true,
        weapon: true,
        kill: true,
        death: true,
        assist: true,
        headshot: true,
        mvp: true,
        match: { select: { startAt: true, winnerSide: true } },
      },
    })

    interface Acc {
      kill: number
      death: number
      assist: number
      headshot: number
      mvp: number
      lastAt: Date | null
      sniper: { delta: number; games: number; win: number; lose: number; kill: number; death: number; assist: number; headshot: number; known: number }
      rifle: { delta: number; games: number; win: number; lose: number; kill: number; death: number; assist: number; headshot: number; known: number }
    }
    const empty = (): Acc['sniper'] => ({
      delta: 0,
      games: 0,
      win: 0,
      lose: 0,
      kill: 0,
      death: 0,
      assist: 0,
      headshot: 0,
      known: 0,
    })
    const acc = new Map<string, Acc>()

    for (const row of statRows) {
      if (!rated.has(`${row.matchId} ${row.playerId}`)) continue
      const a =
        acc.get(row.playerId) ??
        ({ kill: 0, death: 0, assist: 0, headshot: 0, mvp: 0, lastAt: null, sniper: empty(), rifle: empty() } as Acc)
      a.kill += row.kill ?? 0
      a.death += row.death ?? 0
      a.assist += row.assist ?? 0
      a.headshot += row.headshot ?? 0
      a.mvp += row.mvp === true ? 1 : 0
      if (!a.lastAt || row.match.startAt > a.lastAt) a.lastAt = row.match.startAt

      const bucket = row.weapon === 1 ? a.sniper : row.weapon === 0 ? a.rifle : null
      if (bucket) {
        bucket.games += 1
        if (row.match.winnerSide === row.side) bucket.win += 1
        else bucket.lose += 1
        /* K/D/A 를 모르는 경기는 분모에서 뺀다 (D-149) */
        if (row.kill !== null && row.death !== null) {
          bucket.known += 1
          bucket.kill += row.kill
          bucket.death += row.death
          bucket.assist += row.assist ?? 0
          bucket.headshot += row.headshot ?? 0
        }
      }
      acc.set(row.playerId, a)
    }

    const weaponOf = new Map(result.raw.weapon.map((w) => [w.playerId, w]))

    /* 현재 소속 클랜은 건드리지 않는다 — 기존 값을 그대로 유지한다 */
    const existing = await prisma.leaguePlayer.findMany({
      where: { leagueId: league.id },
      select: { playerId: true, clanId: true },
    })
    const clanOf = new Map(existing.map((e) => [e.playerId, e.clanId]))

    const players = result.raw.players.map((p) => {
      const a = acc.get(p.playerId)
      const w = weaponOf.get(p.playerId)
      /* 무기별 증감은 **최종 표시 점수와 같은 비율**로 옮긴다 (D-173).
         단순히 배율(3.5)만 곱하면 미참여 감점이 무기 증감에 반영되지 않아,
         5달 전에 그만둔 선수가 라플 랭킹 1위로 남는다 (실측). 무기 랭킹은
         증감 순으로 줄 세우므로 감점이 증감에도 같이 걸려야 한다.

         내부 증감의 합이 표시 증감이 되도록 한 번에 축소한다 —
         `통합 = 기본 + 스나 + 라플` 은 아래에서 기본이 나머지를 받아 그대로 성립한다. */
      const internalAbove = p.internal - V2_RATING_CONSTANTS.initialRating
      const displayAbove = p.display - V2_RATING_CONSTANTS.initialRating
      const shrink = internalAbove !== 0 ? displayAbove / internalAbove : SCALE
      const sniperDelta = round((w?.sniperDelta ?? 0) * shrink)
      const rifleDelta = round((w?.rifleDelta ?? 0) * shrink)
      return {
        playerId: p.playerId,
        rating: round(p.display),
        /* 통합 = 기본 + 스나 + 라플 이 정확히 성립하도록 기본이 나머지를 받는다 */
        baseRating: round(p.display) - sniperDelta - rifleDelta,
        internalRating: p.internal,
        activityPenalty: p.penalty,
        win: p.win,
        lose: p.lose,
        kill: a?.kill ?? 0,
        death: a?.death ?? 0,
        assist: a?.assist ?? 0,
        headshot: a?.headshot ?? 0,
        mvpCount: a?.mvp ?? 0,
        placement: p.games < PLACEMENT,
        placementPlayed: p.games,
        lastRatedAt: a?.lastAt ?? null,
        clanId: clanOf.get(p.playerId) ?? null,
        sniper: { ...(a?.sniper ?? empty()), delta: sniperDelta },
        rifle: { ...(a?.rifle ?? empty()), delta: rifleDelta },
      }
    })

    const clans = result.raw.clans.map((c) => ({
      leagueClanId: c.leagueClanId,
      rating: round(c.display),
      internalRating: c.internal,
      compositionScore: round(c.composition),
      compositionMembers: 0,
      activityPenalty: c.penalty,
      win: c.win,
      lose: c.lose,
      placement: c.games < PLACEMENT,
      placementPlayed: c.games,
    }))

    plans.push({ leagueId: league.id, slug, players, clans })
    log(`[${slug}] 반영 대상 — 선수 ${players.length} · 클랜 ${clans.length}`)
  }

  if (!confirm) {
    mkdirSync(BACKUP_DIR, { recursive: true })
    const file = path.join(BACKUP_DIR, `plan-${backup.createdAt.replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, JSON.stringify({ ...backup, plans }, null, 2), 'utf8')
    console.log(`미리보기다. 아무것도 쓰지 않았다. 계획 파일: ${file}`)
    console.log('적용하려면 --confirm')
    return
  }

  /* ---- 지우기 전에 통째로 적는다 ---- */
  for (const plan of plans) {
    const before = await prisma.leaguePlayer.findMany({ where: { leagueId: plan.leagueId } })
    backup.leaguePlayers.push(...before)
    backup.leagueClans.push(
      ...(await prisma.leagueClan.findMany({ where: { leagueId: plan.leagueId } })),
    )
    backup.weaponStats.push(
      ...(await prisma.leaguePlayerWeaponStat.findMany({
        where: { leaguePlayerId: { in: before.map((r) => r.id) } },
      })),
    )
  }
  mkdirSync(BACKUP_DIR, { recursive: true })
  const backupFile = path.join(BACKUP_DIR, `applied-${backup.createdAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf8')
  log(`백업 완료 — ${backupFile}`)

  /* ---- 반영 ---- */
  for (const plan of plans) {
    /* 무기별 기록은 **먼저 통째로 지우고** 새로 쓴다.
       남겨 두면 시즌0 에 그 무기로 안 뛴 선수에게 예전 증감이 남아
       통합 = 기본 + 스나 + 라플 이 깨진다 (실측 3명). 백업은 이미 떴다 */
    const allRows = await prisma.leaguePlayer.findMany({
      where: { leagueId: plan.leagueId },
      select: { id: true },
    })
    await prisma.leaguePlayerWeaponStat.deleteMany({
      where: { leaguePlayerId: { in: allRows.map((r) => r.id) } },
    })

    let written = 0
    for (const p of plan.players) {
      const row = await prisma.leaguePlayer.upsert({
        where: { leagueId_playerId: { leagueId: plan.leagueId, playerId: p.playerId } },
        create: {
          leagueId: plan.leagueId,
          playerId: p.playerId,
          rating: p.rating,
          baseRating: p.baseRating,
          internalRating: p.internalRating,
          activityPenalty: p.activityPenalty,
          lastRatedAt: p.lastRatedAt,
          win: p.win,
          lose: p.lose,
          kill: p.kill,
          death: p.death,
          assist: p.assist,
          headshot: p.headshot,
          mvpCount: p.mvpCount,
          placement: p.placement,
          placementPlayed: p.placementPlayed,
          ...(p.clanId ? { clanId: p.clanId } : {}),
        },
        update: {
          rating: p.rating,
          baseRating: p.baseRating,
          internalRating: p.internalRating,
          activityPenalty: p.activityPenalty,
          lastRatedAt: p.lastRatedAt,
          win: p.win,
          lose: p.lose,
          kill: p.kill,
          death: p.death,
          assist: p.assist,
          headshot: p.headshot,
          mvpCount: p.mvpCount,
          placement: p.placement,
          placementPlayed: p.placementPlayed,
        },
        select: { id: true },
      })
      /* 주무기 판정 — 그 무기로 뛴 판수가 절반 이상이면 주무기다 (D-173).
         스나 랭킹에는 스나수만 올린다. 라플수가 어쩌다 든 스나 몇 판으로
         스나 랭킹에 들어오면 안 된다. 기록 자체는 양쪽 다 남긴다 */
      const weaponTotal = p.sniper.games + p.rifle.games
      const isMainOf = (games: number): boolean => weaponTotal > 0 && games * 2 >= weaponTotal

      for (const [weapon, bucket] of [
        [1, p.sniper],
        [0, p.rifle],
      ] as const) {
        /* 증감이 있는데 행을 안 쓰면 기본값이 그만큼 어긋나 불변식이 깨진다.
           둘 다 0 일 때만 건너뛴다 */
        if (bucket.games === 0 && bucket.delta === 0) continue
        await prisma.leaguePlayerWeaponStat.upsert({
          where: { leaguePlayerId_weapon: { leaguePlayerId: row.id, weapon } },
          create: {
            leaguePlayerId: row.id,
            weapon,
            ratingDelta: bucket.delta,
            games: bucket.games,
            knownStatGames: bucket.known,
            win: bucket.win,
            lose: bucket.lose,
            kill: bucket.kill,
            death: bucket.death,
            assist: bucket.assist,
            headshot: bucket.headshot,
            isMain: isMainOf(bucket.games),
          },
          update: {
            ratingDelta: bucket.delta,
            games: bucket.games,
            knownStatGames: bucket.known,
            win: bucket.win,
            lose: bucket.lose,
            kill: bucket.kill,
            death: bucket.death,
            assist: bucket.assist,
            headshot: bucket.headshot,
            isMain: isMainOf(bucket.games),
          },
        })
      }
      written += 1
    }
    for (const c of plan.clans) {
      await prisma.leagueClan.update({
        where: { id: c.leagueClanId },
        data: {
          rating: c.rating,
          internalRating: c.internalRating,
          compositionScore: c.compositionScore,
          activityPenalty: c.activityPenalty,
          win: c.win,
          lose: c.lose,
          placement: c.placement,
          placementPlayed: c.placementPlayed,
        },
      })
    }
    /* ---- 이번 창에 한 판도 안 뛴 선수·클랜은 **기준점으로 되돌린다** ----

       그대로 두면 원본 점수(0~3,432)와 우리 점수(3,000 기준)가 한 표에 섞여
       랭킹이 다시 엉킨다. 시즌0 창은 **2026-04-01(KST) ~ 현재**이므로 (D-175)
       그 창에 경기가 없으면 시즌0 기록이 없는 것이 맞다. `placement=true` 라 랭킹에서 빠진다.
       무기별 기록도 같이 지운다 — 안 지우면 통합 = 기본 + 스나 + 라플 이 깨진다. */
    const keepIds = new Set(plan.players.map((p) => p.playerId))
    const others = await prisma.leaguePlayer.findMany({
      where: { leagueId: plan.leagueId, playerId: { notIn: [...keepIds] } },
      select: { id: true },
    })
    if (others.length > 0) {
      const ids = others.map((o) => o.id)
      await prisma.leaguePlayerWeaponStat.deleteMany({ where: { leaguePlayerId: { in: ids } } })
      await prisma.leaguePlayer.updateMany({
        where: { id: { in: ids } },
        data: {
          rating: V2_RATING_CONSTANTS.initialRating,
          baseRating: V2_RATING_CONSTANTS.initialRating,
          internalRating: V2_RATING_CONSTANTS.initialRating,
          activityPenalty: 0,
          lastRatedAt: null,
          win: 0,
          lose: 0,
          kill: 0,
          death: 0,
          assist: 0,
          headshot: 0,
          mvpCount: 0,
          placement: true,
          placementPlayed: 0,
        },
      })
    }
    const keepClans = new Set(plan.clans.map((c) => c.leagueClanId))
    const otherClans = await prisma.leagueClan.findMany({
      where: { leagueId: plan.leagueId, id: { notIn: [...keepClans] } },
      select: { id: true },
    })
    if (otherClans.length > 0) {
      await prisma.leagueClan.updateMany({
        where: { id: { in: otherClans.map((c) => c.id) } },
        data: {
          rating: V2_RATING_CONSTANTS.initialRating,
          internalRating: V2_RATING_CONSTANTS.initialRating,
          compositionScore: 0,
          activityPenalty: 0,
          lastRatedAt: null,
          win: 0,
          lose: 0,
          placement: true,
          placementPlayed: 0,
        },
      })
    }

    log(
      `[${plan.slug}] 반영 완료 — 선수 ${written} · 클랜 ${plan.clans.length} · ` +
        `시즌0 경기 없어 되돌린 선수 ${others.length} · 클랜 ${otherClans.length}`,
    )

    /* ---- 반영 뒤 검증: 통합 = 기본 + 스나 + 라플 ---- */
    const broken = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM (
        SELECT lp.rating, lp."baseRating",
               COALESCE(SUM(ws."ratingDelta"), 0) AS d
          FROM "LeaguePlayer" lp
          LEFT JOIN "LeaguePlayerWeaponStat" ws ON ws."leaguePlayerId" = lp.id
         WHERE lp."leagueId" = ${plan.leagueId}
         GROUP BY lp.id, lp.rating, lp."baseRating") t
       WHERE t.rating <> t."baseRating" + t.d`
    const n = Number(broken[0]?.n ?? 0)
    console.log(`  불변식(통합 = 기본 + 스나 + 라플) 어긋난 선수: ${n}${n === 0 ? ' ✓' : ' ✗'}`)
  }

  console.log(`\n되돌리려면: --revert ${backupFile}`)
}

export async function revertSeason0(file: string): Promise<void> {
  const backup = JSON.parse(readFileSync(file, 'utf8')) as Season0Backup
  if (!backup.confirmed) {
    console.log('이 백업은 미리보기 기록이다. 되돌릴 것이 없다')
    return
  }
  for (const row of backup.leaguePlayers as Array<Record<string, unknown>>) {
    await prisma.leaguePlayer.upsert({
      where: { id: row.id as string },
      create: row as never,
      update: row as never,
    })
  }
  for (const row of backup.weaponStats as Array<Record<string, unknown>>) {
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
  for (const row of backup.leagueClans as Array<Record<string, unknown>>) {
    await prisma.leagueClan.upsert({
      where: { id: row.id as string },
      create: row as never,
      update: row as never,
    })
  }
  console.log(
    `되돌렸다 — 선수 ${backup.leaguePlayers.length} · 무기 ${backup.weaponStats.length} · 클랜 ${backup.leagueClans.length}`,
  )
}

function argList(name: string, fallback: string[]): string[] {
  const index = process.argv.indexOf(`--${name}`)
  const raw =
    index >= 0 && process.argv[index + 1]
      ? process.argv[index + 1]!
      : (process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null)
  if (!raw) return fallback
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('season0Apply.ts')
if (invokedDirectly) {
  const revertIndex = process.argv.indexOf('--revert')
  const task =
    revertIndex >= 0
      ? revertSeason0(process.argv[revertIndex + 1] ?? '')
      : applySeason0(argList('leagues', ['supply']), process.argv.includes('--confirm'))
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
