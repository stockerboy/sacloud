/**
 * 점수 시스템 백테스트 — **실제 경기로 어느 쪽이 맞는지 판정한다** (D-172).
 *
 * ── 왜 필요한가
 *
 * "이게 더 합리적이다" 는 서로 의견이 갈린다. 갈리면 정할 수 없다.
 * 점수 시스템의 목적은 **실력을 맞추는 것**이고, 실력을 맞췄는지는
 * "다음 경기 결과를 얼마나 맞히는가" 로 잴 수 있다. 그것만이 취향이 아니다.
 *
 * ── 방법 (prequential — 실제 래더가 도는 방식 그대로)
 *
 * ```
 * 경기를 시간순으로 하나씩 본다
 *   1) 지금까지의 점수로 이 경기 승부를 **예측한다**   ← 아직 결과를 모른 채로
 *   2) 실제 결과와 맞춰 기록한다
 *   3) 그 결과로 점수를 갱신한다
 * ```
 * 앞 구간(기본 30일)은 몸풀기라 채점에서 뺀다 — 모두 3000 에서 시작하기 때문이다.
 *
 * ── 재는 것
 *
 *   적중률      맞힌 비율 (높을수록 좋다)
 *   Brier       (예측확률 − 실제)² 평균 (낮을수록 좋다 · 확률까지 본다)
 *   LogLoss     확신에 찬 오답을 더 크게 벌준다 (낮을수록 좋다)
 *
 * ── 같이 보는 납득성 지표
 *
 *   판수↔순위 상관   판수가 순위를 밀어 올리면 0 에서 멀어진다. **0 에 가까워야 한다**
 *   0점 경기 비율    이겼는데 점수가 안 오른 경기 비율
 *   제로섬 오차      전체 증감의 합. 0 에서 멀면 점수가 새거나 불어난다
 *
 * DB 에 한 줄도 쓰지 않는다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/jobs/ratingBacktest.ts --league supply
 * pnpm --filter @sacloud/worker exec tsx src/jobs/ratingBacktest.ts --league supply --from 2026-01-01 --to 2026-07-01
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import {
  DEFAULT_RATING_CONSTANTS,
  V2_RATING_CONSTANTS,
  displayScore,
  expectedScore,
  rateMatch,
  type ConfirmedParticipant,
  type RatingConstants,
} from '@sacloud/rating'
import { REPO_ROOT } from '../lib/env.js'
import { log } from '../lib/log.js'

const MIRROR_ORIGIN = '3rd.supply'
const DAY_MS = 24 * 60 * 60 * 1000

export interface BacktestMetrics {
  system: string
  matchesConsidered: number
  matchesRated: number
  scored: number
  /** 클랜 점수로 예측했을 때 */
  clan: { accuracy: number; brier: number; logLoss: number }
  /** 출전 10명의 개인 점수 평균으로 예측했을 때 */
  lineup: { accuracy: number; brier: number; logLoss: number }
  /**
   * 본클랜원 수별 예측 정확도 — **가중치의 근거**.
   *
   * 진지하게 한 경기는 잘하는 팀이 이긴다(예측이 맞는다).
   * 대충 한 경기는 동전 던지기에 가깝다(예측이 빗나간다).
   * 그래서 "본클랜원이 적은 경기일수록 예측이 안 맞는다" 가 사실이면
   * 그 경기에 점수를 덜 주는 것이 통계적으로 옳다.
   *
   * 묶는 기준은 **양 팀 중 더 적은 쪽**이다 — 열산은 양쪽 다 용병투성이다.
   */
  byComposition: { members: number; n: number; accuracy: number; brier: number }[]
  gamesRankCorrelation: number
  zeroDeltaMatchRate: number
  personalDrift: number
  clanDrift: number
  rankedPlayers: number
  top: { name: string; display: number; games: number; win: number; lose: number }[]
  topClans: { name: string; display: number; games: number; win: number; lose: number }[]
}

interface MatchRow {
  id: string
  startAt: Date
  redLeagueClanId: string
  blueLeagueClanId: string
  winnerSide: string
  stats: {
    playerId: string
    side: string
    kill: number | null
    death: number | null
    assist: number | null
    rosterLeagueClanId: string | null
    participantRole: string
  }[]
}

/** 스피어만 순위 상관 — 판수가 순위를 밀어 올리는지 본다 */
function spearman(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return 0
  const rank = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const out = new Array<number>(n)
    let i = 0
    while (i < n) {
      let j = i
      while (j + 1 < n && order[j + 1]!.v === order[i]!.v) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) out[order[k]!.i] = avg
      i = j + 1
    }
    return out
  }
  const rx = rank(xs)
  const ry = rank(ys)
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length
  const mx = mean(rx)
  const my = mean(ry)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx
    const b = ry[i]! - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy)
}

