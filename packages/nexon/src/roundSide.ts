/**
 * 라운드마다 **어느 팀이 공격이었나** — 폭탄 이벤트로 되짚는다 (D-184).
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다.
 *
 * ── 왜 필요한가
 *   `docs/PLAYER_TRAITS_SPEC.md` 8절의 플레이스타일 바는 **블루=수비 / 레드=공격**이고
 *   (D-182), 그 진영으로 뛴 라운드만 골라서 재야 한다.
 *   그런데 `Match` 의 red/blue 클랜은 **경기 단위** 값이라 라운드별 진영을 알 수 없다.
 *
 * ── 왜 `team_no` 로는 안 되나 (2026-08-29 실측)
 *   클랜 단위 배틀로그에 `team_no` 가 있어서 이걸로 될 줄 알았는데 아니었다.
 *   같은 응답의 `teamList` 가 `team_no 0 → clan_no A`, `team_no 1 → clan_no B` 로
 *   짝지어 준다. 즉 **`team_no` 는 클랜 번호지 진영이 아니다.**
 *   실제로 14라운드 내내 선수 13명 전원의 `team_no` 가 한 번도 바뀌지 않았다.
 *
 * ── 그래서 폭탄을 본다
 *   폭파미션이므로 규칙 자체가 진영을 말해 준다.
 *
 *     C4 설치(`c4-install`)   → 그 라운드에 그 팀은 **공격**
 *     C4 해체(`c4-dismantle`) → 그 라운드에 그 팀은 **수비**
 *
 *   실측(경기 `260820162642124001`): team 1 이 4라운드에 해체(수비),
 *   10·11라운드에 설치(공격). 14라운드 경기이므로 전·후반 교대와 앞뒤가 맞는다.
 *
 * ── 상대 팀의 폭탄도 **우리** 근거다 (D-208)
 *   폭파미션은 한 라운드에 공격이 **한 팀뿐**이다. 그러니 상대가 심었으면 우리는 수비,
 *   상대가 해체했으면 우리는 공격이다. 예전에는 자기 팀 줄만 남기고 나머지를 버려서
 *   근거의 3분의 2가 그냥 사라졌다.
 *
 *   실측(2026-08-30 · 클랜-경기 6,989쌍): 교대를 확인한 쌍이
 *   자기 팀 근거만 1,035쌍(14.8%) → 상대 것까지 3,747쌍(53.6%).
 *
 * ── 전반은 **한 팀이 5라운드를 따면** 끝난다 (D-208)
 *   `switchAt = (누적 라운드 승수가 처음 5가 되는 라운드) + 1`.
 *   실측에서 반례가 없었다 — 전반 마지막 라운드의 최고 누적 승수가 190/190 정확히 5였고,
 *   그 규칙으로 예측한 교대 지점이 190/190 적중했으며, 폭탄 브래킷과도 2,964/2,964 ·
 *   4,854/4,854 로 어긋나지 않았다. 4승 규칙과 6승 규칙은 각각 0% 였다.
 *
 *   **총 라운드 수로는 설명되지 않는다.** "9라운드 뒤 교대" 는 틀렸다 — 교대가 10라운드에
 *   몰려 보인 건 5:4 가 가장 흔한 전반 스코어여서다. 같은 총 라운드에서도 교대 지점이
 *   세 가지로 갈렸다.
 *
 * ── 모르는 라운드를 채우지 않는다
 *   폭탄이 없는 라운드는 그냥 모른다. **교대가 한 번뿐이라는 성질**과 위의 5승 규칙으로
 *   앞뒤로 넓히기는 하지만, 근거가 양쪽에서 어긋나면 `null` 로 둔다 (D-106).
 *
 *   **`K라운드 이하면 채운다` 는 쓰지 않는다.** 간격은 교대 지점을 정하는 값이 아니다.
 *   그리고 **진영의 방향은 끝까지 폭탄이 정한다** — 5승 규칙은 *어디서* 바뀌는지만 말한다.
 *   폭탄 근거가 하나도 없는 쌍은 비워 둔다. `team_no` 순서를 후퇴값으로 쓰지 않는다
 *   (반례가 실제로 있다).
 */

/** 진영. 원본 표기를 그대로 쓴다 — `공격` 은 폭탄을 심는 쪽이다 */
export type RoundSide = 'attack' | 'defense'

/** 폭탄 근거 한 건 */
export interface BombEvidence {
  round: number
  /** 그 행동을 한 팀 (`team_no`). 클랜 응답의 팀 번호 그대로다 */
  team: string
  /** `install` 이면 그 팀이 공격, `dismantle` 이면 수비 */
  action: 'install' | 'dismantle'
}

export interface RoundSideEvent {
  round?: number | string | null
  weapon?: string | null
  target_weapon?: string | null
  team_no?: number | string | null
  target_team_no?: number | string | null
  event_type?: string | null
  target_event_type?: string | null
}

