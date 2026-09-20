import { defenceByHomeRule, type HomeRuleKill } from './sideAxes.js'
import type { ZoneCells } from './duel.js'
import { roundResultsOf, roundSidesOf, type RoundSide, type RoundSideEvent } from './roundSide.js'
import { rosterOf, secondsOf } from './roundState.js'

/**
 * ★★라운드별 진영을 ★세 겹★ 으로 정한다★★ (2026-09-20)
 *
 * ── 왜 따로 만드나
 *
 *   진영을 가리는 근거는 셋인데 ★그걸 겹치는 코드가 `playerHexBuild` 안에만★ 있었다.
 *   그래서 선짤 점수를 만들 때 ★C4 와 5승 규칙 둘만★ 쓰고 ★좌표 규칙을 빠뜨렸다.★
 *   사장님이 바로 짚으셨다 — 「내가 분명 배틀로그 위치로 레드 블루 구분하라고 했을텐데」.
 *
 *   ★규칙이 한 곳에 있어야 빠뜨리지 않는다.★ 그래서 여기로 뽑는다.
 *
 * ── 세 겹 (전부 사장님이 주신 규칙이다)
 *
 *   ① ★C4 폭탄★      설치=공격 · 해체=수비. 상대 것은 뒤집어 쓴다 (D-184)
 *   ② ★전반 5승★      한 팀이 라운드 5승을 채운 다음 라운드부터 후반 (D-208)
 *   ③ ★좌표(집)★      바닥·벙커=라플의 집 · 머리/녹뒤/컨뒤=스나의 집 (2026-09-17)
 *                     「우리 바닥이 바닥에서 죽거나 잡은게 2회이상이면 그 팀은 무조건 블루」
 *
 *   ①②가 먼저다. ③은 ★C4 가 한 반에 하나도 없을 때★ 그 반을 채운다.
 *   실측 — ①②가 86.8% · ③이 나머지 13.2% (합 99.7%).
 *
 * ⚠ ★못 정하면 비운다.★ 틀린 진영으로 매기면 상벌이 통째로 뒤집혀 조용히 거짓이 된다.
 */

/** 전반이 끝나는 승수 — 한 팀이 이만큼 이기면 다음 라운드부터 후반이다 */
const HALF_WIN_TARGET = 5

export interface OpeningSideEvent extends RoundSideEvent {
  /** ★죽은 자리★ — `RoundSideEvent` 에는 `kill_x/y` 만 있다 */
  death_x?: number | string | null
  death_y?: number | string | null
  /** 사람 — 좌표 규칙이 「누구 팀인가」 를 알아야 한다 */
  str_usn?: string | null
  target_str_usn?: string | null
  event_time?: string | null
}

export interface OpeningSideInput {
  events: readonly OpeningSideEvent[]
  /** 바닥·벙커 칸 (라플의 집). 없으면 ③을 건너뛴다 */
  homeFloor: ZoneCells | null
  /** 머리·녹뒤·컨뒤 칸 (스나의 집). 없으면 ③을 건너뛴다 */
  homeSnipe: ZoneCells | null
  /** `usn` → 그 경기에서 스나였나. 좌표 규칙이 쓴다 */
  isSniper: (usn: string) => boolean
}

export interface OpeningSides {
  /** 라운드 → 그 라운드에 ★수비(블루)★ 인 팀의 `team_no` */
  defenceOf: Map<number, string>
  /** 어디까지가 ①②이고 어디부터 ③인지 — 되짚을 근거 */
  by: Map<number, 'bomb' | 'home'>
  /** 팀 둘 */
  teams: string[]
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const num = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim())
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** 좌표는 0 도 뜻이 있는 값이라 `num` 을 못 쓴다 — 못 읽으면 `null` */
const coord = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

/**
 * 진영을 정한다.
 *
 * ⚠ 돌려주는 것은 ★수비(블루)인 팀★ 이다. 공격(레드)은 나머지 팀이다.
 */