export async function backtest(input: {
  matches: MatchRow[]
  constants: RatingConstants
  systemName: string
  burnInUntil: Date
  nameOf: Map<string, string>
  clanNameOf: Map<string, string>
}): Promise<BacktestMetrics> {
  const { matches, constants } = input

  const playerRating = new Map<string, number>()
  const playerGames = new Map<string, number>()
  const playerWin = new Map<string, number>()
  const playerLose = new Map<string, number>()
  const clanRating = new Map<string, number>()
  const clanGames = new Map<string, number>()
  const clanWin = new Map<string, number>()
  const clanLose = new Map<string, number>()

  const ratingOf = (id: string): number => playerRating.get(id) ?? constants.initialRating
  const clanRatingOf = (id: string): number => clanRating.get(id) ?? constants.initialRating

  let scored = 0
  let clanHit = 0
  let clanBrier = 0
  let clanLogLoss = 0
  let lineupHit = 0
  let lineupBrier = 0
  let lineupLogLoss = 0
  let matchesRated = 0
  let zeroDeltaMatches = 0
  let personalDrift = 0
  let clanDrift = 0
  /** 본클랜원 수(양 팀 중 적은 쪽) → 예측 성적 */
  const compBuckets = new Map<number, { n: number; hit: number; brier: number }>()

  for (const match of matches) {
    const participants: ConfirmedParticipant[] = match.stats.map((stat) => ({
      playerId: stat.playerId,
      rosterLeagueClanId: stat.rosterLeagueClanId,
      outcome: match.winnerSide === stat.side ? ('win' as const) : ('lose' as const),
      kill: stat.kill,
      death: stat.death,
      assist: stat.assist,
      sources: ['player_match_list' as const],
      ratingBefore: ratingOf(stat.playerId),
    }))

    /* ---- 1) 결과를 모른 채 예측한다 ---- */
    const redStats = match.stats.filter((s) => s.side === 'red')
    const blueStats = match.stats.filter((s) => s.side === 'blue')
    const avg = (rows: typeof redStats): number =>
      rows.length > 0
        ? rows.reduce((sum, r) => sum + ratingOf(r.playerId), 0) / rows.length
        : constants.initialRating
    const pClan = expectedScore(
      clanRatingOf(match.redLeagueClanId),
      clanRatingOf(match.blueLeagueClanId),
      constants,
    )
    const pLineup = expectedScore(avg(redStats), avg(blueStats), constants)
    const actual = match.winnerSide === 'red' ? 1 : 0

    const rated = rateMatch({
      participants,
      sideEvidence: {
        winnerLeagueClanId:
          match.winnerSide === 'red' ? match.redLeagueClanId : match.blueLeagueClanId,
        loserLeagueClanId:
          match.winnerSide === 'red' ? match.blueLeagueClanId : match.redLeagueClanId,
        source: 'stored-match',
      },
      clanRatings: {
        [match.redLeagueClanId]: clanRatingOf(match.redLeagueClanId),
        [match.blueLeagueClanId]: clanRatingOf(match.blueLeagueClanId),
      },
      placementPlayerIds: participants
        .filter((p) => (playerGames.get(p.playerId) ?? 0) < constants.placementMatches)
        .map((p) => p.playerId),
      placementClanIds: [match.redLeagueClanId, match.blueLeagueClanId].filter(
        (id) => (clanGames.get(id) ?? 0) < constants.placementMatches,
      ),
      constants,
      playerGames: Object.fromEntries(
        participants.map((p) => [p.playerId, playerGames.get(p.playerId) ?? 0]),
      ),
    })

    if (!rated.eligibility.ratingEligible) continue
    matchesRated += 1

    /* ---- 2) 채점 (몸풀기 구간은 뺀다) ---- */
    if (match.startAt >= input.burnInUntil) {
      scored += 1
      const clip = (p: number): number => Math.min(1 - 1e-9, Math.max(1e-9, p))
      clanHit += (pClan >= 0.5 ? 1 : 0) === actual ? 1 : 0
      clanBrier += (pClan - actual) ** 2
      clanLogLoss += -(actual * Math.log(clip(pClan)) + (1 - actual) * Math.log(clip(1 - pClan)))
      lineupHit += (pLineup >= 0.5 ? 1 : 0) === actual ? 1 : 0
      lineupBrier += (pLineup - actual) ** 2
      lineupLogLoss +=
        -(actual * Math.log(clip(pLineup)) + (1 - actual) * Math.log(clip(1 - pLineup)))

      /* 본클랜원 수별로 예측 성적을 쌓는다 — 가중치의 근거가 된다 */
      const membersRed = redStats.filter((r) => r.participantRole === 'member').length
      const membersBlue = blueStats.filter((r) => r.participantRole === 'member').length
      const bucketKey = Math.min(membersRed, membersBlue)
      const bucket = compBuckets.get(bucketKey) ?? { n: 0, hit: 0, brier: 0 }
      bucket.n += 1
      bucket.hit += (pLineup >= 0.5 ? 1 : 0) === actual ? 1 : 0
      bucket.brier += (pLineup - actual) ** 2
      compBuckets.set(bucketKey, bucket)

      /* 이겼는데 점수가 안 오른 경기인가 */
      const winnerDelta = rated.players
        .filter((p) => p.outcome === 'win')
        .reduce((sum, p) => sum + Math.abs(p.ratingUpdate), 0)
      if (winnerDelta < 1e-9) zeroDeltaMatches += 1
    }

    /* ---- 3) 갱신 ---- */
    for (const player of rated.players) {
      personalDrift += player.ratingUpdate
      playerRating.set(player.playerId, player.ratingAfter)
      playerGames.set(player.playerId, (playerGames.get(player.playerId) ?? 0) + 1)
      if (player.outcome === 'win')
        playerWin.set(player.playerId, (playerWin.get(player.playerId) ?? 0) + 1)
      else playerLose.set(player.playerId, (playerLose.get(player.playerId) ?? 0) + 1)
    }
    for (const clan of rated.clans) {
      clanDrift += clan.ratingUpdate
      clanRating.set(clan.leagueClanId, clan.ratingAfter)
      clanGames.set(clan.leagueClanId, (clanGames.get(clan.leagueClanId) ?? 0) + 1)
      if (clan.outcome === 'win')
        clanWin.set(clan.leagueClanId, (clanWin.get(clan.leagueClanId) ?? 0) + 1)
      else clanLose.set(clan.leagueClanId, (clanLose.get(clan.leagueClanId) ?? 0) + 1)
    }
  }

  /* ---- 최종 순위 (배치고사 미만은 뺀다) ---- */
  const rows = [...playerRating.entries()]
    .filter(([id]) => (playerGames.get(id) ?? 0) >= constants.placementMatches)
    .map(([id, internal]) => {
      const games = playerGames.get(id) ?? 0
      const win = playerWin.get(id) ?? 0
      const lose = playerLose.get(id) ?? 0
      const played = win + lose
      const shown = displayScore({
        internalRating: internal,
        games,
        winRate: played > 0 ? win / played : 0,
        constants,
      })
      return { id, name: input.nameOf.get(id) ?? '(알수없음)', display: shown.display, games, win, lose }
    })
    .sort((a, b) => b.display - a.display)

  const clanRows = [...clanRating.entries()]
    .filter(([id]) => (clanGames.get(id) ?? 0) >= constants.placementMatches)
    .map(([id, internal]) => {
      const games = clanGames.get(id) ?? 0
      const win = clanWin.get(id) ?? 0
      const lose = clanLose.get(id) ?? 0
      const shown = displayScore({
        internalRating: internal,
        games,
        winRate: games > 0 ? win / games : 0,
        constants,
      })
      return {
        name: input.clanNameOf.get(id) ?? '(이름 없음)',
        display: shown.display,
        games,
        win,
        lose,
      }
    })
    .sort((a, b) => b.display - a.display)

  return {
    system: input.systemName,
    matchesConsidered: matches.length,
    matchesRated,
    scored,
    clan: {
      accuracy: scored > 0 ? clanHit / scored : 0,
      brier: scored > 0 ? clanBrier / scored : 0,
      logLoss: scored > 0 ? clanLogLoss / scored : 0,
    },
    lineup: {
      accuracy: scored > 0 ? lineupHit / scored : 0,
      brier: scored > 0 ? lineupBrier / scored : 0,
      logLoss: scored > 0 ? lineupLogLoss / scored : 0,
    },
    byComposition: [...compBuckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([members, b]) => ({
        members,
        n: b.n,
        accuracy: b.n > 0 ? b.hit / b.n : 0,
        brier: b.n > 0 ? b.brier / b.n : 0,
      })),
    gamesRankCorrelation: spearman(
      rows.map((r) => r.games),
      rows.map((r) => r.display),
    ),
    zeroDeltaMatchRate: scored > 0 ? zeroDeltaMatches / scored : 0,
    personalDrift,
    clanDrift,
    rankedPlayers: rows.length,
    top: rows.slice(0, 20).map(({ name, display, games, win, lose }) => ({ name, display, games, win, lose })),
    topClans: clanRows.slice(0, 20),
  }
}