/**
 * 라운드 번호. **`null` 과 빈 문자열을 0 으로 만들지 않는다.**
 *
 * `Number(null)` 도 `Number('')` 도 `0` 이고 `0` 은 유한수다. 그대로 두면
 * "라운드를 모르는 줄" 이 전부 **0라운드**라는 있지도 않은 라운드로 들어간다.
 * 라운드는 1부터다.
 */
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
 * 이벤트에서 폭탄 근거만 뽑는다.
 *
 * 행위자가 어느 쪽 칸에 실리는지 응답마다 다르다 — 킬 로그는 `team_no` 가 행위자지만,
 * 폭탄 줄은 행위자가 `target_*` 에 실려 오는 경우가 있다(실측: `event_type` 이 빈 문자열이고
 * `target_weapon: "c4-install"` · `target_team_no: "1"`). **둘 다 본다.**
 * 무기 칸과 팀 칸을 **짝지어서** 읽는다 — 엇갈려 읽으면 진영이 뒤집힌다.
 */
export function bombEvidenceOf(events: readonly RoundSideEvent[]): BombEvidence[] {
  const out: BombEvidence[] = []
  for (const event of events) {
    const round = num(event.round)
    if (round === null) continue
    for (const [weaponKey, teamKey] of [
      ['weapon', 'team_no'],
      ['target_weapon', 'target_team_no'],
    ] as const) {
      const weapon = str(event[weaponKey])
      if (weapon !== 'c4-install' && weapon !== 'c4-dismantle') continue
      const team = str(event[teamKey])
      if (team === null) continue
      out.push({ round, team, action: weapon === 'c4-install' ? 'install' : 'dismantle' })
    }
  }
  return out
}

export interface RoundSideMap {
  /** 라운드 → 그 팀의 진영. 모르는 라운드는 담기지 않는다 */
  side: Map<number, RoundSide>
  /**
   * 진영이 바뀐 첫 라운드. 모르면 `null`.
   *
   * `switchRound` 부터 후반이다 — 그 앞은 전반이다.
   */
  switchRound: number | null
  /** 좁혀진 구간 `[마지막 전반 라운드, 첫 후반 라운드]`. 확정이면 두 값이 붙어 있다 */
  bracket: [number, number] | null
  /** 근거가 서로 어긋났다 — 이때는 아무것도 확정하지 않는다 */
  conflict: boolean
}

const EMPTY: RoundSideMap = { side: new Map(), switchRound: null, bracket: null, conflict: false }

const conflicted = (): RoundSideMap => ({
  side: new Map(),
  switchRound: null,
  bracket: null,
  conflict: true,
})

const other = (side: RoundSide): RoundSide => (side === 'attack' ? 'defense' : 'attack')

/* ============================================== 전반 종료 — 5승 규칙 (D-208) === */

/**
 * 전반은 **한 팀이 라운드 5승을 채우면** 끝난다 (2026-08-30 실측 · 반례 0건).
 */
export const HALF_WIN_TARGET = 5

/**
 * 전반 마지막 라운드의 상한. 한 팀이 5승을 채우기까지 아무리 늘어져도 9라운드다
 * (4:4 다음 라운드에 반드시 한쪽이 5가 된다).
 */
export const MAX_FIRST_HALF_ROUNDS = HALF_WIN_TARGET * 2 - 1

/** 전반 마지막 라운드 `e` 가 들어갈 수 있는 구간 `[lo, hi]` */
export interface HalfEndBounds {
  lo: number
  hi: number
}

/**
 * 라운드 승패로 **전반 마지막 라운드** `e` 를 좁힌다. 교대는 `e + 1` 이다.
 *
 * 승패를 1..T 전부 알면 `lo === hi` 로 딱 떨어진다. 구멍이 있으면 **모르는 라운드를
 * 양극단으로 놓아** 구간을 만든다 — 채우지 않고 구간으로 다룬다 (D-106).
 *
 *   `lo`  아직 모르는 라운드를 전부 한쪽에 몰아주면 가장 빨리 5승이 되는 라운드
 *   `hi`  양쪽을 최대한 4승 이하로 붙들 수 있는 마지막 라운드 + 1
 *
 * **정보가 없으면 구간을 좁히지 않는다.** 아무도 5승에 닿지 못하는 짧은 경기
 * (몰수·기권 등)에서는 `lo = 1`, `hi = T` 로 두어 폭탄 근거를 방해하지 않는다.
 * 여기서 `e = T` 라고 단정하면 실제로 교대가 있었던 경기를 모순으로 몰아 버린다.
 */
