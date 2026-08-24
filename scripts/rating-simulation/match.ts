/**
 * 경기 생성 — **경기 단위**로 만든다.
 *
 * 최종 승률/KD 숫자를 난수로 뽑아 공식에 넣으면 그건 공식 검증이 아니라
 * 내가 정한 답을 확인하는 것이다. 그래서
 *   10명 매칭 → 팀 구성 → hidden skill 로 승패 → 킬/데스/MVP
 * 까지 만들고, 그 결과만 rating 엔진에 넘긴다.
 */
import type { Rng } from './rng.js'
import type { Role, SimPlayer } from './population.js'

export interface MatchSlot {
  playerId: string
  /** 이 경기에서 **뛴 팀**의 클랜 (용병이면 자기 클랜과 다르다) */
  sideClanId: string | null
  /** 경기 당시 **원소속** 클랜 */
  rosterClanId: string | null
  /** 뛴 팀 == 원소속 이면 본클랜원 */
  isMember: boolean
  kill: number
  death: number
  assist: number
  mvp: boolean
}

export interface SimMatch {
  index: number
  /** 시즌 시작으로부터의 분. replay 를 시각순으로 하기 위한 것 */
  minute: number
  redClanId: string | null
  blueClanId: string | null
  red: MatchSlot[]
  blue: MatchSlot[]
  winner: 'red' | 'blue'
  /** 이 경기가 어느 시나리오에서 나왔는지 (진단용) */
  tag: string
}

/** 팀 실력 = 참가자 hidden skill 평균 */
export function teamSkill(players: readonly SimPlayer[]): number {
  if (players.length === 0) return 3000
  return players.reduce((sum, p) => sum + p.latentSkill, 0) / players.length
}

/** 실력차 → 승률. Elo 와 같은 로지스틱을 쓴다 */
export function winProbability(skillA: number, skillB: number): number {
  return 1 / (1 + 10 ** ((skillB - skillA) / 400))
}

/**
 * 역할별 킬 성향.
 *
 * **스나이퍼에게 일부러 유리하게 준다.** 그래야 "같은 실력인데 포지션만으로
 * 순위가 올라가는가"를 검사할 수 있다. 이 값이 편향의 원인이 아니라 **검사 도구**다.
 */
const ROLE_PROFILE: Record<Role, { killMul: number; deathMul: number; assistMul: number; mvpMul: number }> = {
  sniper: { killMul: 1.22, deathMul: 0.88, assistMul: 0.6, mvpMul: 1.35 },
  rifler: { killMul: 1.0, deathMul: 1.0, assistMul: 1.0, mvpMul: 1.0 },
  support: { killMul: 0.78, deathMul: 1.08, assistMul: 1.8, mvpMul: 0.6 },
}

/**
 * 한 경기의 개인 성적.
 *
 * 실력이 높을수록 킬이 많고 데스가 적다. 이긴 팀이 유리하다.
 * 분산을 크게 둬서 "한 경기 KD"로 실력을 단정할 수 없게 한다 — 실제가 그렇다.
 */
function rollStats(
  rng: Rng,
  player: SimPlayer,
  won: boolean,
  opponentSkill: number,
): { kill: number; death: number; assist: number } {
  const profile = ROLE_PROFILE[player.role]
  // 실력 우위 1스탠다드(=200점)당 킬이 약 2 늘어난다
  const edge = (player.latentSkill - opponentSkill) / 200
  const baseKill = 9 + edge * 2 + (won ? 1.6 : -1.6) + rng.normal(0, 2.6)
  const baseDeath = 9 - edge * 1.4 + (won ? -1.6 : 1.6) + rng.normal(0, 2.2)
  return {
    kill: Math.max(0, Math.round(baseKill * profile.killMul)),
    death: Math.max(1, Math.round(baseDeath * profile.deathMul)),
    assist: Math.max(0, Math.round((2.5 + rng.normal(0, 1.4)) * profile.assistMul)),
  }
}

