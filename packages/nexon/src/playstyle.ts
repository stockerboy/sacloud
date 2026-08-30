/**
 * 플레이스타일 바의 **재료** — 진영별로 그 선수가 어떻게 움직였나
 * (`docs/PLAYER_TRAITS_SPEC.md` 8절 · D-182 · D-211).
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다. `clanRound.ts` 의 형제 모듈이다.
 *
 * ── 무엇을 재는가
 *
 * ```
 * 블루 = 수비   안전함   ↔  변칙적
 * 레드 = 공격   느린전개 ↔  빠른전개
 * ```
 *
 *   육각형이 **"얼마나 잘하나"** 라면 이것은 **"어떻게 하나"** 다. 그래서 여기서 나오는
 *   값들은 전부 **방향이 없다** — 크다고 잘하는 것이 아니다. 잘하고 못하고를 뜻하는
 *   값(승률·킬뎃)은 여기 넣지 않는다.
 *
 * ── 진영으로 갈라서 센다 (사양 8절 · 사용자 확정)
 *   "수비 라운드의 움직임으로 공격 성향을 재면 거짓이 된다." 그래서 라운드마다
 *   진영을 알아야 하고, 그건 폭탄이 말해 준다 (D-184 · D-208 · `roundSide.ts`).
 *   **진영을 모르는 라운드는 양쪽 어디에도 넣지 않는다** (D-106).
 *
 * ── 사양의 원래 정의와 무엇이 다른가 (D-211)
 *   사양 8절은 구역 이름으로 정의돼 있다 — `컨뒤`·`에이설대`(스나 수비),
 *   `달방`·`홀`·`ㄱ자`·`벙커`(라플 수비). 그런데 그 구역들은 **좌표로 확정된 적이 없다.**
 *   확정된 것은 포지션용 4구역(`zonemap.json`)과 스나 레인뿐이다 (사양 2절).
 *
 *   그래서 구역 이름 대신 **구역과 무관한 좌표·시각 통계**로 같은 뜻을 잡는다.
 *
 *     사양이 말한 것                        여기서 재는 것
 *     ────────────────────────────────────────────────────────────
 *     "여러 곳에 흩어져 있으면 변칙적"        자리 흩어짐 — 교전 좌표의 분산
 *     "라운드 초반에 킬/데스하면 변칙적"      첫 교전 지연 — 라운드 시작부터 내 첫 사건까지
 *     "가장 먼저 킬/데스할수록 빠른전개"      오프닝 관여 — 라운드 첫 교전의 당사자였나
 *     "맨 마지막에 죽으면 느린전개"          첫 교전 지연(뒤집으면 같은 뜻)
 *
 *   > `[미확인]` **사양의 구역 정의를 그대로 구현한 것이 아니다.** 뜻이 같다고 보아
 *   > 고른 대체 재료이고, **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 *   > 구역 좌표가 확정되면 그때 바꾸고 `builderVersion` 을 올린다.
 *
 * ── 무기는 여기서 보지 않는다
 *   사양은 스나수와 라플수에 다른 것을 재라고 한다. 그런데 스나는 원래 더 일찍 교전하고
 *   (실측 7~8초 대 라플 12초) 더 멀리서 싸운다. **무기가 다른 두 사람을 같은 자로 재면**
 *   스나 전원이 "빠른전개" 로 몰린다.
 *
 *   그래서 재는 값은 하나로 두고, **견주는 무리를 무기로 가른다** (`traits.ts` 의
 *   백분위와 같은 방식이다). 스나는 스나끼리, 라플은 라플끼리 견준다.
 */
import { roundClocksOf, type ClanRoundEvent } from './clanRound'
import { secondsOf } from './roundState'

/** 이벤트 한 줄에서 이 모듈이 보는 칸 */
export interface PlaystyleEvent extends ClanRoundEvent {
  /** 죽인 사람이 서 있던 위치 */
  kill_x?: number | string | null
  kill_y?: number | string | null
  /** 죽은 사람이 서 있던 위치 */
  death_x?: number | string | null
  death_y?: number | string | null
}

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/**
 * 라운드 번호. **`null` 과 빈 문자열을 0 으로 만들지 않는다** (`roundSide.ts` 와 같은 이유).
 */