export function halfEndBoundsOf(
  wonRound: (round: number) => boolean | null,
  totalRounds: number,
): HalfEndBounds {
  if (totalRounds < 1) return { lo: 1, hi: 1 }

  let won = 0
  let lost = 0
  let unknown = 0
  /** 어느 한쪽이 5승에 **닿을 수 있는** 가장 이른 라운드 */
  let reach: number | null = null
  /** 양쪽 다 4승 이하로 붙들 수 있는 마지막 라운드 */
  let open = 0

  for (let round = 1; round <= totalRounds; round += 1) {
    const result = wonRound(round)
    if (result === true) won += 1
    else if (result === false) lost += 1
    else unknown += 1

    if (
      reach === null &&
      (won + unknown >= HALF_WIN_TARGET || lost + unknown >= HALF_WIN_TARGET)
    ) {
      reach = round
    }
    /* 라운드 수가 9에 닿으면 모르는 라운드를 어떻게 나눠도 한쪽이 5승이다 */
    if (round < MAX_FIRST_HALF_ROUNDS && won < HALF_WIN_TARGET && lost < HALF_WIN_TARGET) {
      open = round
    }
  }

  return { lo: reach ?? 1, hi: Math.min(open + 1, totalRounds) }
}

/**
 * 한 경기에서 **그 팀**의 라운드별 진영을 정한다.
 *
 * 근거는 둘이고, 하는 일이 다르다.
 *
 *   폭탄     진영의 **방향**을 정한다 (설치=공격 · 해체=수비). 상대 팀 줄은 **뒤집어서** 쓴다
 *   5승 규칙 교대가 **어디서** 일어났는지를 정한다 (`switchAt = 5승 도달 라운드 + 1`)
 *
 * 둘을 **교집합**한다. 폭탄이 좁힌 구간과 승수가 좁힌 구간이 겹치는 자리만 남기고,
 * 겹치는 곳이 없으면 아무것도 확정하지 않는다.
 *
 * 근거가 "전반에 공격이었다가 다시 전반에 수비" 처럼 어긋나도 마찬가지다.
 * 억지로 다수결하지 않는다 — 틀린 진영으로 여섯 축을 계산하면 조용히 거짓이 된다.
 *
 * `wonRound` 는 **그 팀 기준**의 라운드 승패다 (`roundResultsOf`). 주지 않으면 5승 규칙
 * 없이 폭탄만으로 판정한다 — 예전과 같은 결과가 나온다.
 */
export function roundSidesOf(
  events: readonly RoundSideEvent[],
  teamNo: string,
  totalRounds: number,
  wonRound?: (round: number) => boolean | null,
): RoundSideMap {
  const evidence = bombEvidenceOf(events)
  /* 폭탄이 없으면 방향을 알 길이 없다. `team_no` 순서를 후퇴값으로 쓰지 않는다 (D-208) */
  if (evidence.length === 0) return EMPTY
  /* 팀이 셋 이상이면 "상대" 를 특정할 수 없다 — 뒤집기가 성립하지 않는다 */
  if (new Set(evidence.map((row) => row.team)).size > 2) return conflicted()

  /* 라운드마다 직접 아는 진영. 상대 팀 줄은 뒤집는다 — 공격은 한 라운드에 한 팀뿐이다.
     같은 라운드에서 두 근거가 반대를 가리키면 모순이다 */
  const known = new Map<number, RoundSide>()
  for (const row of evidence) {
    const actor: RoundSide = row.action === 'install' ? 'attack' : 'defense'
    const side: RoundSide = row.team === teamNo ? actor : other(actor)
    const seen = known.get(row.round)
    if (seen !== undefined && seen !== side) return conflicted()
    known.set(row.round, side)
  }

  const rounds = [...known.keys()].sort((a, b) => a - b)
  const limit = Math.max(totalRounds, rounds[rounds.length - 1] as number)
  const firstSide = known.get(rounds[0] as number) as RoundSide

  /** 폭탄이 허용하는 `(전반 진영, e 구간)` 후보들 */
  const candidates: { first: RoundSide; lo: number; hi: number }[] = []

  if (new Set(known.values()).size === 2) {
    /* 교대를 직접 봤다. 앞에서부터 한 진영이 이어지다 한 번 바뀌고 다시 안 바뀌어야 한다 */
    let flipAt: number | null = null
    for (const round of rounds) {
      const side = known.get(round) as RoundSide
      if (flipAt === null) {
        if (side !== firstSide) flipAt = round
      } else if (side === firstSide) {
        /* 바뀐 뒤에 원래 진영이 또 나왔다 — 교대가 한 번이라는 전제가 깨진다 */
        return conflicted()
      }
    }
    const at = flipAt as number
    candidates.push({ first: firstSide, lo: Math.max(...rounds.filter((r) => r < at)), hi: at - 1 })
  } else {
    /* 한쪽 진영만 봤다. 그 근거가 **전반**인지 **후반**인지는 폭탄만으로 못 가른다.
       두 가설을 다 세워 두고, 5승 규칙이 하나를 떨어뜨려 주기를 기다린다 */
    const lowest = rounds[0] as number
    const highest = rounds[rounds.length - 1] as number
    candidates.push({ first: firstSide, lo: highest, hi: limit })
    candidates.push({ first: other(firstSide), lo: 1, hi: lowest - 1 })
  }

  const bounds = wonRound ? halfEndBoundsOf(wonRound, limit) : { lo: 1, hi: limit }
  const viable = candidates
    .map((row) => ({
      first: row.first,
      lo: Math.max(row.lo, bounds.lo),
      hi: Math.min(row.hi, bounds.hi),
    }))
    .filter((row) => row.lo <= row.hi)

  /* 폭탄과 승수가 서로를 부정한다 — 아무것도 확정하지 않는다 */
  if (viable.length === 0) return conflicted()
  /* 방향을 못 골랐다. 아는 라운드만 돌려준다 — 나머지를 지어내지 않는다 */
  if (viable.length > 1) {
    return { side: new Map(known), switchRound: null, bracket: null, conflict: false }
  }

  const pick = viable[0] as { first: RoundSide; lo: number; hi: number }
  const second = other(pick.first)
  const side = new Map<number, RoundSide>()
  for (let round = 1; round <= limit; round += 1) {
    if (round <= pick.lo) side.set(round, pick.first)
    else if (round > pick.hi) side.set(round, second)
    /* `lo` 와 `hi` 사이는 **비워 둔다.** 어디서 바뀌었는지 아직 모른다 */
  }

  return {
    side,
    switchRound: pick.hi + 1,
    bracket: [pick.lo, pick.hi + 1],
    conflict: false,
  }
}

