/**
 * 지정 시나리오 — 멸망전 · 팀재편형 열빡 · 구성 매트릭스 · rating 차 매트릭스.
 *
 * 사용자 지시의 핵심 문장을 코드로 옮긴 부분이다.
 *
 *   "같은 상대와 많이 붙는 것은 문제 자체가 아니다.
 *    고정된 팀으로 끝까지 승부하는 멸망전은 가치 있는 경쟁이다."
 *
 * 그래서 **반복 감쇠를 넣지 않은 상태로** 먼저 검증한다.
 */
import { type Rng } from './rng.js'
import { clanUpdate, compositionBonus, expectedScore, type ClanConstants, type PersonalConstants } from './engine.js'
import { buildMatch, type SimMatch } from './match.js'
import type { Role, SimPlayer } from './population.js'
import { replay } from './season.js'

/** 시나리오용 선수 하나 */
function mkPlayer(id: string, skill: number, clanId: string | null, role: Role = 'rifler'): SimPlayer {
  return {
    id,
    name: id,
    latentSkill: skill,
    role,
    clanId,
    targetGames: 0,
    opponentBias: 0,
    activeUntil: 1,
  }
}

/** 클랜 팀 하나 — 본클랜원 `members` 명 + 용병으로 5명을 채운다 */
function mkTeam(clanId: string, members: number, skill: number, prefix: string): SimPlayer[] {
  const team: SimPlayer[] = []
  for (let i = 0; i < members; i += 1) {
    team.push(mkPlayer(`${prefix}M${i}`, skill, clanId))
  }
  for (let i = members; i < 5; i += 1) {
    // 용병 — 원소속이 다르므로 본클랜원으로 세지 않는다
    team.push(mkPlayer(`${prefix}X${i}`, skill, `MERC-${prefix}${i}`))
  }
  return team
}

export interface DeathmatchResult {
  name: string
  games: number
  aMembers: number
  bMembers: number
  aWins: number
  bWins: number
  aRating: number
  bRating: number
  aBonusTotal: number
  bBonusTotal: number
  /** 두 클랜 rating 합의 변화 — 0보다 크면 그만큼 새로 생긴 것이다 */
  ratingCreated: number
  /** 후반 10경기의 평균 |delta| — 수렴했는지 본다 */
  lateAvgAbsDelta: number
}

/**
 * 멸망전 — 같은 두 팀이 계속 붙는다. **감쇠 없음.**
 */
export function runDeathmatch(
  rng: Rng,
  input: {
    name: string
    games: number
    aMembers: number
    bMembers: number
    aSkill: number
    bSkill: number
    clanConstants: ClanConstants
  },
): DeathmatchResult {
  const teamA = mkTeam('CLAN-A', input.aMembers, input.aSkill, 'A')
  const teamB = mkTeam('CLAN-B', input.bMembers, input.bSkill, 'B')

  let aRating = 3000
  let bRating = 3000
  let aWins = 0
  let bWins = 0
  let aBonus = 0
  let bBonus = 0
  const deltas: number[] = []

  for (let i = 0; i < input.games; i += 1) {
    const match = buildMatch(rng, {
      index: i,
      minute: i * 30,
      redPlayers: teamA,
      bluePlayers: teamB,
      redClanId: 'CLAN-A',
      blueClanId: 'CLAN-B',
      tag: input.name,
    })
    const aWon = match.winner === 'red'
    const before = { a: aRating, b: bRating }
    const ra = clanUpdate({
      ratingBefore: before.a,
      opponentRating: before.b,
      won: aWon,
      members: input.aMembers,
      opponentMembers: input.bMembers,
      constants: input.clanConstants,
    })
    const rb = clanUpdate({
      ratingBefore: before.b,
      opponentRating: before.a,
      won: !aWon,
      members: input.bMembers,
      opponentMembers: input.aMembers,
      constants: input.clanConstants,
    })
    aRating = ra.ratingAfter
    bRating = rb.ratingAfter
    aBonus += ra.bonus
    bBonus += rb.bonus
    if (aWon) aWins += 1
    else bWins += 1
    deltas.push(Math.abs(ra.delta))
  }

  const late = deltas.slice(-10)
  return {
    name: input.name,
    games: input.games,
    aMembers: input.aMembers,
    bMembers: input.bMembers,
    aWins,
    bWins,
    aRating,
    bRating,
    aBonusTotal: aBonus,
    bBonusTotal: bBonus,
    ratingCreated: aRating + bRating - 6000,
    lateAvgAbsDelta: late.reduce((a, b) => a + b, 0) / Math.max(1, late.length),
  }
}

