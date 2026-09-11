/**
 * ★선수 실력 점수 · 여섯 축★ — 순수 계산 (DB 를 모른다) (2026-09-10 · 사장님 확정)
 *
 * > "이야 이거야 ㅋㅋ 걍 지금이 베스트오브 베스트야 (…) 개인랭킹 이걸로 확정이다 진심
 * >  클랜은 그냥 원래하던대로 가고" — 사용자, 2026-09-10
 *
 * 사장님이 숫자를 보고 고른 값이다. 지어낸 것이 아니다. 근거는 `docs/ORDERS.md` 와
 * 2026-09-10 세션의 반분신뢰도 실측 (라플 n=389 · 여섯 축 0.441 · 승률 0.232).
 *
 * ── 공식
 *   점수 = BASE + SPREAD × (여섯축 × W_HEX + 승률 × W_WR) × 티어계수 × 신뢰 + 클랜보정
 *   여섯축·승률은 «(백분위 − 50) / 50» 로 −1 ~ +1 에 놓는다
 *   여섯축 = 축 백분위의 가중 평균 (`AXIS_WEIGHT`) — 못 잰 축은 분모에서도 뺀다
 *   티어계수 = Σ TIER_WEIGHT[상대 티어] × 판수 / Σ 판수  (상대 티어를 모르면 CH1 값)
 *   신뢰 = 라운드 / (라운드 + SHRINK_K)
 *   클랜보정 = 소속 클랜의 현재 티어로 ASTRA +40 / CH1 0 / CH2 −40
 *
 * ── 모집단
 *   리그 × 무기다. 스나수는 스나수끼리, 라플수는 라플수끼리 백분위와 등수를 낸다.
 *   주무기 = 그 무기 판수가 다른 무기보다 많고 `MIN_WEAPON_GAMES` 이상. 아니면 못 잰다(null).
 *
 * ── 축 무게 (반분신뢰도 실측 2026-09-10)
 *   선짤 0.543 · 캐리력 0.528 · 싸움 0.499 · 연속킬 0.340 · 세이브 0.224 · 소수싸움 0.041
 *   소수싸움은 거의 잡음이라 0.3 만 센다. 빼지는 않는다 — 사장님이 지금 구성으로 확정했다.
 *
 * 부리그가 셋이 아닌 리그(SPL)는 티어계수 1 · 클랜보정 0 이다 — 상대 티어라는 것이 없다.
 * [가정] 사장님이 따로 정하지 않았다. 등수는 리그 안에서만 매기므로 순위에는 영향이 없다.
 */
import { TIER_WEIGHT, type TierNo } from './iplTiers.js'

/** 공식이 바뀌면 올린다. 화면은 이 판으로 접힌 줄만 믿는다 */
export const PLAYER_HEX_FORMULA_VERSION = 'player-hex-v1.0'

export const HEX_BASE = 3000
export const HEX_SPREAD = 700
export const HEX_SHRINK_K = 120
export const HEX_W_HEX = 0.8
export const HEX_W_WR = 0.2
/** 소속 클랜 티어 보정 — ASTRA / CHALLENGER1 / CHALLENGER2 */
export const HEX_CLAN_BONUS: Readonly<Record<TierNo, number>> = { 1: 40, 2: 0, 3: -40 }
/** 주무기로 인정하는 최소 판수 */
export const MIN_WEAPON_GAMES = 10
/** 싸움 축 최소 표본 — 잡음 + 당함 */
export const MIN_DUELS = 20
/** 라운드 축(세이브 · 소수싸움) 최소 표본 — 그 상황을 겪은 라운드 수 (D-194) */
export const MIN_SITUATION_ROUNDS = 10
/** 연속킬 — 앞 킬과 이 초 이내면 연속이다 */
export const BURST_GAP_SECONDS = 2

