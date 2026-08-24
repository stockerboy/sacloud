/**
 * 3개월 시즌 시뮬레이션 — 경기 생성 → 시각순 replay → 리더보드.
 *
 * replay 는 운영과 같은 원칙이다: `startAt` 오름차순, 결정적, 같은 입력이면 같은 결과.
 */
import { type Rng } from './rng.js'
import {
  BASELINE,
  clanUpdate,
  confidenceFor,
  displayRating,
  personalUpdate,
  type ClanConstants,
  type PersonalConstants,
} from './engine.js'
import { buildMatch, kdRate, performanceScore, type SimMatch, type MatchSlot } from './match.js'
import type { SimClan, SimPlayer } from './population.js'

export interface PlayerState {
  id: string
  internal: number
  games: number
  wins: number
  losses: number
  kill: number
  death: number
  assist: number
  mvpCount: number
  /** 상대 팀 평균 rating 의 누적 — 스케줄 강도 */
  opponentRatingSum: number
  /** 상대 평균이 3200 이상이던 경기 수 */
  strongOpponentGames: number
  /** 기대 승률 40% 미만이었는데 이긴 경기 (upset) */
  upsetWins: number
  /** 기대 승률 60% 초과였는데 진 경기 */
  upsetLosses: number
  performanceSum: number
}

export interface ClanState {
  id: string
  rating: number
  games: number
  wins: number
  losses: number
  memberSum: number
  bonusTotal: number
  baseDeltaTotal: number
  opponentRatingSum: number
}

export interface SeasonResult {
  matches: SimMatch[]
  players: Map<string, PlayerState>
  clans: Map<string, ClanState>
  /** 클랜 rating 총합의 증가분 — 구성 보너스가 만들어 낸 양 */
  clanRatingCreated: number
  personalConstants: PersonalConstants
  clanConstants: ClanConstants
}

function newPlayerState(id: string): PlayerState {
  return {
    id,
    internal: BASELINE,
    games: 0,
    wins: 0,
    losses: 0,
    kill: 0,
    death: 0,
    assist: 0,
    mvpCount: 0,
    opponentRatingSum: 0,
    strongOpponentGames: 0,
    upsetWins: 0,
    upsetLosses: 0,
    performanceSum: 0,
  }
}

function newClanState(id: string): ClanState {
  return {
    id,
    rating: BASELINE,
    games: 0,
    wins: 0,
    losses: 0,
    memberSum: 0,
    bonusTotal: 0,
    baseDeltaTotal: 0,
    opponentRatingSum: 0,
  }
}

/**
 * 경기 목록을 시각순으로 재생한다.
 *
 * **모든 정상 5v5 에 점수를 준다.** official/unofficial 게이트는 없다 (사용자 지시 4장).
 */
