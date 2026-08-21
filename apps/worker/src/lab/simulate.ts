/**
 * 래더 시뮬레이터 — Phase 9 조사용 sandbox (운영 코드 아님).
 *
 * ⚠️ DB를 읽지도 쓰지도 않는다. 전부 **합성 데이터**이고 난수는 seed로 고정한다.
 *    같은 seed면 항상 같은 결과가 나온다 (`packages/mock`의 결정적 생성과 같은 규칙).
 *
 * 왜 합성 데이터인가
 *   재구성된 실제 경기는 **현재 0건**이다(로스터가 비어 있다 — Phase 8.2 F-2장).
 *   mock 시드의 3,000경기는 래더 값까지 가짜라(`formulaVersion="mock-fixture"`)
 *   공식 비교의 입력으로 쓸 수 없다. 그래서 **숨은 실력값을 가진 합성 모집단**을 만들고,
 *   "래더가 그 실력을 얼마나 맞히는가"로 후보를 비교한다.
 *
 * 여기서 재는 것
 *   1. 분포 — 최종 래더의 평균·폭이 관측(개인 1위 3,432 / 클랜 1위 1,840)과 비슷한가
 *   2. 정확도 — 숨은 실력 순위와 래더 순위가 얼마나 일치하는가 (스피어만)
 *   3. 인플레이션 — 점수 총합이 계속 늘거나 줄지 않는가
 *   4. 악용 — 양학·라인업 조작·반복 대전에서 이상현상이 나오는가
 */
import {
  CROSS_DIVISION_DAMPING,
  DIV1_PARAMS,
  DIV2_PARAMS,
  paramsForMatch,
  ratingUpdate,
  type CrossMode,
} from './ladder.js'
import { nextClanRating, type ClanLadderCandidate } from './clanLadder.js'

/* ------------------------------------------------------------------ 난수 --- */

/** mulberry32 — 짧고 결정적이다. 암호용이 아니다 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 상자-뮬러 — 실력 분포를 정규분포로 만든다 */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/* ------------------------------------------------------------------ 모형 --- */

export interface SimPlayer {
  id: string
  clanId: string
  /** 숨은 실력. 래더가 맞히려는 값이다. 시뮬레이터 밖에서는 알 수 없다 */
  skill: number
  rating: number
  matches: number
  wins: number
  losses: number
  /** 배치고사 중인가 */
  placement: boolean
  lastMatchIndex: number
}

export interface SimClan {
  id: string
  division: number
  rating: number
  memberIds: string[]
  matches: number
  wins: number
  losses: number
}

export type LineupPolicy = 'random' | 'weakest' | 'strongest'
export type PairingPolicy = 'random' | 'fixed-pair' | 'farm-weakest' | 'ladder-close'

export interface SimConfig {
  seed: number
  clans: number
  playersPerClan: number
  /** 한 경기에 나가는 인원 */
  squadSize: number
  matches: number
  /** 이 경기 수까지는 배치고사 — 증감 0 (스펙 §1) */
  placementMatches: number
  initialRating: number
  crossMode: CrossMode
  clanCandidate: ClanLadderCandidate
  lineup: LineupPolicy
  pairing: PairingPolicy
  /** 절반을 div2로 둔다 (교차 division 보정을 보려면 필요) */
  twoDivisions: boolean
  /** 실력 표준편차 */
  skillSpread: number
  /** 승패 결정 시 실력차 스케일 */
  skillScale: number
  rosterTopN: number
}

export const DEFAULT_SIM: SimConfig = {
  seed: 20260822,
  clans: 40,
  playersPerClan: 8,
  squadSize: 5,
  matches: 4000,
  placementMatches: 10,
  initialRating: 1500,
  crossMode: 'k',
  clanCandidate: 'team-elo',
  lineup: 'random',
  pairing: 'random',
  twoDivisions: true,
  skillSpread: 350,
  skillScale: 400,
  rosterTopN: 5,
}

export interface SimResult {
  config: SimConfig
  players: SimPlayer[]
  clans: SimClan[]
  /** 증감값별 등장 횟수 — +11 · +19가 나오는지 여기서 본다 */
  winDeltas: Map<number, number>
  loseDeltas: Map<number, number>
  matchesPlayed: number
}