export const HEX_AXIS_KEYS = ['save', 'duel', 'carry', 'opening', 'burst', 'outnumbered'] as const
export type HexAxisKey = (typeof HEX_AXIS_KEYS)[number]

export const AXIS_WEIGHT: Readonly<Record<HexAxisKey, number>> = {
  opening: 1.0,
  carry: 1.0,
  duel: 1.0,
  burst: 0.7,
  save: 0.5,
  outnumbered: 0.3,
}

/** 한 선수의 재료 — 잡이 리그 안에서 합쳐서 넘긴다 */
export interface PlayerHexInput {
  leaguePlayerId: string
  games: number
  wins: number
  sniperGames: number
  rifleGames: number
  kills: number
  /** 상대 티어별 판수 — 부리그가 셋이 아닌 리그면 전부 0 */
  tierGames: Readonly<Record<TierNo, number>>
  /** 소속 클랜의 현재 티어 — 모르거나 부리그가 셋이 아니면 null */
  clanTier: TierNo | null
  /** 배틀로그 합계 (`MatchPlayerHex` 를 더한 것) */
  rounds: number
  firstKills: number
  burstRounds: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  /** 주무기 기준 싸움 — 스나면 롱 안 스나 대 스나, 라플이면 라플 대 라플 */
  sniperDuelWon: number
  sniperDuelLost: number
  rifleDuelWon: number
  rifleDuelLost: number
}

export interface AxisResult {
  value: number | null
  pct: number | null
  rank: number | null
  total: number | null
}

export interface PlayerHexResult {
  leaguePlayerId: string
  weapon: 0 | 1 | null
  weaponGames: number
  axes: Record<HexAxisKey, AxisResult>
  winRate: AxisResult
  hex: number | null
  tierFactor: number
  shrink: number
  clanBonus: number
  score: number | null
  scoreRank: number | null
  scoreTotal: number | null
  duelWon: number
  duelLost: number
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** 주무기 — 판수가 더 많은 쪽이 `MIN_WEAPON_GAMES` 이상일 때만 */
export function mainWeaponOf(input: { sniperGames: number; rifleGames: number }): 0 | 1 | null {
  if (input.sniperGames > input.rifleGames && input.sniperGames >= MIN_WEAPON_GAMES) return 1
  if (input.rifleGames > input.sniperGames && input.rifleGames >= MIN_WEAPON_GAMES) return 0
  return null
}

/** 축 원값 — 표본이 모자라면 null. 0 으로 채우지 않는다 (D-106) */
export function axisValuesOf(
  input: PlayerHexInput,
  weapon: 0 | 1,
): Record<HexAxisKey, number | null> {
  const duelWon = weapon === 1 ? input.sniperDuelWon : input.rifleDuelWon
  const duelLost = weapon === 1 ? input.sniperDuelLost : input.rifleDuelLost
  const duels = duelWon + duelLost
  return {
    save: input.aloneRounds >= MIN_SITUATION_ROUNDS ? round1((input.aloneWon / input.aloneRounds) * 100) : null,
    duel: duels >= MIN_DUELS ? round1((duelWon / duels) * 100) : null,
    carry: input.games > 0 ? Math.round((input.kills / input.games) * 100) / 100 : null,
    opening: input.rounds > 0 ? round1((input.firstKills / input.rounds) * 100) : null,
    burst: input.rounds > 0 ? round1((input.burstRounds / input.rounds) * 100) : null,
    outnumbered: input.outRounds >= MIN_SITUATION_ROUNDS ? round1((input.outWon / input.outRounds) * 100) : null,
  }
}

/** 백분위 — 나보다 낮은 사람의 비율 × 100. 오름차순 정렬된 배열을 받는다 */
export function percentileOf(sorted: readonly number[], v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || sorted.length === 0) return null
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((sorted[mid] as number) < v) lo = mid + 1
    else hi = mid
  }
  return round1((lo / sorted.length) * 100)
}