/* -------------------------------------------------------------------------- */
/* 팀재편형 (열빡)                                                              */
/* -------------------------------------------------------------------------- */

export interface ReshuffleResult {
  name: string
  games: number
  /** 팀 지속성 0~1 — 직전 경기와 같은 팀 구성이 얼마나 유지되는가 */
  teamContinuity: number
  /** 클랜별 최종 rating */
  clanRatings: { clanId: string; rating: number; games: number; avgMembers: number; bonusTotal: number }[]
  ratingCreated: number
}

/**
 * 같은 10명 풀에서 N경기마다 팀을 섞는다.
 *
 * 선수들의 실제 소속은 여러 클랜에 흩어져 있다 — 열빡의 특징이다.
 * 팀을 섞으면 "그 클랜의 팀"이라는 대표성이 약해지고, 자연히 본클랜원 수가 줄어
 * 구성 보너스가 작아진다. **열빡 탐지 알고리즘 없이** 그 효과가 나오는지 본다.
 */
export function runReshuffle(
  rng: Rng,
  input: {
    name: string
    games: number
    /** 몇 경기마다 팀을 다시 섞는가. 큰 값이면 멸망전에 가깝다 */
    reshuffleEvery: number
    /** 10명이 속한 클랜 id 목록 (중복 가능) */
    clanOfPlayer: readonly (string | null)[]
    skills: readonly number[]
    personalConstants: PersonalConstants
    clanConstants: ClanConstants
  },
): ReshuffleResult {
  const pool = input.clanOfPlayer.map((clanId, i) =>
    mkPlayer(`R${i}`, input.skills[i] ?? 3000, clanId),
  )

  const matches: SimMatch[] = []
  let red = pool.slice(0, 5)
  let blue = pool.slice(5, 10)
  let continuitySum = 0
  let continuityCount = 0

  for (let i = 0; i < input.games; i += 1) {
    if (i > 0 && i % input.reshuffleEvery === 0) {
      const prevRed = new Set(red.map((p) => p.id))
      const mixed = rng.shuffled(pool)
      red = mixed.slice(0, 5)
      blue = mixed.slice(5, 10)
      // 직전 red 팀원이 몇 명이나 같은 팀에 남았는가
      const kept = Math.max(
        red.filter((p) => prevRed.has(p.id)).length,
        blue.filter((p) => prevRed.has(p.id)).length,
      )
      continuitySum += kept / 5
      continuityCount += 1
    } else if (i > 0) {
      continuitySum += 1
      continuityCount += 1
    }

    /* 그 경기에서 "이 팀은 어느 클랜인가" — 가장 많은 소속을 팀 클랜으로 본다.
       동률이면 대표 클랜을 정할 수 없어 클랜 경기로 치지 않는다 (근거 부족) */
    const dominant = (team: SimPlayer[]): string | null => {
      const counts = new Map<string, number>()
      for (const p of team) if (p.clanId) counts.set(p.clanId, (counts.get(p.clanId) ?? 0) + 1)
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
      if (sorted.length === 0) return null
      if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return null
      return sorted[0]![0]
    }

    matches.push(
      buildMatch(rng, {
        index: i,
        minute: i * 30,
        redPlayers: red,
        bluePlayers: blue,
        redClanId: dominant(red),
        blueClanId: dominant(blue),
        tag: input.name,
      }),
    )
  }

  const result = replay(matches, input.personalConstants, input.clanConstants)
  const clanRatings = [...result.clans.entries()].map(([clanId, s]) => ({
    clanId,
    rating: s.rating,
    games: s.games,
    avgMembers: s.games ? s.memberSum / s.games : 0,
    bonusTotal: s.bonusTotal,
  }))
  clanRatings.sort((a, b) => b.rating - a.rating)

  return {
    name: input.name,
    games: input.games,
    teamContinuity: continuityCount ? continuitySum / continuityCount : 1,
    clanRatings,
    ratingCreated: result.clanRatingCreated,
  }
}