function bump(map: Map<number, number>, key: number): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function pickSquad(
  clan: SimClan,
  players: Map<string, SimPlayer>,
  size: number,
  policy: LineupPolicy,
  rng: () => number,
): SimPlayer[] {
  const members = clan.memberIds
    .map((id) => players.get(id))
    .filter((player): player is SimPlayer => player !== undefined)

  if (policy === 'weakest') {
    return [...members].sort((left, right) => left.rating - right.rating).slice(0, size)
  }
  if (policy === 'strongest') {
    return [...members].sort((left, right) => right.rating - left.rating).slice(0, size)
  }
  const shuffled = [...members]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!]
  }
  return shuffled.slice(0, size)
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function pickOpponents(
  clans: SimClan[],
  policy: PairingPolicy,
  rng: () => number,
): [SimClan, SimClan] | null {
  if (clans.length < 2) return null

  if (policy === 'fixed-pair') return [clans[0]!, clans[1]!]

  if (policy === 'farm-weakest') {
    // 가장 센 클랜이 가장 약한 클랜만 계속 상대한다 (양학)
    const sorted = [...clans].sort((left, right) => right.rating - left.rating)
    return [sorted[0]!, sorted[sorted.length - 1]!]
  }

  const first = clans[Math.floor(rng() * clans.length)]!
  if (policy === 'ladder-close') {
    // 래더가 가까운 상대를 고른다 (정상 매칭에 가까운 상황)
    const others = clans
      .filter((clan) => clan.id !== first.id)
      .sort(
        (left, right) =>
          Math.abs(left.rating - first.rating) - Math.abs(right.rating - first.rating),
      )
      .slice(0, 5)
    return [first, others[Math.floor(rng() * others.length)]!]
  }

  let second = first
  while (second.id === first.id) second = clans[Math.floor(rng() * clans.length)]!
  return [first, second]
}

/** 실력차로 승패를 정한다. 래더는 결과에 영향을 주지 않는다 (그래야 공식을 평가할 수 있다) */
function winProbability(skillA: number, skillB: number, scale: number): number {
  return 1 / (1 + 10 ** ((skillB - skillA) / scale))
}

export function simulate(overrides: Partial<SimConfig> = {}): SimResult {
  const config: SimConfig = { ...DEFAULT_SIM, ...overrides }
  const rng = createRng(config.seed)

  const players = new Map<string, SimPlayer>()
  const clans: SimClan[] = []

  for (let clanIndex = 0; clanIndex < config.clans; clanIndex += 1) {
    const clanId = `C${clanIndex}`
    const memberIds: string[] = []
    // 클랜마다 평균 실력이 다르다 (강팀·약팀이 실제로 존재하는 상황)
    const clanSkill = gaussian(rng) * config.skillSpread
    for (let memberIndex = 0; memberIndex < config.playersPerClan; memberIndex += 1) {
      const id = `${clanId}-P${memberIndex}`
      memberIds.push(id)
      players.set(id, {
        id,
        clanId,
        skill: clanSkill + gaussian(rng) * (config.skillSpread / 2),
        rating: config.initialRating,
        matches: 0,
        wins: 0,
        losses: 0,
        placement: true,
        lastMatchIndex: -1,
      })
    }
    clans.push({
      id: clanId,
      division: config.twoDivisions && clanIndex % 2 === 1 ? 2 : 1,
      rating: config.initialRating,
      memberIds,
      matches: 0,
      wins: 0,
      losses: 0,
    })
  }

  const winDeltas = new Map<number, number>()
  const loseDeltas = new Map<number, number>()
  let matchesPlayed = 0

  for (let matchIndex = 0; matchIndex < config.matches; matchIndex += 1) {
    const pair = pickOpponents(clans, config.pairing, rng)
    if (!pair) break
    const [home, away] = pair
    if (home.id === away.id) continue

    const homeSquad = pickSquad(home, players, config.squadSize, config.lineup, rng)
    const awaySquad = pickSquad(away, players, config.squadSize, 'random', rng)
    if (homeSquad.length < config.squadSize || awaySquad.length < config.squadSize) continue

    const homeWins =
      rng() <
      winProbability(
        mean(homeSquad.map((player) => player.skill)),
        mean(awaySquad.map((player) => player.skill)),
        config.skillScale,
      )

    const homeAvg = mean(homeSquad.map((player) => player.rating))
    const awayAvg = mean(awaySquad.map((player) => player.rating))

    const applySide = (
      squad: SimPlayer[],
      clan: SimClan,
      opponentClan: SimClan,
      opponentAvg: number,
      isWin: boolean,
    ): number[] => {
      const updates: number[] = []
      for (const player of squad) {
        const { params, crossDamping } = paramsForMatch({
          playerDivision: clan.division,
          opponentDivision: opponentClan.division,
          div1: DIV1_PARAMS,
          div2: DIV2_PARAMS,
          damping: CROSS_DIVISION_DAMPING,
        })
        const isPlacement = player.matches < config.placementMatches
        const result = ratingUpdate({
          ratingBefore: player.rating,
          opponentAvgRating: opponentAvg,
          isWin,
          isPlacement,
          crossDamping,
          params,
          crossMode: config.crossMode,
        })

        player.rating += result.ratingUpdate
        player.matches += 1
        player.lastMatchIndex = matchIndex
        player.placement = player.matches < config.placementMatches
        if (isWin) player.wins += 1
        else player.losses += 1

        if (!isPlacement) {
          updates.push(result.ratingUpdate)
          if (isWin) bump(winDeltas, result.ratingUpdate)
          else bump(loseDeltas, result.ratingUpdate)
        }
      }
      return updates
    }

    const homeUpdates = applySide(homeSquad, home, away, awayAvg, homeWins)
    const awayUpdates = applySide(awaySquad, away, home, homeAvg, !homeWins)

    const clanUpdate = (
      clan: SimClan,
      opponentClan: SimClan,
      updates: number[],
      isWin: boolean,
    ): void => {
      const { params, crossDamping } = paramsForMatch({
        playerDivision: clan.division,
        opponentDivision: opponentClan.division,
        div1: DIV1_PARAMS,
        div2: DIV2_PARAMS,
        damping: CROSS_DIVISION_DAMPING,
      })
      clan.rating = nextClanRating(config.clanCandidate, {
        clanRating: clan.rating,
        opponentClanRating: opponentClan.rating,
        isWin,
        isPlacement: clan.matches < config.placementMatches,
        crossDamping,
        params,
        crossMode: config.crossMode,
        memberUpdates: updates,
        rosterRatings: clan.memberIds
          .map((id) => players.get(id)?.rating ?? config.initialRating)
          .filter((value) => Number.isFinite(value)),
        rosterTopN: config.rosterTopN,
      })
      clan.matches += 1
      if (isWin) clan.wins += 1
      else clan.losses += 1
    }

    clanUpdate(home, away, homeUpdates, homeWins)
    clanUpdate(away, home, awayUpdates, !homeWins)
    matchesPlayed += 1
  }

  return {
    config,
    players: [...players.values()],
    clans,
    winDeltas,
    loseDeltas,
    matchesPlayed,
  }
}