export function replay(
  matches: readonly SimMatch[],
  personalConstants: PersonalConstants,
  clanConstants: ClanConstants,
): Omit<SeasonResult, 'matches'> {
  const players = new Map<string, PlayerState>()
  const clans = new Map<string, ClanState>()
  const ordered = [...matches].sort((a, b) => a.minute - b.minute || a.index - b.index)

  let clanRatingCreated = 0

  const stateOf = (id: string): PlayerState => {
    let s = players.get(id)
    if (!s) {
      s = newPlayerState(id)
      players.set(id, s)
    }
    return s
  }
  const clanStateOf = (id: string): ClanState => {
    let s = clans.get(id)
    if (!s) {
      s = newClanState(id)
      clans.set(id, s)
    }
    return s
  }

  for (const match of ordered) {
    const all = [...match.red, ...match.blue]

    /* --- 개인 --- */
    const avgOf = (slots: readonly MatchSlot[]): number =>
      slots.reduce((sum, s) => sum + stateOf(s.playerId).internal, 0) / slots.length

    const redAvg = avgOf(match.red)
    const blueAvg = avgOf(match.blue)

    const applySide = (slots: readonly MatchSlot[], won: boolean, opponentAvg: number): void => {
      for (const slot of slots) {
        const state = stateOf(slot.playerId)
        const performance = performanceScore(slot, all)
        const result = personalUpdate({
          ratingBefore: state.internal,
          opponentAvgRating: opponentAvg,
          won,
          performance,
          gamesBefore: state.games,
          constants: personalConstants,
        })
        state.internal = result.ratingAfter
        state.games += 1
        if (won) state.wins += 1
        else state.losses += 1
        state.kill += slot.kill
        state.death += slot.death
        state.assist += slot.assist
        if (slot.mvp) state.mvpCount += 1
        state.opponentRatingSum += opponentAvg
        if (opponentAvg >= 3200) state.strongOpponentGames += 1
        if (won && result.expected < 0.4) state.upsetWins += 1
        if (!won && result.expected > 0.6) state.upsetLosses += 1
        state.performanceSum += performance
      }
    }

    applySide(match.red, match.winner === 'red', blueAvg)
    applySide(match.blue, match.winner === 'blue', redAvg)

    /* --- 클랜 --- */
    if (match.redClanId && match.blueClanId && match.redClanId !== match.blueClanId) {
      const red = clanStateOf(match.redClanId)
      const blue = clanStateOf(match.blueClanId)
      const redMembers = match.red.filter((s) => s.isMember).length
      const blueMembers = match.blue.filter((s) => s.isMember).length
      const redBefore = red.rating
      const blueBefore = blue.rating

      const redResult = clanUpdate({
        ratingBefore: redBefore,
        opponentRating: blueBefore,
        won: match.winner === 'red',
        members: redMembers,
        opponentMembers: blueMembers,
        constants: clanConstants,
      })
      const blueResult = clanUpdate({
        ratingBefore: blueBefore,
        opponentRating: redBefore,
        won: match.winner === 'blue',
        members: blueMembers,
        opponentMembers: redMembers,
        constants: clanConstants,
      })

      red.rating = redResult.ratingAfter
      blue.rating = blueResult.ratingAfter
      clanRatingCreated += redResult.bonus + blueResult.bonus

      for (const [state, result, members, opponentBefore, won] of [
        [red, redResult, redMembers, blueBefore, match.winner === 'red'],
        [blue, blueResult, blueMembers, redBefore, match.winner === 'blue'],
      ] as const) {
        state.games += 1
        if (won) state.wins += 1
        else state.losses += 1
        state.memberSum += members
        state.bonusTotal += result.bonus
        state.baseDeltaTotal += result.baseDelta
        state.opponentRatingSum += opponentBefore
      }
    }
  }

  return { players, clans, clanRatingCreated, personalConstants, clanConstants }
}

/* -------------------------------------------------------------------------- */
/* 경기 편성                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 시즌 경기 편성 — **선수 중심**으로 짠다.
 *
 * 클랜만 보고 짜면 두 가지가 무너진다(실제로 처음에 그렇게 짰다가 걸렸다).
 *   1. `targetGames` 가 무시된다 — 1000판 선수와 40판 선수가 똑같이 350판을 뛴다
 *   2. `opponentBias` 가 죽는다 — 모두의 평균 상대가 3014로 똑같아진다
 * 그러면 "판수 박치기"도 "강자 일정"도 검증할 수 없다. 그래서 이렇게 바꿨다.
 *
 *   남은 판수가 있는 선수를 뽑는다
 *     → 그 선수의 홈 클랜을 정한다 (무소속이면 용병으로 아무 클랜에 낀다)
 *     → 그 선수의 성향(bias)에 맞는 **상대 클랜 강도**를 고른다
 *     → 양 팀을 남은 판수가 있는 선수로 채운다
 *
 * 이러면 상대 강도와 판수가 선수마다 실제로 달라진다.
 */