/* -------------------------------------------------------------------------- */
/* 구성 매트릭스 (25조합 × 승패)                                                 */
/* -------------------------------------------------------------------------- */

export interface CompositionCase {
  winnerMembers: number
  loserMembers: number
  preWinner: number
  preLoser: number
  expected: number
  baseDelta: number
  bonus: number
  winnerDelta: number
  loserDelta: number
}

/** 1~5 × 1~5 전 조합. 양쪽이 이기는 경우를 모두 만든다 */
export function compositionMatrix(constants: ClanConstants, rating = 3000): CompositionCase[] {
  const cases: CompositionCase[] = []
  for (let a = 1; a <= 5; a += 1) {
    for (let b = 1; b <= 5; b += 1) {
      const winner = clanUpdate({
        ratingBefore: rating,
        opponentRating: rating,
        won: true,
        members: a,
        constants,
      })
      const loser = clanUpdate({
        ratingBefore: rating,
        opponentRating: rating,
        won: false,
        members: b,
        constants,
      })
      cases.push({
        winnerMembers: a,
        loserMembers: b,
        preWinner: rating,
        preLoser: rating,
        expected: winner.expected,
        baseDelta: winner.baseDelta,
        bonus: winner.bonus,
        winnerDelta: winner.delta,
        loserDelta: loser.delta,
      })
    }
  }
  return cases
}

/* -------------------------------------------------------------------------- */
/* rating 차 매트릭스                                                           */
/* -------------------------------------------------------------------------- */

export interface RatingGapCase {
  strong: number
  weak: number
  members: number
  /** 강팀이 이겼을 때 */
  strongWinDelta: number
  strongWinBonus: number
  /** 약팀이 upset 했을 때 */
  weakUpsetDelta: number
  weakUpsetBonus: number
  strongExpected: number
}

export function ratingGapMatrix(constants: ClanConstants): RatingGapCase[] {
  const pairs: [number, number][] = [
    [3000, 3000],
    [3200, 3000],
    [3500, 3000],
    [4000, 3000],
    [4300, 3000],
  ]
  const out: RatingGapCase[] = []
  for (const [strong, weak] of pairs) {
    for (let members = 1; members <= 5; members += 1) {
      const strongWin = clanUpdate({
        ratingBefore: strong,
        opponentRating: weak,
        won: true,
        members,
        constants,
      })
      const weakWin = clanUpdate({
        ratingBefore: weak,
        opponentRating: strong,
        won: true,
        members,
        constants,
      })
      out.push({
        strong,
        weak,
        members,
        strongWinDelta: strongWin.delta,
        strongWinBonus: strongWin.bonus,
        weakUpsetDelta: weakWin.delta,
        weakUpsetBonus: weakWin.bonus,
        strongExpected: expectedScore(strong, weak),
      })
    }
  }
  return out
}

/** 동급전 sanity — §31 표와 정확히 맞는지 */
export function evenMatchTable(constants: ClanConstants): {
  members: number
  win: number
  lose: number
  expectedWin: number
}[] {
  return [1, 2, 3, 4, 5].map((members) => {
    const win = clanUpdate({
      ratingBefore: 3000,
      opponentRating: 3000,
      won: true,
      members,
      constants,
    })
    const lose = clanUpdate({
      ratingBefore: 3000,
      opponentRating: 3000,
      won: false,
      members,
      constants,
    })
    return {
      members,
      win: win.delta,
      lose: lose.delta,
      expectedWin: 30 + compositionBonus(members, constants),
    }
  })
}
