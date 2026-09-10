/**
 * ★선수 여섯 축 · 실력 점수★ — 미리 접어 둔 한 줄을 읽어 계약 모양으로 옮긴다 (2026-09-10)
 *
 * 계산하지 않는다. `LeaguePlayerHex` 는 워커 잡 `player-hex-build` 가 30분마다 접어 둔다.
 * 공식은 `apps/worker/src/lib/playerHexScore.ts` 한 곳뿐이다.
 *
 * 옛 방식(`playerTraits.ts` — 화면 요청마다 리그 분포를 훑어 계산)은 지우지 않는다.
 * `records.ts` 의 `PLAYER_TRAITS_ENABLED` 로 꺼져 있다 (`CLAUDE.md` 1-4).
 */
import { prisma } from '@sacloud/db'
import {
  PLAYER_HEX_AXIS_ORDER,
  PLAYER_HEX_BADGE,
  PLAYER_HEX_BADGE_RANK,
  PLAYER_HEX_DESC,
  playerHexLabelOf,
  type PlayerHex,
  type PlayerHexAxis,
  type TraitAxisKey,
} from '@sacloud/contract'
import { toKstIso } from '../format'

type HexRow = NonNullable<Awaited<ReturnType<typeof readHexRow>>>

function readHexRow(leaguePlayerId: string) {
  return prisma.leaguePlayerHex.findUnique({ where: { leaguePlayerId } })
}

export async function playerHexOf(leaguePlayerId: string): Promise<PlayerHex | null> {
  const row = await readHexRow(leaguePlayerId)
  return row ? toPlayerHex(row) : null
}

/** 축마다 (원값 · 백분위 · 등수 · 모집단 · «잡음:당함» 표기) — 열 이름이 규칙적이라 표로 뽑는다 */
const AXIS_COLUMNS: Record<
  TraitAxisKey,
  { value: keyof HexRow; pct: keyof HexRow; rank: keyof HexRow; total: keyof HexRow; unit: 'percent' | 'per_game' }
> = {
  save: { value: 'save', pct: 'savePct', rank: 'saveRank', total: 'saveTotal', unit: 'percent' },
  duel: { value: 'duel', pct: 'duelPct', rank: 'duelRank', total: 'duelTotal', unit: 'percent' },
  carry: { value: 'carry', pct: 'carryPct', rank: 'carryRank', total: 'carryTotal', unit: 'per_game' },
  opening: { value: 'opening', pct: 'openingPct', rank: 'openingRank', total: 'openingTotal', unit: 'percent' },
  burst: { value: 'burst', pct: 'burstPct', rank: 'burstRank', total: 'burstTotal', unit: 'percent' },
  outnumbered: {
    value: 'outnumbered',
    pct: 'outnumberedPct',
    rank: 'outnumberedRank',
    total: 'outnumberedTotal',
    unit: 'percent',
  },
}

function partsOf(row: HexRow, key: TraitAxisKey): { numerator: number | null; denominator: number | null } {
  switch (key) {
    case 'save':
      return { numerator: row.aloneWon, denominator: row.aloneRounds }
    case 'duel':
      return { numerator: row.duelWon, denominator: row.duelLost }
    case 'opening':
      return { numerator: row.firstKills, denominator: row.rounds }
    case 'burst':
      return { numerator: row.burstRounds, denominator: row.rounds }
    case 'outnumbered':
      return { numerator: row.outWon, denominator: row.outRounds }
    case 'carry':
      return { numerator: null, denominator: null }
  }
}

export function toPlayerHex(row: HexRow): PlayerHex {
  const weapon = row.weapon === 0 || row.weapon === 1 ? row.weapon : null
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const axes: PlayerHexAxis[] = PLAYER_HEX_AXIS_ORDER.map((key) => {
    const col = AXIS_COLUMNS[key]
    const rank = num(row[col.rank])
    const badgePair = PLAYER_HEX_BADGE[key]
    const descPair = PLAYER_HEX_DESC[key]
    return {
      key,
      label: playerHexLabelOf(key, weapon),
      desc: weapon === 0 ? descPair.rifle : descPair.sniper,
      value: num(row[col.value]),
      unit: col.unit,
      percentile: num(row[col.pct]),
      rank,
      total: num(row[col.total]),
      badge: rank !== null && rank <= PLAYER_HEX_BADGE_RANK ? (weapon === 0 ? badgePair.rifle : badgePair.sniper) : null,
      ...partsOf(row, key),
    }
  })
  return {
    weapon,
    games: row.games,
    weapon_games: row.weaponGames,
    rounds: row.rounds,
    axes,
    hex: row.hex,
    score: row.score,
    score_rank: row.scoreRank,
    score_total: row.scoreTotal,
    win_rate_rank: row.winRateRank,
    win_rate_total: row.winRateTotal,
    tier_factor: row.tierFactor,
    shrink: row.shrink,
    clan_bonus: row.clanBonus,
    measuring: weapon === null,
    formula_version: row.formulaVersion,
    updated_at: toKstIso(row.updatedAt),
  }
}
