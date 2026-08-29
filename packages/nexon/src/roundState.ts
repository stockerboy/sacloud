/**
 * 라운드 복원 — **누가 언제 죽었나**로 라운드 상황을 되짚는다 (D-194).
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다. 진영 판정(`roundSide.ts`)의 형제 모듈이다.
 *
 * ── 왜 필요한가
 *   `docs/PLAYER_TRAITS_SPEC.md` 4절 육각형의 세 축이 전부 이것 하나를 기다린다.
 *
 *     1 세이브        혼자 남은 라운드 중 이긴 비율
 *     4 매치의 사나이  20분 초과 경기의 마지막 라운드 최다 킬
 *     6 소수싸움      본인 포함 둘이 남아 이겨낸 횟수 (2:1 은 세지 않는다)
 *
 *   6절의 **우리 MVP** 도 4번을 쓴다.
 *
 * ── 재료
 *   클랜 단위 배틀로그(`GetBattleLogClan`)의 이벤트다 (D-184).
 *   이벤트 한 줄이 **킬 하나**를 양쪽에서 적는다 —
 *   `event_type` 이 `death` 면 주체가 죽고 상대가 죽였다, `kill` 이면 반대다.
 *   그래서 줄마다 **죽은 사람이 정확히 한 명** 나온다.
 *
 * ── 모르면 비운다 (D-106)
 *   이벤트가 한 명분이라도 빠지면 "몇 명 살아 있었나" 가 틀어진다.
 *   그래서 판정은 **완전한 경기에서만** 한다 —
 *   양 팀 인원이 정확히 `teamSize` 명씩 확인된 경기만 센다.
 *   확인이 안 되면 `null` 이고, 그 선수의 그 축은 화면에서 `측정중` 이다.
 *   빠진 이벤트는 살아 있는 사람을 **더 많게** 보이게 하므로 세이브·소수싸움을
 *   **적게** 세는 쪽으로 틀린다. 없는 것을 만들어 내지는 않는다.
 */

/** 이벤트 한 줄에서 우리가 보는 칸만 */
export interface RoundStateEvent {
  round?: number | string | null
  /** `"MM:SS"` — **경기 전체 누적 시간**이다. 라운드 기준이 아니다 */
  event_time?: string | null
  event_type?: string | null
  target_event_type?: string | null
  str_usn?: string | null
  target_str_usn?: string | null
  team_no?: number | string | null
  target_team_no?: number | string | null
}

/** 한 라운드에서 죽은 사람 하나 */
export interface RoundDeath {
  usn: string
  /** `team_no` — 클랜 번호다. 진영이 아니다 (D-184) */
  team: string
  /** 경기 시작부터의 누적 초 */
  at: number
}

export interface RoundState {
  round: number
  /** 이른 시각 → 늦은 시각 */
  deaths: RoundDeath[]
}

/** 그 경기에 뛴 사람들 */
export interface MatchRoster {
  /** `usn` → `team_no` */
  teamOf: Map<string, string>
  /** 관측된 팀 번호 (정렬됨) */
  teams: string[]
  /** 팀별 인원 */
  sizeOf: Map<string, number>
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 ? n : null
}

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/**
 * `"MM:SS"` → 초. 형식이 아니면 `null` 이다.
 *
 * **`0` 으로 만들지 않는다.** 0초는 "경기 시작 순간" 이라는 실제 값이라,
 * 못 읽은 줄을 0으로 두면 그 줄이 그 라운드의 **첫 죽음**으로 올라간다.
 */
export function secondsOf(value: unknown): number | null {
  const text = str(value)
  if (text === null) return null
  const parts = text.split(':')
  if (parts.length !== 2) return null
  const mm = Number(parts[0])
  const ss = Number(parts[1])
  if (!Number.isInteger(mm) || !Number.isInteger(ss)) return null
  if (mm < 0 || ss < 0 || ss > 59) return null
  return mm * 60 + ss
}

/**
 * 그 경기에 뛴 사람과 소속 팀.
 *
 * 이벤트의 주체·상대 **양쪽 모두**를 훑는다. 킬은 반드시 양 팀이 한 명씩 얽히므로
 * 한 클랜만 조회해도 상대 5명이 함께 실려 온다 (D-184 실측: 경기당 10명).
 *
 * 같은 사람이 두 팀으로 나오면(응답이 어긋났다는 뜻) 그 사람을 **버린다** —
 * 다수결로 정하지 않는다 (D-106).
 */
export function rosterOf(events: readonly RoundStateEvent[]): MatchRoster {
  const seen = new Map<string, Set<string>>()
  const put = (usn: string | null, team: string | null) => {
    if (usn === null || team === null) return
    if (!seen.has(usn)) seen.set(usn, new Set())
    seen.get(usn)?.add(team)
  }
  for (const event of events) {
    put(str(event.str_usn), str(event.team_no))
    put(str(event.target_str_usn), str(event.target_team_no))
  }

  const teamOf = new Map<string, string>()
  const sizeOf = new Map<string, number>()
  for (const [usn, teams] of seen) {
    if (teams.size !== 1) continue
    const team = [...teams][0] as string
    teamOf.set(usn, team)
    sizeOf.set(team, (sizeOf.get(team) ?? 0) + 1)
  }
  return { teamOf, teams: [...sizeOf.keys()].sort(), sizeOf }
}

