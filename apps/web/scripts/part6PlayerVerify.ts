/**
 * ★★Part 6 — 개인 통계가 원본과 맞는가★★ (2026-09-06 · 사장님 지시). ★읽기만 한다.★
 *
 * ```
 * pnpm exec tsx apps/web/scripts/part6PlayerVerify.ts [리그당 표본수]
 * ```
 *
 * ── 무엇을 맞대나
 *   ```
 *   ① 화면이 쓰는 그 함수      `playerLadderTotals(leagueId, playerId)`
 *                             ★재구현하지 않는다.★ 화면·API 가 부르는 코드를 그대로 부른다
 *   ② 원본 줄을 직접 합산      `MatchPlayerStat` 을 한 줄씩 받아 ★JS 가 센다★
 *   ```
 *   ②의 모집단은 ①과 같아야 한다 — Cloud 0 창 · 래더 경기 · 그 리그.
 *   ★그 조건도 화면이 쓰는 모듈에서 가져온다★ (`ladderScope` · `season0Scope`).
 *   여기서 날짜를 다시 적으면 ★두 곳이 갈라져 검증 자체가 거짓이 된다.★
 *
 * ── 표본
 *   사장님 지시대로 섞는다 — 경기 많은/적은 · 스나 비중 높은/낮은 · 승률 높은/낮은.
 */
import { prisma } from '@sacloud/db'
import { withLadderMatch } from '../lib/server/queries/ladderScope'
import { seasonWindowWhere, SEASON0_FROM, SEASON0_TO } from '../lib/server/queries/season0Scope'
import { playerLadderTotals } from '../lib/server/queries/playerTotals'

const PER_LEAGUE = Number(process.argv[2] ?? 6)
const LEAGUES = ['nolink', 'supply', 'sanply'] as const
const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }

/** `킬 / (킬 + 데스) × 100` — 화면과 같은 정의 (D-149) */
const rate = (kill: number, death: number, known: number): number | null => {
  if (known === 0) return null
  const total = kill + death
  if (total === 0) return 0
  return Math.round((kill / total) * 1000) / 10
}

interface Hand {
  games: number
  knownGames: number
  win: number
  lose: number
  kill: number
  death: number
  mvp: number
  rifleGames: number
  rifleKill: number
  rifleDeath: number
  rifleKnown: number
  sniperGames: number
  sniperKill: number
  sniperDeath: number
  sniperKnown: number
  /** ★모집단 밖이 섞였나★ */
  outOfWindow: number
  otherLeague: number
  incomplete: number
}

/** ★원본 줄을 한 줄씩 받아 JS 가 직접 센다★ */
async function byHand(leagueId: string, playerId: string): Promise<Hand> {
  const rows = await prisma.matchPlayerStat.findMany({
    where: { playerId, match: withLadderMatch({ leagueId, ...seasonWindowWhere() }) },
    select: {
      kill: true,
      death: true,
      weapon: true,
      mvp: true,
      side: true,
      match: {
        select: { startAt: true, winnerSide: true, leagueId: true, lineupStatus: true },
      },
    },
  })
  const h: Hand = {
    games: 0, knownGames: 0, win: 0, lose: 0, kill: 0, death: 0, mvp: 0,
    rifleGames: 0, rifleKill: 0, rifleDeath: 0, rifleKnown: 0,
    sniperGames: 0, sniperKill: 0, sniperDeath: 0, sniperKnown: 0,
    outOfWindow: 0, otherLeague: 0, incomplete: 0,
  }
  for (const r of rows) {
    h.games += 1
    if (r.side === r.match.winnerSide) h.win += 1
    else h.lose += 1
    const known = r.kill !== null && r.death !== null
    if (known) {
      h.knownGames += 1
      h.kill += r.kill ?? 0
      h.death += r.death ?? 0
    }
    if (r.mvp) h.mvp += 1
    if (r.weapon === 0) {
      h.rifleGames += 1
      if (known) { h.rifleKnown += 1; h.rifleKill += r.kill ?? 0; h.rifleDeath += r.death ?? 0 }
    }
    if (r.weapon === 1) {
      h.sniperGames += 1
      if (known) { h.sniperKnown += 1; h.sniperKill += r.kill ?? 0; h.sniperDeath += r.death ?? 0 }
    }
    /* ★섞이면 안 되는 것들★ */
    if (r.match.startAt < SEASON0_FROM) h.outOfWindow += 1
    if (SEASON0_TO && r.match.startAt >= SEASON0_TO) h.outOfWindow += 1
    if (r.match.leagueId !== leagueId) h.otherLeague += 1
    if (r.match.lineupStatus === 'incomplete') h.incomplete += 1
  }
  return h
}