/** 킬뎃 % — 원본 정의: 킬 / (킬 + 데스) × 100 */
export function kdRate(kill: number, death: number): number {
  const total = kill + death
  return total === 0 ? 0 : (kill / total) * 100
}

/**
 * MVP — 이긴 팀에서 킬 기여가 가장 큰 사람.
 * 역할 가중치를 곱해서 스나이퍼가 구조적으로 더 자주 받게 한다 (편향 검사용).
 */
function pickMvp(rng: Rng, slots: MatchSlot[], playersById: Map<string, SimPlayer>): void {
  let best: MatchSlot | null = null
  let bestScore = -Infinity
  for (const slot of slots) {
    const player = playersById.get(slot.playerId)!
    const score =
      (slot.kill * 2 - slot.death + slot.assist * 0.5) * ROLE_PROFILE[player.role].mvpMul +
      rng.normal(0, 1.5)
    if (score > bestScore) {
      bestScore = score
      best = slot
    }
  }
  if (best) best.mvp = true
}

export interface BuildMatchInput {
  index: number
  minute: number
  redPlayers: readonly SimPlayer[]
  bluePlayers: readonly SimPlayer[]
  redClanId: string | null
  blueClanId: string | null
  tag: string
  /** 승패를 미리 정해야 하는 시나리오(연전 고정 등)에서만 쓴다 */
  forcedWinner?: 'red' | 'blue'
}

export function buildMatch(rng: Rng, input: BuildMatchInput): SimMatch {
  const redSkill = teamSkill(input.redPlayers)
  const blueSkill = teamSkill(input.bluePlayers)
  const pRed = winProbability(redSkill, blueSkill)
  const winner = input.forcedWinner ?? (rng.chance(pRed) ? 'red' : 'blue')

  const playersById = new Map<string, SimPlayer>()
  for (const p of [...input.redPlayers, ...input.bluePlayers]) playersById.set(p.id, p)

  const toSlots = (
    players: readonly SimPlayer[],
    sideClanId: string | null,
    won: boolean,
    opponentSkill: number,
  ): MatchSlot[] =>
    players.map((player) => {
      const stats = rollStats(rng, player, won, opponentSkill)
      return {
        playerId: player.id,
        sideClanId,
        rosterClanId: player.clanId,
        // 뛴 팀의 클랜과 원소속이 같아야 본클랜원이다 (용병은 아니다)
        isMember: sideClanId !== null && player.clanId === sideClanId,
        ...stats,
        mvp: false,
      }
    })

  const red = toSlots(input.redPlayers, input.redClanId, winner === 'red', blueSkill)
  const blue = toSlots(input.bluePlayers, input.blueClanId, winner === 'blue', redSkill)
  pickMvp(rng, winner === 'red' ? red : blue, playersById)

  return {
    index: input.index,
    minute: input.minute,
    redClanId: input.redClanId,
    blueClanId: input.blueClanId,
    red,
    blue,
    winner,
    tag: input.tag,
  }
}

/**
 * 그 경기 안에서의 **상대적** 퍼포먼스 (-1 ~ +1).
 *
 * 절대 KD 를 쓰면 쉬운 상대를 만난 사람이 계속 이득을 본다.
 * 그래서 **그 경기 10명 안에서의 위치**로 잰다. MVP 는 작게 얹는다.
 */
export function performanceScore(slot: MatchSlot, allSlots: readonly MatchSlot[]): number {
  const mine = kdRate(slot.kill, slot.death)
  const rates = allSlots.map((s) => kdRate(s.kill, s.death))
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length
  const sd = Math.sqrt(variance) || 1
  // ±2 표준편차를 ±1 로 자른다
  const z = Math.max(-1, Math.min(1, (mine - mean) / (2 * sd)))
  const mvpBump = slot.mvp ? 0.25 : 0
  return Math.max(-1, Math.min(1, z + mvpBump))
}
