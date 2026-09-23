/**
 * ★라운드 흐름★ — 한 경기를 「라운드 → 죽음 차례」 로 편 것 (2026-09-23 사장님).
 *
 * > 「라운드별로 쪼개고 전반 후반 경계를 가운데에 선 하나 그어놓고 클랜별 전적처럼 그래프를 —
 * >  1라운드 때 레드팀이 블루팀을 먼저 1킬 하면 레드팀이 이길 확률이 50:50 에서 좀 더 올라가고 …
 * >  라운드 내에서 인원별로 쪼개고 라운드별로 쪼개고」
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다. 여기서는 ★사실만★ 편다 —
 * 언제 누가 죽었나 · 누가 라운드를 땄나 · 어느 팀이 수비였나 · 라운드가 언제 열리고 닫혔나.
 * ★확률은 여기 없다.★ 확률은 `@sacloud/contract` 의 `roundOdds` 가 빈도표로 낸다.
 *
 * ── 재료 (전부 이미 있던 것)
 *   죽음 차례      `roundStatesOf`  (라운드 안 살아 있는 인원은 여기서 센다 · D-106 규칙 그대로)
 *   라운드 승패    `roundResultsOf` (`win_flag` · ★응답 주인 팀 기준★ 이라 한 응답만 넣어야 한다)
 *   진영·전후반    `roundSidesOf`   (① C4 ② 5승 규칙 · D-184 · D-208)
 *   라운드 시각    1라운드는 경기 시작 10초 뒤 · 그 뒤는 앞 라운드 마지막 이벤트 + 8.45초
 *                  (`MATCH_TO_FIRST_ROUND_SECONDS` · `ROUND_GAP_SECONDS` · 사장님 실측)
 *
 * ── ⚠ 한 응답만 넣는다
 *   `win_flag` 는 응답한 클랜 기준이다. 두 클랜 응답을 합치면 같은 라운드에 win·lose 가 같이 들어와
 *   `roundResultsOf` 가 전부 null 을 돌려준다. `teamNo` 는 그 응답 주인의 팀이다.
 *
 * ── 모르면 비운다 (D-106)
 *   진영을 모르는 라운드는 `defence: null`. 승패를 모르는 라운드는 `winner: null`.
 *   전후반 경계를 모르면 `secondHalfFrom: null`. 인원이 두 팀으로 안 갈리면 통째로 `null`.
 *   ★좌표(집) 규칙(③)은 아직 안 탄다★ — 구역 파일과 스나 판정이 있어야 해서 웹에서는 못 쓴다.
 *   `openingSides.ts` 가 그 규칙을 갖고 있으니 워커에서 미리 접게 되면 그쪽으로 옮긴다.
 */
import { MATCH_TO_FIRST_ROUND_SECONDS, ROUND_GAP_SECONDS } from './clanHexV2'
import { roundResultsOf, roundSidesOf, type RoundSideEvent } from './roundSide'
import { rosterOf, roundStatesOf, secondsOf, type RoundStateEvent } from './roundState'

export interface RoundFlowEvent extends RoundStateEvent, RoundSideEvent {
  win_flag?: string | null
}

/** 두 팀을 「응답 주인(`mine`)」 과 「상대(`foe`)」 로 부른다. 슬롯 이름(red/blue)은 부르는 쪽이 붙인다 */
export type FlowTeam = 'mine' | 'foe'

export interface RoundFlowDeath {
  /** 경기 시작부터 초 */
  at: number
  /** 죽은 사람의 팀 */
  team: FlowTeam
}

export interface RoundFlowRound {
  round: number
  /** 라운드가 열린 시각(초). 1라운드는 10 · 그 뒤는 앞 라운드 `end` + 8.45 */
  start: number
  /** 그 라운드의 마지막 이벤트 시각(초). 라운드 끝의 근사값이다 */
  end: number
  /** 이 라운드에 ★수비(블루)★ 였던 팀. 모르면 null */
  defence: FlowTeam | null
  /** 라운드를 딴 팀. 모르면 null */
  winner: FlowTeam | null
  /** 시각순 죽음. 한 사람은 한 라운드에 한 번만 (roundStatesOf 규칙) */
  deaths: RoundFlowDeath[]
}