function argOf(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]!
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`))
  return inline ? inline.split('=')[1]! : fallback
}

async function main(): Promise<void> {
  const leagueSlug = argOf('league', 'supply')
  const from = new Date(`${argOf('from', '2026-01-01')}T00:00:00.000Z`)
  const to = new Date(`${argOf('to', '2026-07-01')}T00:00:00.000Z`)
  const burnInDays = Number(argOf('burn-in-days', '30'))
  const burnInUntil = new Date(from.getTime() + burnInDays * DAY_MS)

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, name: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${leagueSlug}`)

  log(`[${leagueSlug}] 경기를 읽는다 — ${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)}`)
  const matches = (await prisma.match.findMany({
    where: { leagueId: league.id, origin: MIRROR_ORIGIN, startAt: { gte: from, lt: to } },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      startAt: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
      winnerSide: true,
      stats: {
        select: {
          playerId: true,
          side: true,
          kill: true,
          death: true,
          assist: true,
          rosterLeagueClanId: true,
          participantRole: true,
        },
      },
    },
  })) as MatchRow[]
  log(`${matches.length}경기 · 몸풀기 ${burnInDays}일 제외하고 채점한다`)

  const playerIds = [...new Set(matches.flatMap((m) => m.stats.map((s) => s.playerId)))]
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(players.map((p) => [p.id, p.name]))
  const clanIds = [...new Set(matches.flatMap((m) => [m.redLeagueClanId, m.blueLeagueClanId]))]
  const leagueClans = await prisma.leagueClan.findMany({
    where: { id: { in: clanIds } },
    select: { id: true, clan: { select: { name: true } } },
  })
  const clanNameOf = new Map(leagueClans.map((c) => [c.id, c.clan?.name ?? '(이름 없음)']))

  const systems: { name: string; constants: RatingConstants }[] = [
    { name: 'v1 (지금 · D-145)', constants: DEFAULT_RATING_CONSTANTS },
    { name: 'v2 (제안 · D-172)', constants: V2_RATING_CONSTANTS },
  ]

  const results: BacktestMetrics[] = []
  for (const system of systems) {
    log(`— ${system.name} 계산 중`)
    results.push(
      await backtest({
        matches,
        constants: system.constants,
        systemName: system.name,
        burnInUntil,
        nameOf,
        clanNameOf,
      }),
    )
  }

  console.log('\n## 예측 정확도 — 클랜 점수로 승부 예측')
  console.table(
    results.map((r) => ({
      시스템: r.system,
      채점경기: r.scored,
      적중률: `${(r.clan.accuracy * 100).toFixed(2)}%`,
      Brier: r.clan.brier.toFixed(4),
      LogLoss: r.clan.logLoss.toFixed(4),
    })),
  )

  console.log('\n## 예측 정확도 — 출전 10명 개인 점수 평균으로 승부 예측')
  console.table(
    results.map((r) => ({
      시스템: r.system,
      적중률: `${(r.lineup.accuracy * 100).toFixed(2)}%`,
      Brier: r.lineup.brier.toFixed(4),
      LogLoss: r.lineup.logLoss.toFixed(4),
    })),
  )

  console.log('\n## 납득성 지표')
  console.table(
    results.map((r) => ({
      시스템: r.system,
      '판수↔순위 상관': r.gamesRankCorrelation.toFixed(3),
      '이겼는데 0점 경기': `${(r.zeroDeltaMatchRate * 100).toFixed(2)}%`,
      '랭킹 인원': r.rankedPlayers,
      '개인 제로섬 오차': r.personalDrift.toFixed(1),
      '클랜 제로섬 오차': r.clanDrift.toFixed(1),
    })),
  )

  for (const r of results) {
    console.log(`\n## ${r.system} — 개인 TOP 10`)
    console.table(
      r.top.slice(0, 10).map((p, i) => ({
        순위: i + 1,
        선수: p.name,
        점수: p.display,
        판수: p.games,
        승: p.win,
        패: p.lose,
        승률: `${((p.win / Math.max(1, p.win + p.lose)) * 100).toFixed(1)}%`,
      })),
    )
    console.log(`## ${r.system} — 클랜 TOP 10`)
    console.table(
      r.topClans.slice(0, 10).map((c, i) => ({
        순위: i + 1,
        클랜: c.name,
        점수: c.display,
        판수: c.games,
        승: c.win,
        패: c.lose,
        승률: `${((c.win / Math.max(1, c.win + c.lose)) * 100).toFixed(1)}%`,
      })),
    )
  }

  const outDir = path.join(REPO_ROOT, 'apps', 'worker', 'reports', 'backtest')
  mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `${leagueSlug}.json`)
  writeFileSync(file, JSON.stringify({ league: leagueSlug, from, to, burnInDays, results }, null, 2), 'utf8')
  console.log(`\n결과 파일: ${file}`)

  await prisma.$disconnect()
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('ratingBacktest.ts')
if (invokedDirectly) {
  main().catch(async (e: unknown) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
}
