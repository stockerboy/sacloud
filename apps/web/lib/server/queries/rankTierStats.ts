/**
 * ★랭킹 줄의 대표 숫자★ — 「그 선수 구간」 의 승률과 「그 구간 + 그 무기」 의 킬뎃
 * (2026-09-11 사장님)
 *
 * > «아스트라 구간에서의 킬데스를 대표 킬뎃, 즉 본인이 해당하는 구간의 킬뎃과
 * >  본인의 포지션에 맞는 킬뎃을 여기 적어달라고 하고, 승률도 자기가 소속된 구간의
 * >  승률을 대표 승률로 적으라고 했는데»
 *
 * 선수 페이지 머리 카드가 이미 그렇게 적고 있었는데 ★랭킹만 통합으로 나가고 있었다.★
 * 실측(2026-09-11 lximmore) — 선수 페이지 ASTRA·스나 48.0% / 63.1%,
 * 랭킹 51.4%(통합) / 63.4%(스나 전 구간). 두 화면이 다른 답을 냈다.
 *
 * ── 구간을 무엇으로 정하나
 *   ★상대 클랜의 지금 티어★ 다 — 선수 페이지의 구간 카드(`tierBreakdown.ts`)와 ★같은 규칙★ 이다.
 *   두 화면이 다른 규칙을 쓰면 또 갈라진다. 그래서 판정을 여기서 새로 짜지 않고 그대로 옮겼다.
 *
 * ── 왕복
 *   한 페이지 20줄을 ★한 번에★ 읽는다. 줄마다 부르면 20번이 된다.
 *   모집단은 화면의 다른 수치와 같은 `withLadderMatch()` + 시즌0 창이다 (D-164 · D-178).
 */
import { prisma } from '@sacloud/db'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'

/** 한 선수 · 한 구간의 셈 */
export interface RankTierTally {
  games: number
  win: number
  lose: number
  /** 무기를 가리지 않은 킬·데스 (모르는 판은 뺀다 · D-149) */
  kill: number
  death: number
  knownGames: number
  rifleGames: number
  rifleKill: number
  rifleDeath: number
  sniperGames: number
  sniperKill: number
  sniperDeath: number
}

const empty = (): RankTierTally => ({
  games: 0, win: 0, lose: 0, kill: 0, death: 0, knownGames: 0,
  rifleGames: 0, rifleKill: 0, rifleDeath: 0,
  sniperGames: 0, sniperKill: 0, sniperDeath: 0,
})

/** `playerId` → (`구간` → 셈) */
export type RankTierStats = Map<string, Map<number, RankTierTally>>

/**
 * 여러 선수의 구간별 셈을 한 번에 읽는다.
 *
 * 선수가 없으면 빈 표를 준다 (질의를 걸지 않는다).
 */
export async function rankTierStatsOf(leagueId: string, playerIds: readonly string[]): Promise<RankTierStats> {
  const out: RankTierStats = new Map()
  if (playerIds.length === 0) return out

  const rows = await prisma.matchPlayerStat.findMany({
    where: { playerId: { in: [...playerIds] }, match: withLadderMatch({ leagueId, ...seasonWindowWhere() }) },
    select: {
      playerId: true,
      side: true,
      /* 지금 명부에 없는 상대는 ★지어내지 않고★ 이 옛 값으로 떨어진다 */
      opponentDivisionAtMatch: true,
      kill: true,
      death: true,
      weapon: true,
      match: { select: { winnerSide: true, redLeagueClanId: true, blueLeagueClanId: true } },
    },
  })
  if (rows.length === 0) return out

  /* 상대 클랜의 ★지금★ 티어 — 선수 페이지 구간 카드와 같은 규칙 (tierBreakdown.ts `tierOf`) */
  const opponentIds = new Set<string>()
  for (const row of rows) {
    opponentIds.add(row.side === 'red' ? row.match.blueLeagueClanId : row.match.redLeagueClanId)
  }
  const clanRows = await prisma.leagueClan.findMany({
    where: { id: { in: [...opponentIds] } },
    select: { id: true, division: true },
  })
  const divisionById = new Map(clanRows.map((row) => [row.id, row.division]))

  for (const row of rows) {
    const opponentId = row.side === 'red' ? row.match.blueLeagueClanId : row.match.redLeagueClanId
    const tier = divisionById.get(opponentId) ?? row.opponentDivisionAtMatch
    let byTier = out.get(row.playerId)
    if (!byTier) { byTier = new Map(); out.set(row.playerId, byTier) }
    let t = byTier.get(tier)
    if (!t) { t = empty(); byTier.set(tier, t) }

    t.games += 1
    if (row.match.winnerSide === row.side) t.win += 1
    else t.lose += 1

    /* ★킬뎃을 모르는 판은 분모에서 뺀다★ (D-149). 0킬 0데스로 세지 않는다 */
    if (row.kill === null || row.death === null) continue
    t.knownGames += 1
    t.kill += row.kill
    t.death += row.death
    /* ★무기를 모르는 판은 어느 축에도 안 넣는다★ */
    if (row.weapon === 0) {
      t.rifleGames += 1
      t.rifleKill += row.kill
      t.rifleDeath += row.death
    } else if (row.weapon === 1) {
      t.sniperGames += 1
      t.sniperKill += row.kill
      t.sniperDeath += row.death
    }
  }
  return out
}

/** 그 구간에서 ★그 무기★ 로 뛴 킬·데스·판수. 무기를 모르면 무기를 안 가린 값 */
export function weaponSliceOf(t: RankTierTally | undefined, weapon: 0 | 1 | null): { kill: number; death: number; games: number } {
  if (!t) return { kill: 0, death: 0, games: 0 }
  if (weapon === 0) return { kill: t.rifleKill, death: t.rifleDeath, games: t.rifleGames }
  if (weapon === 1) return { kill: t.sniperKill, death: t.sniperDeath, games: t.sniperGames }
  return { kill: t.kill, death: t.death, games: t.knownGames }
}