/** 표본을 고른다 — 경기 많은/적은 · 스나 많은 · 라플 위주 · 승률 높은/낮은 */
async function pick(leagueId: string): Promise<Array<{ playerId: string; name: string; why: string }>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ playerId: string; name: string; games: number; sniper: number; win: number }>
  >(`
    SELECT ps."playerId", p.name, COUNT(*)::int AS games,
           COUNT(*) FILTER (WHERE ps.weapon = 1)::int AS sniper,
           COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int AS win
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "Player" p ON p.id = ps."playerId"
     WHERE m."leagueId" = $1
       AND m."startAt" >= $2 AND m."startAt" < $3
       AND (m."redRatingUpdate" IS NOT NULL
            OR m.origin IN ('3rd.supply','nexon','nexon_barracks'))
     GROUP BY 1,2 HAVING COUNT(*) >= 1`, leagueId, SEASON0_FROM, SEASON0_TO ?? new Date('2100-01-01'))

  if (rows.length === 0) return []
  const out = new Map<string, { playerId: string; name: string; why: string }>()
  const add = (r: (typeof rows)[number] | undefined, why: string) => {
    if (r && !out.has(r.playerId)) out.set(r.playerId, { playerId: r.playerId, name: r.name, why })
  }
  const byGames = [...rows].sort((a, b) => b.games - a.games)
  add(byGames[0], '경기 제일 많음')
  add(byGames[byGames.length - 1], '경기 제일 적음')
  const bySniper = [...rows].filter((r) => r.games >= 3).sort((a, b) => b.sniper / b.games - a.sniper / a.games)
  add(bySniper[0], '스나 비중 최고')
  add(bySniper[bySniper.length - 1], '라플 비중 최고')
  const byWin = [...rows].filter((r) => r.games >= 5).sort((a, b) => b.win / b.games - a.win / a.games)
  add(byWin[0], '승률 최고')
  add(byWin[byWin.length - 1], '승률 최저')
  /* 남는 자리는 판수 중간에서 채운다 */
  for (const r of byGames.slice(Math.floor(byGames.length / 2))) {
    if (out.size >= PER_LEAGUE) break
    add(r, '중간')
  }
  return [...out.values()].slice(0, PER_LEAGUE)
}

async function main(): Promise<void> {
  console.info(`══ Part 6 · 개인 통계 대조 ══`)
  console.info(`  창 ${SEASON0_FROM.toISOString()} ~ ${SEASON0_TO?.toISOString() ?? '(끝 없음)'}\n`)

  let checked = 0
  let bad = 0
  for (const slug of LEAGUES) {
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue
    const picks = await pick(league.id)
    console.info(`── ${LABEL[slug]} (${slug}) · 표본 ${picks.length}명 ──`)
    for (const p of picks) {
      const api = await playerLadderTotals(league.id, p.playerId)
      const h = await byHand(league.id, p.playerId)
      const same =
        api.games === h.games &&
        api.knownGames === h.knownGames &&
        api.win === h.win &&
        api.lose === h.lose &&
        (api.kill ?? 0) === (h.knownGames === 0 ? 0 : h.kill) &&
        (api.death ?? 0) === (h.knownGames === 0 ? 0 : h.death) &&
        api.kdRate === rate(h.kill, h.death, h.knownGames) &&
        api.mvpCount === h.mvp &&
        api.rifle.games === h.rifleGames &&
        (api.rifle.kill ?? 0) === (h.rifleKnown === 0 ? 0 : h.rifleKill) &&
        (api.rifle.death ?? 0) === (h.rifleKnown === 0 ? 0 : h.rifleDeath) &&
        api.rifle.kdRate === rate(h.rifleKill, h.rifleDeath, h.rifleKnown) &&
        api.sniper.games === h.sniperGames &&
        (api.sniper.kill ?? 0) === (h.sniperKnown === 0 ? 0 : h.sniperKill) &&
        (api.sniper.death ?? 0) === (h.sniperKnown === 0 ? 0 : h.sniperDeath) &&
        api.sniper.kdRate === rate(h.sniperKill, h.sniperDeath, h.sniperKnown) &&
        h.outOfWindow === 0 &&
        h.otherLeague === 0 &&
        h.incomplete === 0
      checked += 1
      if (!same) bad += 1
      const wr = h.games === 0 ? '-' : ((h.win / h.games) * 100).toFixed(1)
      console.info(
        `  ${same ? '✔' : '✘'} ${p.name.padEnd(16)} (${p.why})\n` +
          `      화면  ${api.games}판 ${api.win}승 ${api.lose}패 · ${api.kill ?? 'null'}킬 ${api.death ?? 'null'}데스 (킬뎃 ${api.kdRate ?? 'null'}%) · MVP ${api.mvpCount}\n` +
          `      손셈  ${h.games}판 ${h.win}승 ${h.lose}패 (승률 ${wr}%) · ${h.kill}킬 ${h.death}데스 (킬뎃 ${rate(h.kill, h.death, h.knownGames) ?? 'null'}%) · MVP ${h.mvp}\n` +
          `      스나  화면 ${api.sniper.games}판 ${api.sniper.kill ?? 'null'}/${api.sniper.death ?? 'null'} (${api.sniper.kdRate ?? 'null'}%) · 손셈 ${h.sniperGames}판 ${h.sniperKill}/${h.sniperDeath} (${rate(h.sniperKill, h.sniperDeath, h.sniperKnown) ?? 'null'}%)\n` +
          `      라플  화면 ${api.rifle.games}판 ${api.rifle.kill ?? 'null'}/${api.rifle.death ?? 'null'} (${api.rifle.kdRate ?? 'null'}%) · 손셈 ${h.rifleGames}판 ${h.rifleKill}/${h.rifleDeath} (${rate(h.rifleKill, h.rifleDeath, h.rifleKnown) ?? 'null'}%)\n` +
          `      ★창 밖 ${h.outOfWindow} · 다른 리그 ${h.otherLeague} · 불완전 경기 ${h.incomplete}★`,
      )
    }
    console.info('')
  }
  console.info(`  표본 ${checked}명 중 ★어긋난 선수 ${bad}명★`)
    await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