/* ================================================== 라운드 승패 (win_flag) === */

export interface RoundResultEvent {
  round?: number | string | null
  /** `"win"` | `"lose"` — **조회한 클랜 기준**이다 */
  win_flag?: string | null
  /** 폭탄 줄에만 붙는다. 이 줄의 `win_flag` 는 행위자 기준이라 섞으면 안 된다 */
  win_team_no?: number | string | null
  weapon?: string | null
  target_weapon?: string | null
}

/**
 * 라운드마다 **조회한 클랜이 이겼는가** (D-184).
 *
 * ── 왜 `win_flag` 를 그냥 못 쓰나
 *   대부분의 라운드는 그 라운드의 모든 줄이 같은 `win_flag` 를 갖는다(실측 14라운드 중 11개).
 *   그런데 **폭탄 줄만 기준이 다르다** — 그 줄의 `win_flag` 는 폭탄을 만진 사람 기준이라
 *   조회 클랜이 진 라운드에서도 `"win"` 으로 온다.
 *   실측 경기에서 값이 갈린 라운드는 4·10·11 이었고, 그 셋이 정확히 폭탄이 있는 라운드다.
 *
 *   그래서 **폭탄 줄을 빼고** 본다. 빼고도 값이 갈리면 그 라운드는 `null` 이다 —
 *   다수결로 밀어 넣지 않는다 (D-106).
 */
export function roundResultsOf(events: readonly RoundResultEvent[]): Map<number, boolean | null> {
  const byRound = new Map<number, Set<string>>()
  for (const event of events) {
    const round = num(event.round)
    if (round === null) continue
    /* 폭탄 줄은 기준이 다르다 — 뺀다 */
    const weapon = str(event.weapon)
    const targetWeapon = str(event.target_weapon)
    const isBomb =
      weapon === 'c4-install' ||
      weapon === 'c4-dismantle' ||
      targetWeapon === 'c4-install' ||
      targetWeapon === 'c4-dismantle'
    if (isBomb) continue
    const flag = str(event.win_flag)
    if (flag !== 'win' && flag !== 'lose') continue
    if (!byRound.has(round)) byRound.set(round, new Set())
    byRound.get(round)?.add(flag)
  }

  const out = new Map<number, boolean | null>()
  for (const [round, flags] of byRound) {
    out.set(round, flags.size === 1 ? flags.has('win') : null)
  }
  return out
}

/** `teamList` 한 줄 — 클랜 응답 최상위에 온다 */
export interface TeamListEntry {
  team_no?: number | string | null
  clan_no?: number | string | null
}

/**
 * `team_no` → 클랜 번호. **이것이 `team_no` 가 진영이 아니라는 증거다.**
 *
 * 이 짝을 확인하지 않고 `team_no` 를 레드/블루로 읽으면 경기 절반이 뒤집힌다.
 */
export function clanByTeamNo(teamList: readonly TeamListEntry[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const entry of teamList) {
    const team = str(entry.team_no)
    const clan = str(entry.clan_no)
    if (team !== null && clan !== null) out.set(team, clan)
  }
  return out
}