const roundNo = (value: unknown): number | null => {
  const text = str(value)
  if (text === null) return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** 좌표. `0` 은 실제 좌표일 수 있으므로 **결측과 섞지 않는다** */
const coord = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/* -------------------------------------------------------------------------- */
/* 집계 그릇                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 한 진영에서의 집계. **분자와 분모를 따로 담는다** (D-106) —
 * 비율을 미리 계산해 넣으면 표본이 얼마인지 사라진다.
 */
export interface PlaystyleSideTally {
  /** 그 진영으로 뛴, 교전이 있었던 라운드 수 */
  rounds: number
  /** 그중 **라운드 첫 교전의 당사자**(죽였거나 죽었거나)였던 라운드 수 */
  opening: number

  /** 첫 교전 지연의 합(초)과 잰 라운드 수 */
  delaySum: number
  delayN: number

  /**
   * 자리 흩어짐의 재료 — 교전 좌표의 합·제곱합.
   *
   * 좌표를 통째로 들고 있지 않고 합·제곱합만 남긴다. 분산은
   * `E[x²] − E[x]²` 로 나오므로 이 네 값이면 충분하고, 경기를 이어 붙여도
   * 그냥 더하면 된다(누적 가능하다).
   */
  posX: number
  posY: number
  posX2: number
  posY2: number
  posN: number
}

export interface PlaystyleTally {
  defense: PlaystyleSideTally
  attack: PlaystyleSideTally
}

export const emptySideTally = (): PlaystyleSideTally => ({
  rounds: 0,
  opening: 0,
  delaySum: 0,
  delayN: 0,
  posX: 0,
  posY: 0,
  posX2: 0,
  posY2: 0,
  posN: 0,
})

export const emptyTally = (): PlaystyleTally => ({
  defense: emptySideTally(),
  attack: emptySideTally(),
})

/** 두 집계를 더한다 — 경기를 이어 붙일 때 쓴다 */
export function addSideTally(into: PlaystyleSideTally, from: PlaystyleSideTally): void {
  into.rounds += from.rounds
  into.opening += from.opening
  into.delaySum += from.delaySum
  into.delayN += from.delayN
  into.posX += from.posX
  into.posY += from.posY
  into.posX2 += from.posX2
  into.posY2 += from.posY2
  into.posN += from.posN
}

/* -------------------------------------------------------------------------- */
/* 킬 목록                                                                      */
/* -------------------------------------------------------------------------- */

/** 한 라운드의 킬 하나 */
export interface PlaystyleKill {
  round: number
  /** 경기 시작부터의 누적 초 */
  at: number
  killer: string
  victim: string
  /** 죽인 사람이 서 있던 위치 */
  killerX: number | null
  killerY: number | null
  /** 죽은 사람이 서 있던 위치 */
  victimX: number | null
  victimY: number | null
}

/**
 * 이벤트에서 킬만 뽑는다.
 *
 * 한 킬이 두 줄로 올 수 있다 — 죽인 쪽과 죽은 쪽이 둘 다 조회 클랜이면 그렇다.
 * `라운드 + 죽은 사람 + 시각` 으로 같은 죽음을 하나로 본다 (`roundState.ts` 와 같은 규칙).
 *
 * 좌표는 **행위 기준**이다. `kill_*` 은 언제나 죽인 사람의 자리,
 * `death_*` 는 죽은 사람의 자리다 — 주체·상대 방향과 무관하다 (사양 1절 실측).
 */
export function playstyleKillsOf(events: readonly PlaystyleEvent[]): PlaystyleKill[] {
  const out: PlaystyleKill[] = []
  const seen = new Set<string>()

  for (const event of events) {
    const round = roundNo(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue

    /* 죽인 쪽이 주체인가 상대인가. 둘 다이거나 둘 다 아니면 읽을 수 없는 줄이다 */
    const subjectKilled = str(event.event_type) === 'kill'
    const targetKilled = str(event.target_event_type) === 'kill'
    if (subjectKilled === targetKilled) continue

    const killer = subjectKilled ? str(event.str_usn) : str(event.target_str_usn)
    const victim = subjectKilled ? str(event.target_str_usn) : str(event.str_usn)
    if (killer === null || victim === null) continue

    const key = round + ':' + victim + ':' + at
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      round,
      at,
      killer,
      victim,
      killerX: coord(event.kill_x),
      killerY: coord(event.kill_y),
      victimX: coord(event.death_x),
      victimY: coord(event.death_y),
    })
  }

  out.sort((a, b) => a.at - b.at)
  return out
}

/* -------------------------------------------------------------------------- */
/* 경기 하나                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 한 경기에서 **뛴 사람 전원**의 진영별 재료를 센다.
 *
 * `sideOf` 는 라운드 → `teamNo` 팀의 진영이다 (`roundSidesOf(...).side`).
 * 폭파미션은 한 라운드에 공격이 한 팀뿐이라, 상대 팀은 그 반대다 —
 * 그래서 **양 팀 열 명을 다 셀 수 있다.**
 *
 * `teamOf` 는 `usn → team_no` 다 (`rosterOf(...).teamOf`).
 *
 * 진영을 모르는 라운드는 통째로 건너뛴다. 교전이 하나도 없는 라운드도 건너뛴다 —
 * 그 라운드에서 "언제 처음 싸웠나" 는 존재하지 않는 값이다.
 */
