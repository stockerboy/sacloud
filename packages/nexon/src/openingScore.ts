import { rosterOf, roundStatesOf, secondsOf, type RoundStateEvent } from './roundState'
import type { RoundSide } from './roundSide'
import { MATCH_TO_FIRST_ROUND_SECONDS, ROUND_GAP_SECONDS } from './clanHexV2'
import { killsOf, weaponByPlayerOf, type DuelEvent } from './duel'

/**
 * ★★선짤 점수★★ (2026-09-20 사장님)
 *
 * > 「레드때 상대팀을 선짤한 선수에 대한 보상」
 * > 「레드는 ★22초 이내에 5:5에서 선짤당해서 죽은 사람만★ -1점」
 * > 「블루때 스나가 가장 먼저 죽는다? 이건 ★무조건 마이너스요소★ -2점」
 * > 「★첫사망자의 기준은 5:5일때만이다★」
 *
 * ── 왜 만드나
 *
 *   지금 개인 점수는 ★잘한 것만 더하고 못한 것은 안 깎는다.★ 선짤을 「한」 것은
 *   옛 크랙 축이 셌지만 그 축은 9/16에 빠졌고, 선짤「당한」 것은 ★어디에도 없다.★
 *   그 빈 칸을 채운다.
 *
 * ── 규칙
 *
 *   ```
 *            상                              벌
 *   ─────────────────────────────────────────────────────────
 *   레드   22초 안 · 선짤 성공            22초 안 · 첫 사망자
 *          + 3초 이상 생존  → +1          → -1  (팀이 3초 안에 되잡으면 면제)
 *
 *   블루   22초 안 · ★스나를★ 선짤        스나가 첫 사망자 → -2
 *          + 3초 이상 생존  → +1          라플이 첫 사망자 → -1
 *          (라플 잡은 건 상 없음)         (면제 없음 · 22초 없음)
 *   ```
 *
 *   ★모든 판정은 5:5 일 때만 한다.★ 4:5 에서 죽는 건 이미 진 싸움이다.
 *
 * ── ⚠ ★「라운드 경과 시간」은 계산해야 나온다★
 *
 *   `event_time` 은 ★경기 누적★ 이다 (D-174). 라운드 시작 시각이 원문에 없다.
 *   ★사장님이 주신 값★ 으로 되짚는다 —
 *
 *   > 「라운드 끝나고 ★정확히 8.5초★ 뒤에 다음 라운드 시작된다」
 *
 *   ```
 *   1라운드 시작   = 10초            (MATCH_TO_FIRST_ROUND_SECONDS)
 *   N라운드 시작   = N-1 마지막 + 8.45초 (ROUND_GAP_SECONDS)
 *   ```
 *
 * ⚠ ★두 값을 여기에 새로 적지 않는다.★ `clanHexV2` 가 이미 갖고 있고, 둘 다
 *   ★사장님이 직접 재신 값★ 이다 (2026-09-14 저녁: 「첫라운드 시작은 정확히 10초후」
 *   「라운드랑 라운드 사이 간격 정확히 8.45초」). 같은 값을 두 곳에 적으면
 *   ★한 곳만 고쳐지고 나머지가 남는다.★
 *
 *   ★실측으로 맞음을 확인했다★ (8,444판) — 8.5초로 되짚었을 때 음수가 ★0건★ 이고
 *   중앙값이 22.5초였다. 값이 틀렸다면 음수가 쏟아졌을 것이다.
 */

/** 「초반」의 경계 — 라운드 시작 후 이 초 안에 난 일만 22초 규칙이 본다 (2026-09-20 사장님) */
export const OPENING_PENALTY_WINDOW_SECONDS = 22

/** 선짤하고 이만큼 살아야 상을 받는다 (맞트레이드는 안 쳐준다) */
export const OPENING_SURVIVE_SECONDS = 3

/** 팀이 이 안에 되잡으면 레드 벌점이 면제된다 */
export const OPENING_REVENGE_SECONDS = 3

/** 5:5 — 양 팀이 이 인원일 때만 센다 */
export const FULL_TEAM_SIZE = 5

/* ── 점수 ─────────────────────────────────────────────────────── */

/** 레드에서 22초 안에 선짤 성공 + 3초 생존 */
export const RED_OPENING_KILL_POINT = 1
/** 레드에서 22초 안에 첫 사망 (되잡기 없음) */
export const RED_OPENING_DEATH_POINT = -1
/** 블루에서 22초 안에 ★상대 스나를★ 선짤 + 3초 생존 */
export const BLUE_SNIPER_KILL_POINT = 1
/** 블루에서 우리 스나가 첫 사망 */
export const BLUE_SNIPER_DEATH_POINT = -2
/** 블루에서 우리 라플이 첫 사망 */
export const BLUE_RIFLE_DEATH_POINT = -1