/* ------------------------------------------------------------------ 지표 --- */

export interface Distribution {
  count: number
  mean: number
  stdev: number
  min: number
  max: number
  p10: number
  p90: number
}

export function describe(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { count: 0, mean: 0, stdev: 0, min: 0, max: 0, p10: 0, p90: 0 }
  }
  const sorted = [...values].sort((left, right) => left - right)
  const average = mean(sorted)
  const variance = mean(sorted.map((value) => (value - average) ** 2))
  const at = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]!
  return {
    count: sorted.length,
    mean: average,
    stdev: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p10: at(0.1),
    p90: at(0.9),
  }
}

function rank(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((left, right) => left.value - right.value)
  const ranks = new Array<number>(values.length).fill(0)
  indexed.forEach((entry, position) => {
    ranks[entry.index] = position + 1
  })
  return ranks
}

/** 스피어만 순위상관 — 1에 가까울수록 래더가 실력 순서를 잘 맞힌 것이다 */
export function spearman(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length < 2) return 0
  const rankLeft = rank(left)
  const rankRight = rank(right)
  const n = left.length
  const sumSquares = rankLeft.reduce(
    (total, value, index) => total + (value - rankRight[index]!) ** 2,
    0,
  )
  return 1 - (6 * sumSquares) / (n * (n ** 2 - 1))
}

export interface SimMetrics {
  ratings: Distribution
  /** 숨은 실력 ↔ 래더 순위 일치도 */
  skillCorrelation: number
  /** 점수 총합 변화 (0에 가까울수록 인플레이션이 없다) */
  inflation: number
  clanRatings: Distribution
  /** 승리 증감에서 실제로 나온 정수들 */
  winDeltaValues: number[]
  loseDeltaValues: number[]
  matchesPlayed: number
}

export function metrics(result: SimResult): SimMetrics {
  const active = result.players.filter((player) => player.matches > result.config.placementMatches)
  const ratings = active.map((player) => player.rating)
  const skills = active.map((player) => player.skill)

  return {
    ratings: describe(ratings),
    skillCorrelation: spearman(skills, ratings),
    inflation:
      result.players.reduce((total, player) => total + player.rating, 0) -
      result.players.length * result.config.initialRating,
    clanRatings: describe(result.clans.map((clan) => clan.rating)),
    winDeltaValues: [...result.winDeltas.keys()].sort((left, right) => left - right),
    loseDeltaValues: [...result.loseDeltas.keys()].sort((left, right) => left - right),
    matchesPlayed: result.matchesPlayed,
  }
}