export function scheduleSeason(
  rng: Rng,
  players: readonly SimPlayer[],
  clans: readonly SimClan[],
  seasonDays: number,
): SimMatch[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  const clanById = new Map(clans.map((c) => [c.id, c]))
  const matches: SimMatch[] = []
  const minutesTotal = seasonDays * 24 * 60

  /** 남은 목표 판수 — 0이 되면 더 뛰지 않는다 */
  const need = new Map(players.map((p) => [p.id, p.targetGames]))
  const remainingOf = (id: string): number => need.get(id) ?? 0
  const available = (): SimPlayer[] => players.filter((p) => remainingOf(p.id) > 0)

  /** 남은 판수가 많을수록 자주 뽑힌다 (전원이 목표에 수렴하게) */
  const pickSeed = (pool: readonly SimPlayer[]): SimPlayer => {
    const total = pool.reduce((sum, p) => sum + remainingOf(p.id), 0)
    let roll = rng.float(0, total)
    for (const p of pool) {
      roll -= remainingOf(p.id)
      if (roll <= 0) return p
    }
    return pool[pool.length - 1]!
  }

  /** 성향 → 원하는 상대 강도. +1이면 강자, -1이면 약자 */
  const desiredOpponentStrength = (bias: number): number => 3000 + bias * 320

  /**
   * 팀을 채운다. 본클랜원 `wantMembers` 명을 먼저, 나머지는 용병.
   * **남은 판수가 있는 선수만** 쓴다 — 목표를 넘겨서 뛰게 하지 않는다.
   */
  const fillTeam = (clan: SimClan, wantMembers: number, exclude: Set<string>): SimPlayer[] => {
    const lineup: SimPlayer[] = []
    const members = rng
      .shuffled(clan.memberIds)
      .map((id) => byId.get(id))
      .filter((p): p is SimPlayer => !!p && remainingOf(p.id) > 0 && !exclude.has(p.id))
    for (const m of members) {
      if (lineup.length >= wantMembers) break
      lineup.push(m)
      exclude.add(m.id)
    }
    if (lineup.length < 5) {
      /* 용병도 **비슷한 수준**으로 데려온다. 아무나 채우면 팀 실력이 전원 평균으로 수렴해
         상대 강도 차이가 사라진다 */
      const mercs = players
        .filter((p) => remainingOf(p.id) > 0 && !exclude.has(p.id) && p.clanId !== clan.id)
        .map((p) => ({ p, gap: Math.abs(p.latentSkill - clan.latentStrength) + Math.abs(rng.normal(0, 90)) }))
        .sort((a, b) => a.gap - b.gap)
      for (const { p: merc } of mercs) {
        if (lineup.length >= 5) break
        lineup.push(merc)
        exclude.add(merc.id)
      }
    }
    return lineup
  }

  let index = 0
  let guard = 0
  const maxMatches = players.reduce((sum, p) => sum + p.targetGames, 0)

  while (guard < maxMatches * 3) {
    guard += 1
    const pool = available()
    if (pool.length < 10) break

    const seed = pickSeed(pool)
    const homeClan = seed.clanId ? clanById.get(seed.clanId) : null
    const home = homeClan ?? rng.pick(clans)

    /* 상대 클랜은 seed 선수의 성향이 원하는 강도에 가까운 곳으로 */
    const want = desiredOpponentStrength(seed.opponentBias)
    const candidates = clans.filter((c) => c.id !== home.id)
    if (candidates.length === 0) break
    const scored = candidates.map((c) => ({
      clan: c,
      // 원하는 강도와의 거리 + 약간의 잡음 (같은 상대만 만나지 않게)
      score: -Math.abs(c.latentStrength - want) + rng.normal(0, 90),
    }))
    scored.sort((a, b) => b.score - a.score)
    const away = scored[0]!.clan

    const used = new Set<string>()
    // seed 선수는 반드시 홈 팀에 넣는다
    used.add(seed.id)
    const homeMembers = Math.max(1, Math.min(5, Math.round(home.avgMembers + rng.normal(0, 0.6))))
    const awayMembers = Math.max(1, Math.min(5, Math.round(away.avgMembers + rng.normal(0, 0.6))))

    const redRest = fillTeam(home, homeMembers, used)
    const red = [seed, ...redRest].slice(0, 5)
    const blue = fillTeam(away, awayMembers, used)
    if (red.length < 5 || blue.length < 5) break

    matches.push(
      buildMatch(rng, {
        index,
        minute: rng.int(0, minutesTotal),
        redPlayers: red,
        bluePlayers: blue,
        redClanId: home.id,
        blueClanId: away.id,
        tag: 'season',
      }),
    )
    for (const p of [...red, ...blue]) need.set(p.id, remainingOf(p.id) - 1)
    index += 1
  }

  return matches
}