/**
 * ★★죽은 사람의 무기는 원문에 ★없다★★★ (2026-09-20 실측에서 잡았다)
 *
 *   `weapon` / `target_weapon` 은 언제나 ★죽인 도구★ 다 —
 *
 *   ```
 *   kill 줄    weapon="sniper"   target_weapon=""        ← 주인이 죽인 쪽
 *   death 줄   weapon=""         target_weapon="sniper"  ← 상대가 죽인 쪽
 *   ```
 *
 *   ★죽은 사람이 뭘 들고 있었는지는 어느 칸에도 안 적힌다.★ 처음에 그 칸을
 *   읽도록 짰다가 ★스나 판정이 0건★ 으로 나와서 알았다.
 *
 * ── 그래서 ★그 경기에서 그 사람이 쓴 무기★ 로 본다
 *
 *   `weaponByPlayerOf` 가 ★그 사람이 낸 킬의 무기★ 를 모아 정한다.
 *   이미 클랜 육각이 쓰는 방법이고 실측 ★97.8%★ 판정이다.
 *
 * ⚠ ★한 번도 못 죽인 사람은 무기를 모른다★ — 그때는 세지 않는다 (D-106).
 *   스나인지 라플인지 모르는데 「라플이겠지」 로 -1 을 매기면 안 된다.
 */
const SNIPER_WEAPON = 1

/**
 * 이 모듈이 보는 칸. `RoundStateEvent` 에 무기를 더한 것이다.
 *
 * ⚠ ★`team_no` 는 그 줄 ★주인★ 의 팀이다★ (D-184). 죽음 줄은 주인이 죽은
 *   사람이라, 죽인 사람 기준으로 짝지으면 ★팀이 뒤바뀐다.★ 아래에서 줄마다
 *   누가 주인인지 보고 갈라 쓴다.
 */
export interface OpeningEvent extends RoundStateEvent {
  weapon?: string | null
  target_weapon?: string | null
}

/** 한 사람의 선짤 집계 */
export interface OpeningTally {
  /** 레드에서 22초 안에 선짤 성공 + 3초 생존 */
  redOpeningKills: number
  /** 레드에서 22초 안에 첫 사망 (되잡기로 면제된 것은 뺀다) */
  redOpeningDeaths: number
  /** 레드에서 22초 안에 첫 사망했지만 ★팀이 되잡아 면제★ 된 수 (설명용) */
  redOpeningDeathsRevenged: number
  /** 블루에서 22초 안에 상대 스나를 선짤 + 3초 생존 */
  blueSniperKills: number
  /** 블루에서 스나로 첫 사망 */
  blueSniperDeaths: number
  /** 블루에서 라플로 첫 사망 */
  blueRifleDeaths: number
}

export const EMPTY_OPENING_TALLY: OpeningTally = {
  redOpeningKills: 0,
  redOpeningDeaths: 0,
  redOpeningDeathsRevenged: 0,
  blueSniperKills: 0,
  blueSniperDeaths: 0,
  blueRifleDeaths: 0,
}

/** 집계를 점수로 바꾼다 — ★셈과 점수를 잇는 곳은 여기 하나다★ */
export function openingPointsOf(tally: OpeningTally): number {
  return (
    tally.redOpeningKills * RED_OPENING_KILL_POINT +
    tally.redOpeningDeaths * RED_OPENING_DEATH_POINT +
    tally.blueSniperKills * BLUE_SNIPER_KILL_POINT +
    tally.blueSniperDeaths * BLUE_SNIPER_DEATH_POINT +
    tally.blueRifleDeaths * BLUE_RIFLE_DEATH_POINT
  )
}

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = Number(String(value).trim())
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** 한 라운드의 「첫 죽음」 — 누가 누구를 무엇으로 */
export interface FirstBlood {
  at: number
  killer: string
  killerTeam: string
  victim: string
  victimTeam: string
  /**
   * ⚠ ★쓰지 않는다★ — 이 칸은 ★죽인 도구★ 다. 죽은 사람 무기가 아니다.
   *   남겨 두는 이유는 다음 사람이 같은 함정을 다시 밟지 않게 하려는 것이다.
   */
  killWeapon: string | null
}

/**
 * 라운드마다 ★시작 시각★ 을 되짚는다.
 *
 * ⚠ ★1라운드는 경기 시작 + 10초★ 다 (`MATCH_TO_FIRST_ROUND_SECONDS`).
 *   배틀로그 시계는 ★경기 시작★ 이 0:00 이다.
 */