export function playstyleTallyOf(input: {
  events: readonly PlaystyleEvent[]
  teamNo: string
  teamOf: ReadonlyMap<string, string>
  sideOf: ReadonlyMap<number, 'attack' | 'defense'>
}): Map<string, PlaystyleTally> {
  const out = new Map<string, PlaystyleTally>()
  if (input.sideOf.size === 0) return out

  const clocks = roundClocksOf(input.events)
  const kills = playstyleKillsOf(input.events)

  /** 라운드 → 그 라운드의 킬들 */
  const byRound = new Map<number, PlaystyleKill[]>()
  for (const kill of kills) {
    const list = byRound.get(kill.round)
    if (list) list.push(kill)
    else byRound.set(kill.round, [kill])
  }

  const tallyOf = (usn: string): PlaystyleTally => {
    let entry = out.get(usn)
    if (!entry) {
      entry = emptyTally()
      out.set(usn, entry)
    }
    return entry
  }

  for (const [round, mySide] of input.sideOf) {
    const clock = clocks.get(round)
    if (clock === undefined) continue
    const roundKills = byRound.get(round)
    if (roundKills === undefined || roundKills.length === 0) continue

    /* 라운드 시작의 근사값 — 그 라운드 첫 이벤트 시각이다 (`roundClocksOf`).
       실제 시작보다 **늦게** 잡히므로 지연은 짧게 나온다. 모두에게 같은 방향으로
       치우치므로 서로 견주는 데는 지장이 없다 */
    const start = clock.first
    const first = roundKills[0] as PlaystyleKill

    /** 그 라운드에서 각자 죽은 시각 (가장 이른 것) */
    const deathAt = new Map<string, number>()
    for (const kill of roundKills) {
      if (!deathAt.has(kill.victim)) deathAt.set(kill.victim, kill.at)
    }

    for (const [usn, team] of input.teamOf) {
      /* 공격은 한 라운드에 한 팀뿐이다 — 상대 팀은 반대 진영이다 (D-208) */
      const side =
        team === input.teamNo ? mySide : mySide === 'attack' ? 'defense' : 'attack'
      const acc = tallyOf(usn)[side]

      acc.rounds += 1
      if (first.killer === usn || first.victim === usn) acc.opening += 1

      /* 첫 교전 지연 — 내가 처음 죽였거나 죽은 시각 중 이른 것 */
      let mine = Number.POSITIVE_INFINITY
      for (const kill of roundKills) {
        if (kill.killer === usn && kill.at < mine) mine = kill.at
      }
      const myDeath = deathAt.get(usn)
      if (myDeath !== undefined && myDeath < mine) mine = myDeath
      if (Number.isFinite(mine)) {
        acc.delaySum += mine - start
        acc.delayN += 1
      }

      /* 자리 — 내가 죽인 자리와 내가 죽은 자리를 함께 넣는다.
         둘 다 "그 라운드에 내가 서 있던 곳" 이라는 같은 뜻이다 */
      for (const kill of roundKills) {
        if (kill.killer !== usn) continue
        if (kill.killerX === null || kill.killerY === null) continue
        acc.posX += kill.killerX
        acc.posY += kill.killerY
        acc.posX2 += kill.killerX * kill.killerX
        acc.posY2 += kill.killerY * kill.killerY
        acc.posN += 1
      }
      const killed = roundKills.find((kill) => kill.victim === usn)
      if (killed && killed.victimX !== null && killed.victimY !== null) {
        acc.posX += killed.victimX
        acc.posY += killed.victimY
        acc.posX2 += killed.victimX * killed.victimX
        acc.posY2 += killed.victimY * killed.victimY
        acc.posN += 1
      }
    }
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* 재료 → 값                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 자리 흩어짐을 재려면 좌표가 최소 이만큼은 있어야 한다.
 *
 * 두 점이면 분산이 늘 "두 점 사이 거리의 절반" 이라 사람마다 다른 값이 아니다.
 *
 * > `[미확인]` 우리가 고른 값이다.
 */
export const PLAYSTYLE_MIN_POSITIONS = 8

/** 라운드 첫 교전의 당사자였던 비율 */
export function openingRate(tally: PlaystyleSideTally): number | null {
  return tally.rounds >= 1 ? tally.opening / tally.rounds : null
}

/** 라운드 시작부터 내 첫 교전까지의 평균 초. **작을수록 빠르다** */
export function entryDelay(tally: PlaystyleSideTally): number | null {
  return tally.delayN >= 1 ? tally.delaySum / tally.delayN : null
}

/**
 * 자리 흩어짐 — 교전 좌표의 표준편차 (x·y 를 합친 것).
 *
 * `sqrt(Var(x) + Var(y))` 다. 한 자리만 지키면 작고, 여기저기서 싸우면 크다.
 * 음수가 되지 않게 막는다 — 부동소수 오차로 `E[x²] − E[x]²` 가 −1e-12 이 될 수 있다.
 */
export function positionSpread(tally: PlaystyleSideTally): number | null {
  if (tally.posN < PLAYSTYLE_MIN_POSITIONS) return null
  const n = tally.posN
  const varX = Math.max(0, tally.posX2 / n - (tally.posX / n) ** 2)
  const varY = Math.max(0, tally.posY2 / n - (tally.posY / n) ** 2)
  return Math.sqrt(varX + varY)
}