/**
 * 이 경기로 라운드를 복원해도 되는가.
 *
 * 팀이 정확히 둘이고, 양 팀이 각각 `teamSize` 명이어야 한다.
 * 한 명이라도 모자라면 그 사람의 죽음을 못 보고 지나칠 수 있고,
 * 그러면 "혼자 남았다" 판정이 통째로 거짓이 된다.
 */
export function isRestorable(roster: MatchRoster, teamSize: number): boolean {
  if (roster.teams.length !== 2) return false
  return roster.teams.every((team) => roster.sizeOf.get(team) === teamSize)
}

/**
 * 라운드마다 죽은 순서.
 *
 * 한 킬이 두 줄로 올 수 있다 — 죽인 쪽과 죽은 쪽이 **둘 다 조회 클랜**이면 그렇다.
 * `라운드 + 죽은 사람 + 시각` 으로 같은 죽음을 하나로 본다.
 */
export function roundStatesOf(events: readonly RoundStateEvent[]): Map<number, RoundState> {
  const byRound = new Map<number, RoundState>()
  const seen = new Set<string>()

  for (const event of events) {
    const round = num(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue

    /* 죽은 쪽이 주체인가 상대인가. 둘 다이거나 둘 다 아니면 읽을 수 없는 줄이다 */
    const subjectDied = str(event.event_type) === 'death'
    const targetDied = str(event.target_event_type) === 'death'
    if (subjectDied === targetDied) continue

    const usn = subjectDied ? str(event.str_usn) : str(event.target_str_usn)
    const team = subjectDied ? str(event.team_no) : str(event.target_team_no)
    if (usn === null || team === null) continue

    const key = round + ':' + usn + ':' + at
    if (seen.has(key)) continue
    seen.add(key)

    if (!byRound.has(round)) byRound.set(round, { round, deaths: [] })
    byRound.get(round)?.deaths.push({ usn, team, at })
  }

  for (const state of byRound.values()) {
    state.deaths.sort((a, b) => a.at - b.at)
    /* **한 라운드에서 한 사람은 한 번만 죽는다.**
       위 `seen` 은 시각까지 같아야 걸러 내는데, 한 경기를 두 클랜이 각각 보내면
       같은 죽음의 `event_time` 이 1초 어긋나 들어오는 일이 있다. 그러면 그 사람이
       두 번 죽은 것이 되어 **없던 세이브가 만들어진다** — 적게 세는 쪽이 아니라
       많이 세는 쪽으로 틀리므로 D-106 원칙 자체를 어긴다.
       가장 이른 죽음만 남긴다 (이미 시각순으로 정렬돼 있다). */
    const once = new Set<string>()
    state.deaths = state.deaths.filter((death) => {
      if (once.has(death.usn)) return false
      once.add(death.usn)
      return true
    })
  }
  return byRound
}

/* -------------------------------------------------------------------------- */
/* 축 계산                                                                      */
/* -------------------------------------------------------------------------- */

/** 한 선수의 라운드 집계 */
export interface RoundTally {
  /** 혼자 남은 라운드 수 */
  alone: number
  /** 그중 이긴 라운드 수 */
  aloneWon: number
  /** 본인 포함 둘이 남은 라운드 수 (**2:1 은 세지 않는다**) */
  outnumbered: number
  /** 그중 이긴 라운드 수 */
  outnumberedWon: number
}

const EMPTY_TALLY: RoundTally = { alone: 0, aloneWon: 0, outnumbered: 0, outnumberedWon: 0 }

/**
 * 한 경기에서 그 선수의 세이브·소수싸움 재료를 센다.
 *
 * `wonRound` 는 **그 선수 팀 기준**으로 그 라운드를 이겼는지 돌려주는 함수다.
 * 모르면 `null` 을 주면 되고, 그 라운드는 이긴 쪽으로 세지 않는다.
 * 분모(`alone` · `outnumbered`)에는 남는다 — 그 상황이 있었던 것은 사실이다.
 *
 * 경기가 복원 불가면 `null` 이다. **0 을 돌려주지 않는다** — 0회는 "겪었는데 없었다"
 * 이고 지금은 "셀 수 없다" 이다 (D-106).
 */
export function roundTallyOf(input: {
  events: readonly RoundStateEvent[]
  usn: string
  teamSize: number
  wonRound: (round: number) => boolean | null
}): RoundTally | null {
  const roster = rosterOf(input.events)
  if (!isRestorable(roster, input.teamSize)) return null

  const myTeam = roster.teamOf.get(input.usn)
  if (myTeam === undefined) return null
  const foeTeam = roster.teams.find((team) => team !== myTeam)
  if (foeTeam === undefined) return null

  const tally: RoundTally = { ...EMPTY_TALLY }

  for (const state of roundStatesOf(input.events).values()) {
    const mine = state.deaths.filter((death) => death.team === myTeam)
    const theirs = state.deaths.filter((death) => death.team === foeTeam)
    /* 팀 인원보다 많이 죽었다 = 응답이 어긋났다. 그 라운드는 통째로 버린다 */
    if (mine.length > input.teamSize || theirs.length > input.teamSize) continue

    const myDeath = mine.find((death) => death.usn === input.usn)
    const mates = mine.filter((death) => death.usn !== input.usn)
    /* 본인이 죽었다면 **동료들이 다 죽은 뒤**여야 그 상황을 겪은 것이다 */
    const survivedUntil = myDeath === undefined ? Number.POSITIVE_INFINITY : myDeath.at

    /* `event_time` 은 `MM:SS` 라 **초 단위**다. 동료와 내가 같은 초에 죽었으면
       누가 먼저인지 알 수 없고, 그 한 명 때문에 `혼자 남음` 과 `둘이 남음` 이
       서로 뒤바뀐다. 모르는 것을 어느 쪽으로도 밀지 않는다 — 그 라운드를 버린다 */
    if (mates.some((death) => death.at === survivedUntil)) continue

    const matesDeadBefore = mates.filter((death) => death.at < survivedUntil).length

    const won = input.wonRound(state.round)

    /* 혼자 남았다 — 동료 전원이 본인보다 먼저 죽었다.
       1대1 이든 1대5 든 전부 세이브 상황이다.
       넥슨의 `save_cnt` 는 1대3 이상만 세므로 쓰지 않는다 (사양 4절) */
    if (matesDeadBefore === input.teamSize - 1) {
      tally.alone += 1
      if (won === true) tally.aloneWon += 1
      continue
    }

    /* 둘이 남았다 — 동료가 한 명만 남은 시점이 있었다.
       **2:1 은 세지 않는다.** 우리가 유리한 상황이라 능력의 증거가 아니다 (사양 4절) */
    if (matesDeadBefore === input.teamSize - 2) {
      const times = mates
        .filter((death) => death.at < survivedUntil)
        .map((death) => death.at)
        .sort((a, b) => a - b)
      /* 마지막으로 죽은 동료의 시각 — 그 순간부터 우리 팀은 둘이다 */
      const at = times.at(-1)
      if (at === undefined) continue
      /* 같은 초에 죽은 상대는 **죽은 것으로 센다.** 그래야 `2:1 은 세지 않는다` 가
         초 단위 해상도에서도 지켜진다 — 살아 있는 쪽으로 세면 2:1 이 2:2 로 잡힌다 */
      const foesAlive = input.teamSize - theirs.filter((death) => death.at <= at).length
      if (foesAlive < 2) continue
      tally.outnumbered += 1
      if (won === true) tally.outnumberedWon += 1
    }
  }

  return tally
}

/**
 * **매치의 사나이** — 마지막 라운드에서 킬을 가장 많이 한 선수 (사양 4절 · 6절).
 *
 * 20분 초과 판정은 여기서 하지 않는다. 플레이시간은 이벤트가 아니라 경기 정보에 있고
 * 넥슨이 안 주는 경기도 있다 (D-034). 부르는 쪽이 판단해서 넘긴다.
 *
 * 동률이면 `null` 이다 — **찍지 않는다** (사양 6절 "동률이면 찍지 않는다").
 * 마지막 라운드에 킬이 하나도 없어도 `null` 이다.
 */
export function lastRoundTopKiller(events: readonly RoundStateEvent[]): string | null {
  const kills = new Map<number, Map<string, number>>()
  const seen = new Set<string>()

  for (const event of events) {
    const round = num(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue

    const subjectKilled = str(event.event_type) === 'kill'
    const targetKilled = str(event.target_event_type) === 'kill'
    if (subjectKilled === targetKilled) continue

    const killer = subjectKilled ? str(event.str_usn) : str(event.target_str_usn)
    const dead = subjectKilled ? str(event.target_str_usn) : str(event.str_usn)
    if (killer === null || dead === null) continue

    /* 같은 죽음이 두 줄로 올 수 있다 — 죽은 사람 기준으로 한 번만 센다 */
    const key = round + ':' + dead + ':' + at
    if (seen.has(key)) continue
    seen.add(key)

    if (!kills.has(round)) kills.set(round, new Map())
    const perRound = kills.get(round) as Map<string, number>
    perRound.set(killer, (perRound.get(killer) ?? 0) + 1)
  }

  if (kills.size === 0) return null
  const last = Math.max(...kills.keys())
  const perRound = kills.get(last)
  if (!perRound || perRound.size === 0) return null

  let top: string | null = null
  let best = 0
  let tied = false
  for (const [usn, count] of perRound) {
    if (count > best) {
      best = count
      top = usn
      tied = false
    } else if (count === best) {
      tied = true
    }
  }
  return tied ? null : top
}