/**
 * ★내 구간★ — 가장 많이 뛴 티어 (2026-09-11 사장님).
 *
 * > «클랜 소속에 따라 티어 점수를 받는 게 아니라 자기가 가장 많이 플레이한 구간에 따라
 * >  티어가중치를 받는 거야. 레폭 선수가 클랜 티어는 챌린저지만 본인이 게임을 아스트라에서
 * >  많이 했을 수도 있잖아 (…) 아스트라 티어점수 가중치를 받는 거야, 소속은 챌린저이지만»
 *
 * 판수가 같으면 높은 티어(숫자가 작은 쪽)를 준다. 한 판도 모르면 `null`.
 */
export function homeTierOf(tierGames: Readonly<Record<TierNo, number>>): TierNo | null {
  const tiers: TierNo[] = [1, 2, 3]
  let best: TierNo | null = null
  for (const t of tiers) {
    if (tierGames[t] <= 0) continue
    if (best === null || tierGames[t] > tierGames[best]) best = t
  }
  return best
}

/**
 * ★티어계수★ — 2026-09-11 부터 ★내 구간(가장 많이 뛴 티어) 하나★ 의 무게를 쓴다 (사장님).
 * 용병으로 다른 티어에서 뛴 판도 ★점수에는 그대로 들어간다★ — 구간은 무게와 순위 자리만 정한다.
 *
 * ⚠ 옛 판은 «상대 티어별 판수의 가중 평균» 이었다. `TIER_FACTOR_WEIGHTED = true` 로 되돌린다 (`CLAUDE.md` 1-4).
 */
export const TIER_FACTOR_WEIGHTED = false

export function tierFactorOf(tierGames: Readonly<Record<TierNo, number>>): number {
  const n = tierGames[1] + tierGames[2] + tierGames[3]
  if (n === 0) return 1
  if (!TIER_FACTOR_WEIGHTED) {
    const home = homeTierOf(tierGames)
    return home === null ? 1 : TIER_WEIGHT[home]
  }
  return (
    Math.round(
      ((TIER_WEIGHT[1] * tierGames[1] + TIER_WEIGHT[2] * tierGames[2] + TIER_WEIGHT[3] * tierGames[3]) / n) *
        1000,
    ) / 1000
  )
}

/**
 * 한 리그의 선수들을 받아 무기별 모집단으로 나눠 백분위·등수·점수를 낸다.
 * 주무기가 없는 사람도 돌려준다 — `weapon: null` · 등수 null. 화면이 「측정 중」을 그린다.
 */
