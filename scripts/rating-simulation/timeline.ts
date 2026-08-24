/**
 * 시즌 시간축 검증 (D-144).
 *
 * FINAL SPEC(D-143)을 **바꾸지 않고**, 3개월 시즌을 날짜 순서대로 재생하면서
 * 특정 날짜의 리더보드가 어떤 모습인지만 잰다.
 *
 * ── 스냅샷을 어떻게 만드는가
 *   최종 결과를 1/3, 2/3 로 나누지 **않는다.** 그러면 그 시점의 신뢰도·승률 자격선·
 *   활동 페널티가 전부 틀린 값이 된다.
 *   day N 의 스냅샷은 **day N 까지의 경기만** 시간순으로 재생하고, 감점 tick 도
 *   day N 까지만 돌려서 만든다. 즉 실제로 그날 리더보드를 열어 본 것과 같다.
 */
import { Rng } from './rng.js'
import {
  makeArchetypePlayers,
  makeClans,
  makePlayers,
  type PopulationOptions,
  type SimClan,
  type SimPlayer,
} from './population.js'
import {
  personalLeaderboard,
  replay,
  scheduleSeason,
  type LeaderRow,
  type SimMatch,
} from './season.js'
import { CANDIDATE1_CLAN, CANDIDATE1_PERSONAL, setCompositionParams } from './engine.js'
import { FINAL_DISPLAY_SCALE, FINAL_SUPPRESSION } from './final.js'

export const SNAPSHOT_DAYS = [7, 14, 30, 45, 60, 75, 90] as const
export const SEASON_DAYS = 90
const DAY = 24 * 60

/** D-143 최종 사양 그대로 */
export const SPEC_PERSONAL = {
  ...CANDIDATE1_PERSONAL,
  performanceWeight: 0,
  displayScale: 1,
  weakWinSuppression: FINAL_SUPPRESSION,
}
const DISPLAY = { transform: 'linear' as const, scale: FINAL_DISPLAY_SCALE }

export interface ScenarioSpec {
  label: string
  players: number
  clans: number
  seed: number
  population?: PopulationOptions
}

export interface Snapshot {
  day: number
  rows: LeaderRow[]
}

export function buildSeason(spec: ScenarioSpec): {
  players: SimPlayer[]
  clans: SimClan[]
  matches: SimMatch[]
} {
  setCompositionParams(50, 20)
  const rng = new Rng(spec.seed)
  const players = [...makePlayers(rng, spec.players, spec.population), ...makeArchetypePlayers(rng)]
  const clans = makeClans(rng, players, spec.clans)
  const matches = scheduleSeason(rng, players, clans, SEASON_DAYS)
  return { players, clans, matches }
}

/** day N 시점의 리더보드 — 그날까지의 경기만 재생한다 */
export function snapshotAt(
  day: number,
  players: readonly SimPlayer[],
  matches: readonly SimMatch[],
): LeaderRow[] {
  const cutoff = day * DAY
  const upTo = matches.filter((m) => m.minute <= cutoff)
  const season = replay(upTo, SPEC_PERSONAL, CANDIDATE1_CLAN, { mode: 'none', floor: 3000 }, cutoff, true)
  return personalLeaderboard(season, players, DISPLAY, cutoff, true, 'soft')
}

export function snapshots(spec: ScenarioSpec): Snapshot[] {
  const { players, matches } = buildSeason(spec)
  return SNAPSHOT_DAYS.map((day) => ({ day, rows: snapshotAt(day, players, matches) }))
}

export const BANDS = [4000, 4100, 4300, 4500, 4700, 4800, 4900, 5000] as const

export function bandCounts(rows: readonly LeaderRow[]): Record<number, number> {
  const out: Record<number, number> = {}
  for (const b of BANDS) out[b] = rows.filter((r) => r.displayed >= b).length
  return out
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

export function at(rows: readonly LeaderRow[], rank: number): number {
  return rows[rank - 1]?.displayed ?? 0
}