export function roundStartsOf(events: readonly OpeningEvent[]): Map<number, number> {
  /** round → 그 라운드의 마지막 이벤트 시각 */
  const lastOf = new Map<number, number>()
  for (const event of events) {
    const round = num(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue
    const seen = lastOf.get(round)
    if (seen === undefined || at > seen) lastOf.set(round, at)
  }

  const out = new Map<number, number>()
  for (const round of lastOf.keys()) {
    /* ★1라운드는 경기 시작 + 10초★ — 사장님이 재신 값이다 */
    if (round === 1) {
      out.set(1, MATCH_TO_FIRST_ROUND_SECONDS)
      continue
    }
    const prev = lastOf.get(round - 1)
    /* 앞 라운드를 모르면 이 라운드 시작도 모른다 — 지어내지 않는다 */
    if (prev === undefined) continue
    out.set(round, prev + ROUND_GAP_SECONDS)
  }
  return out
}

/**
 * 라운드마다 ★첫 죽음★ 을 찾는다.
 *
 * ⚠ ★같은 초에 둘이 죽었으면 버린다★ — 누가 먼저인지 모른다 (D-106).
 *   `openingKillsOf` 와 같은 규칙이다.
 */
export function firstBloodsOf(events: readonly OpeningEvent[]): Map<number, FirstBlood | null> {
  /** round → victim → 가장 이른 죽음 */
  const byRound = new Map<number, Map<string, FirstBlood>>()

  for (const event of events) {
    const round = num(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue

    /*
     * 줄 주인이 죽였나 죽었나. 둘 다이거나 둘 다 아니면 읽을 수 없는 줄이다.
     * ⚠ ★팀과 무기를 줄 주인 기준으로 갈라 쓴다★ — 뒤집으면 팀이 바뀐다 (D-184).
     */
    const subjectKilled = str(event.event_type) === 'kill'
    const targetKilled = str(event.target_event_type) === 'kill'
    if (subjectKilled === targetKilled) continue

    const killer = subjectKilled ? str(event.str_usn) : str(event.target_str_usn)
    const victim = subjectKilled ? str(event.target_str_usn) : str(event.str_usn)
    const killerTeam = subjectKilled ? str(event.team_no) : str(event.target_team_no)
    const victimTeam = subjectKilled ? str(event.target_team_no) : str(event.team_no)
    /* ★죽인 도구★ — 죽은 사람 무기가 아니다 (위 `SNIPER_WEAPON` 주석) */
    const killWeapon = subjectKilled ? str(event.weapon) : str(event.target_weapon)
    if (killer === null || victim === null || killerTeam === null || victimTeam === null) continue

    let perRound = byRound.get(round)
    if (perRound === undefined) {
      perRound = new Map()
      byRound.set(round, perRound)
    }
    const before = perRound.get(victim)
    if (before === undefined || at < before.at) {
      perRound.set(victim, { at, killer, killerTeam, victim, victimTeam, killWeapon })
    }
  }

  const out = new Map<number, FirstBlood | null>()
  for (const [round, perRound] of byRound) {
    let best: FirstBlood | null = null
    let tied = false
    for (const entry of perRound.values()) {
      if (best === null || entry.at < best.at) {
        best = entry
        tied = false
      } else if (entry.at === best.at) {
        tied = true
      }
    }
    out.set(round, tied ? null : best)
  }
  return out
}

/** 그 사람이 그 라운드에서 죽은 시각 (안 죽었으면 `null`) */
function deathAtOf(
  states: Map<number, { deaths: { usn: string; at: number }[] }>,
  round: number,
  usn: string,
): number | null {
  const state = states.get(round)
  if (!state) return null
  for (const death of state.deaths) if (death.usn === usn) return death.at
  return null
}

export interface OpeningScoreInput {
  events: readonly OpeningEvent[]
  /**
   * 라운드 → 그 팀의 진영. `roundSidesOf` 가 준다.
   * ★모르는 라운드는 `null`★ 이고 그 라운드는 통째로 건너뛴다.
   */
  sideOf: (round: number, teamNo: string) => RoundSide | null
}

/**
 * 한 경기에서 ★사람마다★ 선짤 집계를 낸다.
 *
 * ⚠ ★모르면 세지 않는다★ (D-106) — 아래 넷 중 하나라도 모르면 그 라운드를 건너뛴다:
 *   ① 라운드 시작 시각 (1라운드이거나 앞 라운드가 비었다)
 *   ② 첫 죽음 (같은 초에 둘이 죽었다)
 *   ③ 진영 (폭탄 근거가 없거나 어긋났다)
 *   ④ 5:5 가 아니었다
 */
export function openingTalliesOf(input: OpeningScoreInput): Map<string, OpeningTally> {
  const { events } = input
  const roster = rosterOf(events)
  const states = roundStatesOf(events)
  const starts = roundStartsOf(events)
  const firstBloods = firstBloodsOf(events)
  /*
   * ★그 경기에서 누가 스나였나★ — 죽은 사람의 무기가 원문에 없어서 되짚는다.
   * ⚠ 한 번도 못 죽인 사람은 ★여기 안 담긴다★ — 그때는 무기를 모른다 (D-106).
   */
  const weaponOf = weaponByPlayerOf(killsOf(events as readonly DuelEvent[]))
  const isSniper = (usn: string): boolean | null => {
    const w = weaponOf.get(usn)
    return w === undefined ? null : w === SNIPER_WEAPON
  }

  const out = new Map<string, OpeningTally>()
  const tallyOf = (usn: string): OpeningTally => {
    let tally = out.get(usn)
    if (tally === undefined) {
      tally = { ...EMPTY_OPENING_TALLY }
      out.set(usn, tally)
    }
    return tally
  }

  /*
   * ④ 5:5 — 첫 죽음 시점에는 아직 아무도 안 죽었으므로 ★명부 인원★ 으로 본다.
   *   경기 내내 같으므로 라운드마다 다시 세지 않는다.
   */
  if (roster.teams.length !== 2) return out
  if (!roster.teams.every((team) => roster.sizeOf.get(team) === FULL_TEAM_SIZE)) return out

  for (const [round, blood] of firstBloods) {
    if (blood === null) continue

    /* ③ 죽은 쪽의 진영 — 이것이 규칙을 가른다 */
    const victimSide = input.sideOf(round, blood.victimTeam)
    if (victimSide === null) continue

    const killerTally = tallyOf(blood.killer)
    const victimTally = tallyOf(blood.victim)

    /* 선짤한 사람이 3초 이상 살았나 (맞트레이드는 상을 안 준다) */
    const killerDeath = deathAtOf(states, round, blood.killer)
    const survived = killerDeath === null || killerDeath - blood.at >= OPENING_SURVIVE_SECONDS

    const start = starts.get(round)
    const early = start !== undefined && blood.at - start <= OPENING_PENALTY_WINDOW_SECONDS

    if (victimSide === 'attack') {
      /*
       * ★죽은 쪽이 레드(공격)★ — 22초 규칙이 걸린다.
       *   죽인 쪽은 ★블루★ 이고, 블루의 상은 ★상대 스나를 잡았을 때만★ 이다.
       */
      if (!early) continue

      /* 레드 벌점 — 팀이 3초 안에 그 킬러를 되잡으면 면제 */
      if (revenged(states, round, blood)) victimTally.redOpeningDeathsRevenged += 1
      else victimTally.redOpeningDeaths += 1

      /* 블루 상점 — ★상대 스나를 잡았을 때만★. 무기를 모르면 안 준다 */
      if (survived && isSniper(blood.victim) === true) killerTally.blueSniperKills += 1
      continue
    }

    /*
     * ★죽은 쪽이 블루(수비)★ — 벌점에는 22초도 면제도 없다.
     *   죽인 쪽은 ★레드★ 이고, 레드의 상은 ★22초 안 + 3초 생존★ 이다.
     */
    /*
     * ⚠ ★무기를 모르면 세지 않는다★ — 스나는 -2, 라플은 -1 이라 ★틀리면 두 배로 틀린다.★
     *   「모르니까 라플이겠지」 로 -1 을 매기면 안 된다 (D-106).
     */
    const sniper = isSniper(blood.victim)
    if (sniper === true) victimTally.blueSniperDeaths += 1
    else if (sniper === false) victimTally.blueRifleDeaths += 1

    if (early && survived) killerTally.redOpeningKills += 1
  }

  return out
}

/**
 * 선짤당한 팀이 ★3초 안에 그 킬러를 되잡았나★.
 *
 * ⚠ ★같은 사람을 잡아야 한다★ — 다른 적을 잡은 것은 복수가 아니다.
 *   사장님: 「죽고 ★우리팀이 죽인애★ 바로 3초 내로 잡으면 점수 안깎고」
 */
function revenged(
  states: Map<number, { deaths: { usn: string; at: number }[] }>,
  round: number,
  blood: FirstBlood,
): boolean {
  const killerDeath = deathAtOf(states, round, blood.killer)
  if (killerDeath === null) return false
  return killerDeath - blood.at <= OPENING_REVENGE_SECONDS
}