export function foldPlayerHex(players: readonly PlayerHexInput[]): PlayerHexResult[] {
  const out: PlayerHexResult[] = []
  for (const weapon of [0, 1] as const) {
    const pool = players.filter((p) => mainWeaponOf(p) === weapon)
    const values = pool.map((p) => ({ p, v: axisValuesOf(p, weapon), wr: p.games > 0 ? (p.wins / p.games) * 100 : null }))
    const dist: Record<HexAxisKey | 'winRate', number[]> = {
      save: [], duel: [], carry: [], opening: [], burst: [], outnumbered: [], winRate: [],
    }
    for (const { v, wr } of values) {
      for (const key of HEX_AXIS_KEYS) if (v[key] !== null) dist[key].push(v[key] as number)
      if (wr !== null) dist.winRate.push(wr)
    }
    for (const key of Object.keys(dist) as (keyof typeof dist)[]) dist[key].sort((a, b) => a - b)

    const rows: PlayerHexResult[] = values.map(({ p, v, wr }) => {
      const axes = {} as Record<HexAxisKey, AxisResult>
      let num = 0
      let den = 0
      for (const key of HEX_AXIS_KEYS) {
        const pct = percentileOf(dist[key], v[key])
        axes[key] = { value: v[key], pct, rank: null, total: null }
        if (pct !== null) {
          num += pct * AXIS_WEIGHT[key]
          den += AXIS_WEIGHT[key]
        }
      }
      const wrPct = percentileOf(dist.winRate, wr)
      const hex = den > 0 ? round1(num / den) : null
      const tierFactor = tierFactorOf(p.tierGames)
      const shrink = Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000
      /* ★소속 클랜의 티어가 아니라 「내 구간」★ (2026-09-11 사장님). 소속만 높은 사람이 덤을 받지 않는다 */
      const homeTier = homeTierOf(p.tierGames) ?? p.clanTier
      const clanBonus = homeTier === null ? 0 : HEX_CLAN_BONUS[homeTier]
      let score: number | null = null
      if (hex !== null) {
        const perf = (hex - 50) / 50
        const wperf = wrPct === null ? perf : (wrPct - 50) / 50
        const mixed = HEX_W_HEX * perf + HEX_W_WR * wperf
        score = Math.round(HEX_BASE + HEX_SPREAD * mixed * tierFactor * shrink + clanBonus)
      }
      return {
        leaguePlayerId: p.leaguePlayerId,
        weapon,
        weaponGames: weapon === 1 ? p.sniperGames : p.rifleGames,
        axes,
        winRate: { value: wr === null ? null : round1(wr), pct: wrPct, rank: null, total: null },
        hex,
        tierFactor,
        shrink,
        clanBonus,
        score,
        scoreRank: null,
        scoreTotal: null,
        duelWon: weapon === 1 ? p.sniperDuelWon : p.rifleDuelWon,
        duelLost: weapon === 1 ? p.sniperDuelLost : p.rifleDuelLost,
      }
    })

    /* 등수 — 점수 · 축마다 · 승률. 같은 값이면 같은 등수(공동)다 */
    rankBy(rows, (r) => r.score, (r, rank, total) => { r.scoreRank = rank; r.scoreTotal = total })
    for (const key of HEX_AXIS_KEYS) {
      rankBy(rows, (r) => r.axes[key].pct, (r, rank, total) => { r.axes[key].rank = rank; r.axes[key].total = total })
    }
    rankBy(rows, (r) => r.winRate.pct, (r, rank, total) => { r.winRate.rank = rank; r.winRate.total = total })
    out.push(...rows)
  }

  for (const p of players) {
    if (mainWeaponOf(p) !== null) continue
    const empty = (): AxisResult => ({ value: null, pct: null, rank: null, total: null })
    out.push({
      leaguePlayerId: p.leaguePlayerId,
      weapon: null,
      weaponGames: Math.max(p.sniperGames, p.rifleGames),
      axes: { save: empty(), duel: empty(), carry: empty(), opening: empty(), burst: empty(), outnumbered: empty() },
      winRate: { value: p.games > 0 ? round1((p.wins / p.games) * 100) : null, pct: null, rank: null, total: null },
      hex: null,
      tierFactor: tierFactorOf(p.tierGames),
      shrink: Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000,
      clanBonus: (() => { const h = homeTierOf(p.tierGames) ?? p.clanTier; return h === null ? 0 : HEX_CLAN_BONUS[h] })(),
      score: null,
      scoreRank: null,
      scoreTotal: null,
      duelWon: 0,
      duelLost: 0,
    })
  }
  return out
}

/** 내림차순 공동 등수. 값이 null 이면 등수도 null 이고 모집단에도 안 든다 */
function rankBy<T>(
  rows: T[],
  valueOf: (row: T) => number | null,
  assign: (row: T, rank: number, total: number) => void,
): void {
  const has = rows.filter((r) => valueOf(r) !== null)
  has.sort((a, b) => (valueOf(b) as number) - (valueOf(a) as number))
  let rank = 0
  let prev: number | null = null
  has.forEach((r, i) => {
    const v = valueOf(r) as number
    if (prev === null || v !== prev) rank = i + 1
    prev = v
    assign(r, rank, has.length)
  })
}
