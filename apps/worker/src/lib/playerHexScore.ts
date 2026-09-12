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
 * ── 모집단 (2026-09-12 사장님이 바꾸심)
 *   싸움(스나싸움/샷싸움) · 승률 · 킬뎃 → ★리그 × 무기★. 스나수는 스나수끼리.
 *   나머지 다섯 축(세이브·캐리력·선짤·연속킬·소수싸움) → ★리그 통합★. 스나·라플을 섞는다.
 *   주무기 = 그 무기 판수가 다른 무기보다 많고 `MIN_WEAPON_GAMES` 이상. 아니면 못 잰다(null).
 *
 *   ⚠ 옛 서술 — «리그 × 무기다. 스나수는 스나수끼리, 라플수는 라플수끼리 백분위와 등수를
 *     낸다.» 2026-09-12 까지는 여섯 축 전부가 그랬다. 옛 함수는 `foldPlayerHexV1` 이다.
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
/**
 * ★판수 무게★ — 라운드가 이만큼이면 점수의 절반을 받는다.
 * 2026-09-12 사장님이 조절판에서 120 → 300 으로 올리셨다.
 * > «지금 판수적은데 상위권인 애들이 너무 많아»
 * 실측 — 상위 30명 중 20판 미만이 여럿이던 것이 1명으로 줄었다.
 */
export const HEX_SHRINK_K = 300
/** ★옛 값★ (2026-09-10 ~ 2026-09-12) */
export const HEX_SHRINK_K_V1 = 120
/**
 * ★여섯 축 : 승률 = 5 대 5★ (2026-09-12 사장님: «5대5로 해줘»).
 *
 * 옛 판은 8 대 2 였다. 그때는 25승 8패(승률 백분위 98.1)인 orczz 가 ★104위★ 였다 —
 * 승률이 점수의 20% 밖에 안 됐기 때문이다. 5 대 5 로 바꾸면 33위가 된다.
 * 상위권(starry · AixIeft · 반짝굴비 · 갑요징어젤)은 네 경우 다 top5 그대로였다.
 *
 * ⚠ 옛 값은 아래에 남긴다 (`CLAUDE.md` 1-4).
 */
export const HEX_W_HEX = 0.19
export const HEX_W_WR = 0.35
/**
 * ★킬뎃 몫★ (2026-09-12 사장님이 조절판에서 고르신 값).
 * 킬뎃은 ★내 구간 + 내 무기★ 것이다 — 화면에 뜨는 킬뎃과 같은 잣대다.
 * 그 구간·무기 판이 10판이 안 되면 구간 전체로, 그것도 모자라면 시즌 전체로 떨어진다.
 * 실측 (872명) — 구간·무기 645명 · 구간 40명 · 전체 187명.
 */
export const HEX_W_KD = 0.46
/** ★옛 판★ — 여섯 축 8 : 승률 2 (2026-09-10 ~ 2026-09-11) · 5 대 5 (2026-09-12 반나절) */
export const HEX_W_HEX_V1 = 0.8
export const HEX_W_WR_V1 = 0.2
export const HEX_W_HEX_V2 = 0.5
export const HEX_W_WR_V2 = 0.5
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

/**
 * ★축 무게★ — 2026-09-12 사장님이 조절판에서 세이브 0.5 → 2.0 · 소수싸움 0.3 → 2.0 으로 올리셨다.
 *
 * ⚠ 그 둘은 ★반분신뢰도가 가장 낮은 축★ 이다 (선짤 0.543 … 소수싸움 0.041).
 *   «같은 선수가 다시 해도 값이 잘 안 맞는» 축이라 원래 무게를 낮춰 뒀었다.
 *   올리면 운이 순위에 더 섞인다 — 사장님께 말씀드리고 그대로 넣었다.
 *
 * 옛 값은 AXIS_WEIGHT_V1 에 남긴다 (CLAUDE.md 1-4).
 */
export const AXIS_WEIGHT: Readonly<Record<HexAxisKey, number>> = {
  opening: 1.0,
  carry: 1.0,
  duel: 1.0,
  burst: 0.7,
  save: 2.0,
  outnumbered: 2.0,
}