export interface RoundFlow {
  /** 라운드 시작 인원 — 명단으로 확인된 수 */
  teamSize: { mine: number; foe: number }
  /** 후반이 시작되는 라운드. 모르면 null */
  secondHalfFrom: number | null
  rounds: RoundFlowRound[]
}

const roundNo = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * 전후반 경계 — `roundSidesOf` 가 못 정하면 ★5승 규칙★ 으로만 정한다 (D-208).
 * 진영의 ★방향★ 은 끝까지 폭탄이 정하지만, ★어디서 바뀌는지★ 는 승수만으로도 안다.
 */
function switchByFiveWins(rounds: readonly number[], won: (round: number) => boolean | null): number | null {
  let mine = 0
  let foe = 0
  for (const r of rounds) {
    const v = won(r)
    if (v === null) return null /* 모르는 라운드가 끼면 누적을 믿을 수 없다 */
    if (v) mine += 1
    else foe += 1
    if (mine === 5 || foe === 5) return r + 1
  }
  return null
}

export function roundFlowOf(input: { events: readonly RoundFlowEvent[]; teamNo: string }): RoundFlow | null {
  const { events, teamNo } = input
  const roster = rosterOf(events)
  if (roster.teams.length !== 2 || !roster.teams.includes(teamNo)) return null
  const foeNo = roster.teams.find((t) => t !== teamNo) as string
  const teamOf = (no: string): FlowTeam => (no === teamNo ? 'mine' : 'foe')

  /* 라운드마다 마지막 이벤트 시각 — 죽음이 아닌 줄(폭탄 등)도 본다 */
  const lastAt = new Map<number, number>()
  for (const e of events) {
    const r = roundNo(e.round)
    const at = secondsOf(e.event_time)
    if (r === null || at === null) continue
    lastAt.set(r, Math.max(lastAt.get(r) ?? 0, at))
  }
  const rounds = [...lastAt.keys()].sort((a, b) => a - b)
  if (rounds.length === 0) return null

  const results = roundResultsOf(events)
  const won = (r: number): boolean | null => {
    const v = results.get(r)
    return v === undefined ? null : v
  }
  const sides = roundSidesOf(events, teamNo, rounds[rounds.length - 1] as number, won)
  const states = roundStatesOf(events)

  const out: RoundFlowRound[] = []
  let prevEnd: number | null = null
  for (const r of rounds) {
    const end = lastAt.get(r) as number
    const deaths = (states.get(r)?.deaths ?? []).map((d) => ({ at: d.at, team: teamOf(d.team) }))
    let start = prevEnd === null ? MATCH_TO_FIRST_ROUND_SECONDS : prevEnd + ROUND_GAP_SECONDS
    /* 이벤트가 계산한 시작보다 앞에 있으면 그 앞으로 — 시각이 거꾸로 가는 그림은 안 그린다 */
    const first = deaths[0]?.at ?? end
    if (start > first) start = Math.max(0, first - 1)
    if (start > end) start = end
    const side = sides.side.get(r)
    const v = won(r)
    out.push({
      round: r,
      start,
      end,
      defence: side === undefined ? null : side === 'defense' ? 'mine' : 'foe',
      winner: v === null ? null : v ? 'mine' : 'foe',
      deaths,
    })
    prevEnd = end
  }

  const secondHalfFrom = sides.switchRound ?? switchByFiveWins(rounds, won)
  return {
    teamSize: { mine: roster.sizeOf.get(teamNo) ?? 0, foe: roster.sizeOf.get(foeNo) ?? 0 },
    secondHalfFrom,
    rounds: out,
  }
}