export function openingSidesOf(input: OpeningSideInput): OpeningSides {
  const { events } = input
  const roster = rosterOf(events)
  if (roster.teams.length !== 2) return { defenceOf: new Map(), by: new Map(), teams: roster.teams }
  const [tA, tB] = roster.teams as [string, string]

  const rounds = [...new Set(events.map((e) => num(e.round)).filter((n): n is number => n !== null))].sort(
    (a, b) => a - b,
  )
  if (rounds.length === 0) return { defenceOf: new Map(), by: new Map(), teams: roster.teams }

  /* ── ①② C4 + 5승 규칙 ─────────────────────────────────── */
  const results = roundResultsOf(events)
  const sides = roundSidesOf(events, tA, rounds[rounds.length - 1] as number, (r) => {
    const v = results.get(r)
    return v === undefined ? null : v
  })

  const defenceOf = new Map<number, string>()
  const by = new Map<number, 'bomb' | 'home'>()
  for (const [round, side] of sides.side) {
    defenceOf.set(round, side === 'defense' ? tA : tB)
    by.set(round, 'bomb')
  }

  /* ── ③ 좌표(집) 규칙으로 빈 반을 채운다 ───────────────── */
  if (input.homeFloor === null && input.homeSnipe === null) return { defenceOf, by, teams: roster.teams }

  /* 전반의 끝 — 아는 라운드에서 수비가 바뀌는 자리. 모르면 5승 규칙이 정한 자리 */
  let switchAt: number | null = null
  for (let i = 1; i < rounds.length; i += 1) {
    const prev = defenceOf.get(rounds[i - 1] as number)
    const here = defenceOf.get(rounds[i] as number)
    if (prev !== undefined && here !== undefined && prev !== here) {
      switchAt = rounds[i] as number
      break
    }
  }
  if (switchAt === null) {
    const won: Record<string, number> = {}
    for (const r of rounds) {
      const v = results.get(r)
      if (v === null || v === undefined) continue
      /* `roundResultsOf` 는 `tA` 기준 승패다 */
      const winner = v ? tA : tB
      won[winner] = (won[winner] ?? 0) + 1
      if ((won[winner] as number) >= HALF_WIN_TARGET) {
        switchAt = r + 1
        break
      }
    }
  }
  /*
   * ★★전반만 있고 후반이 없는 경기가 있다★★ (2026-09-20 실측에서 잡았다)
   *
   *   한 팀이 ★5:0 으로 끝내면★ 5라운드에서 경기가 끝난다. 그러면 `switchAt` 이
   *   6이 되어 후반이 ★빈 목록★ 이 되고, 「반이 둘 다 있어야 한다」 는 검사에 걸려
   *   ★좌표 규칙이 한 번도 안 돌았다.★
   *
   *   사장님 6경기 중 20:38 경기가 그랬다 — C4 가 없는 5라운드 경기라
   *   ★좌표 규칙만이 유일한 근거★ 였는데 그 검사 때문에 통째로 비었다.
   *
   * ⚠ ★빈 반은 그냥 건너뛴다.★ 반이 하나뿐이어도 그 반은 채울 수 있다.
   */
  if (switchAt === null) switchAt = rounds[rounds.length - 1] as number + 1

  const halves = [rounds.filter((r) => r < (switchAt as number)), rounds.filter((r) => r >= (switchAt as number))]
  if ((halves[0] as number[]).length === 0 && (halves[1] as number[]).length === 0) {
    return { defenceOf, by, teams: roster.teams }
  }

  for (let i = 0; i < 2; i += 1) {
    const half = halves[i] as number[]
    if (half.length === 0) continue
    /* 이 반에 이미 아는 라운드가 있으면 ③을 안 쓴다 — ①②가 이긴다 */
    if (half.some((r) => defenceOf.has(r))) continue

    /* 다른 반을 알면 ★뒤집어서★ 채운다 — 전·후반은 서로 반대다 */
    const other = halves[1 - i] as number[]
    const otherDef = other.map((r) => defenceOf.get(r)).find((v) => v !== undefined)
    let defence: string | null = otherDef !== undefined ? (otherDef === tA ? tB : tA) : null

    if (defence === null) {
      /* 둘 다 모른다 — 이 반의 교전 좌표로 규칙을 돌린다 */
      const kills: HomeRuleKill[] = []
      const inHalf = new Set(half)
      for (const e of events) {
        const round = num(e.round)
        if (round === null || !inHalf.has(round)) continue
        const subjectKilled = str(e.event_type) === 'kill'
        const targetKilled = str(e.target_event_type) === 'kill'
        if (subjectKilled === targetKilled) continue
        const killer = subjectKilled ? str(e.str_usn) : str(e.target_str_usn)
        const victim = subjectKilled ? str(e.target_str_usn) : str(e.str_usn)
        const killerTeam = subjectKilled ? str(e.team_no) : str(e.target_team_no)
        const victimTeam = subjectKilled ? str(e.target_team_no) : str(e.team_no)
        if (killer === null || victim === null) continue
        kills.push({
          /*
           * ⚠ ★좌표는 줄 주인 기준이 아니다★ — `kill_x/y` 는 ★죽인 자리★,
           *   `death_x/y` 는 ★죽은 자리★ 다. 어느 쪽이 주인이든 뜻이 같다.
           */
          killAt: { x: coord(e.kill_x), y: coord(e.kill_y) },
          deathAt: { x: coord(e.death_x), y: coord(e.death_y) },
          killerTeam,
          victimTeam,
          killerIsSniper: input.isSniper(killer),
          victimIsSniper: input.isSniper(victim),
        })
      }
      defence = defenceByHomeRule(kills, input.homeFloor, input.homeSnipe).defence
    }

    if (defence === null) continue
    for (const r of half) {
      defenceOf.set(r, defence)
      by.set(r, 'home')
    }
  }

  return { defenceOf, by, teams: roster.teams }
}

/**
 * 위 결과를 `openingTalliesOf` 가 받는 모양(`sideOf`)으로 바꾼다.
 *
 * ⚠ 모르는 라운드는 ★`null`★ 이다 — 그 라운드는 통째로 안 센다.
 */
export function sideLookupOf(sides: OpeningSides): (round: number, team: string) => RoundSide | null {
  return (round, team) => {
    const defence = sides.defenceOf.get(round)
    if (defence === undefined) return null
    if (!sides.teams.includes(team)) return null
    return team === defence ? 'defense' : 'attack'
  }
}

/** 라운드마다 ★마지막 이벤트 시각★ — 라운드 시작을 되짚을 때 쓴다 */
export function lastEventAtOf(events: readonly OpeningSideEvent[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const e of events) {
    const round = num(e.round)
    const at = secondsOf(e.event_time)
    if (round === null || at === null) continue
    const seen = out.get(round)
    if (seen === undefined || at > seen) out.set(round, at)
  }
  return out
}