/** ★옛 값★ — 반분신뢰도로 정한 무게 (2026-09-10 ~ 2026-09-12) */
export const AXIS_WEIGHT_V1: Readonly<Record<HexAxisKey, number>> = {
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
  /** 상대 티어별 이긴 판 — 승률을 «내 구간» 것으로 낼 때 쓴다 (2026-09-12 사장님) */
  tierWins?: Readonly<Record<TierNo, number>>
  /**
   * ★내 구간 + 내 무기 킬뎃★ (%) — 잡이 미리 골라서 넘긴다 (2026-09-12 사장님).
   * 표본이 모자라 못 고르면 null 이고, 그때는 여섯 축 값으로 대신한다 (지어내지 않는다).
   */
  kdRate?: number | null
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
/**
 * ★점수에 쓰는 승률★ — 「내 구간」 승률이다 (2026-09-12 사장님: «어차피 저 구간의 승률로 계산하는 거잖아»).
 *
 * 선수 머리 카드가 이미 구간 승률(ASTRA 25승 8패)을 크게 띄우고 있었는데
 * ★점수는 전체 승률로 세고 있었다.★ 보여 주는 숫자와 줄 세우는 숫자가 달랐다.
 * 클랜 랭킹에서 같은 어긋남을 고친 것과 같은 이유로 여기도 맞춘다.
 *
 * ⚠ 내 구간 판이 ★10판 미만이면 전체 승률로 떨어진다.★ 3판 2승을 66.7% 로 세면
 *   그 한 판이 순위를 흔든다. 구간을 모르면(단일 리그) 그대로 전체다.
 *
 * ⚠ 옛 판(늘 전체 승률)은 `WIN_RATE_BY_HOME_TIER` 를 `false` 로 두면 돌아온다 (`CLAUDE.md` 1-4).
 */
export const WIN_RATE_BY_HOME_TIER = true
/** 구간 승률을 믿으려면 그 구간에서 최소 몇 판 */
export const MIN_HOME_TIER_GAMES = 10

export function winRateOf(p: {
  games: number
  wins: number
  tierGames: Readonly<Record<TierNo, number>>
  tierWins?: Readonly<Record<TierNo, number>>
}): number | null {
  if (WIN_RATE_BY_HOME_TIER && p.tierWins) {
    const home = homeTierOf(p.tierGames)
    if (home !== null) {
      const g = p.tierGames[home]
      if (g >= MIN_HOME_TIER_GAMES) return (p.tierWins[home] / g) * 100
    }
  }
  return p.games > 0 ? (p.wins / p.games) * 100 : null
}

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
 * ★통합으로 견주는 다섯 축★ — 싸움(duel)만 빼고 전부 (2026-09-12 사장님).
 *
 * > «그 6각형 스나싸움이랑 샷싸움만 라플끼리 스나끼리 비교해서 랭크매기고
 * >  나머지는 전부 다 통합으로 비교분석해»
 *
 * 싸움은 스나면 «롱 안 스나 대 스나», 라플이면 «라플 대 라플» 이라 잣대가 아예 다르다.
 * 나머지 다섯은 무기와 상관없이 같은 뜻의 값이라 스나·라플을 섞어 견준다.
 */
export const HEX_UNIFIED_AXIS_KEYS: readonly HexAxisKey[] = HEX_AXIS_KEYS.filter((k) => k !== 'duel')

/**
 * 한 리그의 선수들을 받아 백분위·등수·점수를 낸다 (2026-09-12 판).
 *
 * ── 모집단이 축마다 다르다
 *   싸움(duel) · 승률 · 킬뎃 → ★리그 × 무기★ (스나수는 스나수끼리)
 *   나머지 다섯 축          → ★리그 통합★ (스나·라플을 섞는다)
 *   점수 등수(`scoreRank`)   → 리그 × 무기 (통합 등수는 화면이 따로 매긴다)
 *
 * 주무기가 없는 사람도 돌려준다 — `weapon: null` · 등수 null. 화면이 「측정 중」을 그린다.
 *
 * ⚠ 여섯 축 백분위가 바뀌므로 ★점수도 조금 움직인다.★ 옛 판은 `foldPlayerHexV1` 이다.
 */
export function foldPlayerHex(players: readonly PlayerHexInput[]): PlayerHexResult[] {
  const out: PlayerHexResult[] = []

  /* ── ① 통합 분포 — 다섯 축은 무기를 안 가린다 ── */
  const uni: Record<HexAxisKey, number[]> = {
    save: [], duel: [], carry: [], opening: [], burst: [], outnumbered: [],
  }
  for (const p of players) {
    const w = mainWeaponOf(p)
    if (w === null) continue
    const v = axisValuesOf(p, w)
    for (const key of HEX_UNIFIED_AXIS_KEYS) if (v[key] !== null) uni[key].push(v[key] as number)
  }
  for (const key of HEX_AXIS_KEYS) uni[key].sort((a, b) => a - b)

  /* ── ② 무기별로 접는다. 싸움·승률·킬뎃만 무기 안에서 견준다 ── */
  const measured: PlayerHexResult[] = []
  for (const weapon of [0, 1] as const) {
    const pool = players.filter((p) => mainWeaponOf(p) === weapon)
    const values = pool.map((p) => ({ p, v: axisValuesOf(p, weapon), wr: p.games > 0 ? (p.wins / p.games) * 100 : null }))
    const dist = { duel: [] as number[], winRate: [] as number[], kd: [] as number[] }
    for (const { p, v, wr } of values) {
      if (v.duel !== null) dist.duel.push(v.duel)
      if (wr !== null) dist.winRate.push(wr)
      if (p.kdRate !== null && p.kdRate !== undefined) dist.kd.push(p.kdRate)
    }
    dist.duel.sort((a, b) => a - b)
    dist.winRate.sort((a, b) => a - b)
    dist.kd.sort((a, b) => a - b)

    const rows: PlayerHexResult[] = values.map(({ p, v, wr }) => {
      const axes = {} as Record<HexAxisKey, AxisResult>
      let num = 0
      let den = 0
      for (const key of HEX_AXIS_KEYS) {
        /* ★싸움만 무기 안에서, 나머지는 통합★ (2026-09-12 사장님) */
        const pct = percentileOf(key === 'duel' ? dist.duel : uni[key], v[key])
        axes[key] = { value: v[key], pct, rank: null, total: null }
        if (pct !== null) {
          num += pct * AXIS_WEIGHT[key]
          den += AXIS_WEIGHT[key]
        }
      }
      const wrPct = percentileOf(dist.winRate, wr)
      /* ★킬뎃 백분위★ — 같은 무기끼리 견준다 (2026-09-12 사장님) */
      const kdPct = percentileOf(dist.kd, p.kdRate ?? null)
      const hex = den > 0 ? round1(num / den) : null
      const tierFactor = tierFactorOf(p.tierGames)
      const shrink = Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000
      /* ★소속 클랜의 티어가 아니라 「내 구간」★ (2026-09-11 사장님) */
      const homeTier = homeTierOf(p.tierGames) ?? p.clanTier
      const clanBonus = homeTier === null ? 0 : HEX_CLAN_BONUS[homeTier]
      let score: number | null = null
      if (hex !== null) {
        const perf = (hex - 50) / 50
        const wperf = wrPct === null ? perf : (wrPct - 50) / 50
        const kperf = kdPct === null ? perf : (kdPct - 50) / 50
        const mixed = HEX_W_HEX * perf + HEX_W_WR * wperf + HEX_W_KD * kperf
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

    /* 무기 안에서 매기는 등수 — 점수 · 싸움 · 승률 */
    rankBy(rows, (r) => r.score, (r, rank, total) => { r.scoreRank = rank; r.scoreTotal = total })
    rankBy(rows, (r) => r.axes.duel.pct, (r, rank, total) => { r.axes.duel.rank = rank; r.axes.duel.total = total })
    rankBy(rows, (r) => r.winRate.pct, (r, rank, total) => { r.winRate.rank = rank; r.winRate.total = total })
    measured.push(...rows)
  }

  /* ── ③ 다섯 축 등수는 ★스나·라플을 섞어서★ 매긴다 ── */
  for (const key of HEX_UNIFIED_AXIS_KEYS) {
    rankBy(measured, (r) => r.axes[key].pct, (r, rank, total) => { r.axes[key].rank = rank; r.axes[key].total = total })
  }
  out.push(...measured)

  /* ── ④ 주무기가 없는 사람 — 못 잰 채로 돌려준다 ── */
  for (const p of players) {
    if (mainWeaponOf(p) !== null) continue
    const empty = (): AxisResult => ({ value: null, pct: null, rank: null, total: null })
    out.push({
      leaguePlayerId: p.leaguePlayerId,
      weapon: null,
      weaponGames: Math.max(p.sniperGames, p.rifleGames),
      axes: { save: empty(), duel: empty(), carry: empty(), opening: empty(), burst: empty(), outnumbered: empty() },
      winRate: { value: (() => { const v = winRateOf(p); return v === null ? null : round1(v) })(), pct: null, rank: null, total: null },
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

/**
 * ★옛 판★ (2026-09-10 ~ 2026-09-12) — 여섯 축을 ★전부★ 무기별 모집단으로 견줬다.
 * 지우지 않는다 (`CLAUDE.md` 1-4). 되돌리려면 `foldPlayerHex` 자리에 이것을 부르면 된다.
 *
 * 한 리그의 선수들을 받아 무기별 모집단으로 나눠 백분위·등수·점수를 낸다.
 * 주무기가 없는 사람도 돌려준다 — `weapon: null` · 등수 null. 화면이 「측정 중」을 그린다.
 */
export function foldPlayerHexV1(players: readonly PlayerHexInput[]): PlayerHexResult[] {
  const out: PlayerHexResult[] = []
  for (const weapon of [0, 1] as const) {
    const pool = players.filter((p) => mainWeaponOf(p) === weapon)
    const values = pool.map((p) => ({ p, v: axisValuesOf(p, weapon), wr: p.games > 0 ? (p.wins / p.games) * 100 : null }))
    const dist: Record<HexAxisKey | 'winRate' | 'kd', number[]> = {
      save: [], duel: [], carry: [], opening: [], burst: [], outnumbered: [], winRate: [], kd: [],
    }
    for (const { p, v, wr } of values) {
      for (const key of HEX_AXIS_KEYS) if (v[key] !== null) dist[key].push(v[key] as number)
      if (wr !== null) dist.winRate.push(wr)
      if (p.kdRate !== null && p.kdRate !== undefined) dist.kd.push(p.kdRate)
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
      /* ★킬뎃 백분위★ — 같은 무기끼리 견준다 (2026-09-12 사장님) */
      const kdPct = percentileOf(dist.kd, p.kdRate ?? null)
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
        const kperf = kdPct === null ? perf : (kdPct - 50) / 50
        const mixed = HEX_W_HEX * perf + HEX_W_WR * wperf + HEX_W_KD * kperf
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
      winRate: { value: (() => { const v = winRateOf(p); return v === null ? null : round1(v) })(), pct: null, rank: null, total: null },
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