/** 리더보드 한 줄 */
export interface LeaderRow {
  rank: number
  playerId: string
  name: string
  archetype: string
  role: string
  games: number
  wins: number
  losses: number
  winRate: number
  kd: number
  mvpCount: number
  mvpRate: number
  avgOpponentRating: number
  strongOpponentGames: number
  upsetWins: number
  internal: number
  confidence: number
  displayed: number
  latentSkill: number
}

export function personalLeaderboard(
  season: Omit<SeasonResult, 'matches'>,
  players: readonly SimPlayer[],
): LeaderRow[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  const rows: LeaderRow[] = []
  for (const [id, state] of season.players) {
    const player = byId.get(id)
    if (!player || state.games === 0) continue
    const confidence = confidenceFor(state.games)
    rows.push({
      rank: 0,
      playerId: id,
      name: player.name,
      archetype: player.archetype ?? '-',
      role: player.role,
      games: state.games,
      wins: state.wins,
      losses: state.losses,
      winRate: (state.wins / state.games) * 100,
      kd: kdRate(state.kill, state.death),
      mvpCount: state.mvpCount,
      mvpRate: (state.mvpCount / state.games) * 100,
      avgOpponentRating: state.opponentRatingSum / state.games,
      strongOpponentGames: state.strongOpponentGames,
      upsetWins: state.upsetWins,
      internal: state.internal,
      confidence,
      displayed: displayRating(state.internal, state.games, season.personalConstants.confidenceMode),
      latentSkill: player.latentSkill,
    })
  }
  rows.sort((a, b) => b.displayed - a.displayed)
  rows.forEach((row, i) => {
    row.rank = i + 1
  })
  return rows
}

export interface ClanLeaderRow {
  rank: number
  clanId: string
  name: string
  games: number
  wins: number
  losses: number
  winRate: number
  avgMembers: number
  bonusTotal: number
  baseDeltaTotal: number
  avgOpponentRating: number
  rating: number
  latentStrength: number
}

export function clanLeaderboard(
  season: Omit<SeasonResult, 'matches'>,
  clans: readonly SimClan[],
): ClanLeaderRow[] {
  const byId = new Map(clans.map((c) => [c.id, c]))
  const rows: ClanLeaderRow[] = []
  for (const [id, state] of season.clans) {
    const clan = byId.get(id)
    if (!clan || state.games === 0) continue
    rows.push({
      rank: 0,
      clanId: id,
      name: clan.name,
      games: state.games,
      wins: state.wins,
      losses: state.losses,
      winRate: (state.wins / state.games) * 100,
      avgMembers: state.memberSum / state.games,
      bonusTotal: state.bonusTotal,
      baseDeltaTotal: state.baseDeltaTotal,
      avgOpponentRating: state.opponentRatingSum / state.games,
      rating: state.rating,
      latentStrength: clan.latentStrength,
    })
  }
  rows.sort((a, b) => b.rating - a.rating)
  rows.forEach((row, i) => {
    row.rank = i + 1
  })
  return rows
}
