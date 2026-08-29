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
 * ── 모르는 라운드를 채우지 않는다
 *   폭탄이 없는 라운드는 그냥 모른다. **교대가 한 번뿐이라는 성질**을 써서
 *   앞뒤로 넓히기는 하지만, 근거가 양쪽에서 어긋나면 `null` 로 둔다 (D-106).
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

/**
 * 한 경기에서 **그 팀**의 라운드별 진영을 정한다.
 *
 * 폭탄이 있는 라운드만 직접 알 수 있다. 나머지는 **교대가 한 번뿐**이라는 성질로 채운다 —
 * 전반 내내 한 진영, 후반 내내 반대 진영이다.
 *
 * 근거가 "전반에 공격이었다가 다시 전반에 수비" 처럼 어긋나면 **아무것도 확정하지 않는다.**
 * 억지로 다수결하지 않는다 — 틀린 진영으로 네 축을 계산하면 조용히 거짓이 된다.
 */
export function roundSidesOf(
  events: readonly RoundSideEvent[],
  teamNo: string,
  totalRounds: number,
): RoundSideMap {
  const evidence = bombEvidenceOf(events).filter((row) => row.team === teamNo)
  if (evidence.length === 0) return EMPTY

  /* 라운드마다 직접 아는 진영. 같은 라운드에 설치와 해체가 둘 다 있으면 모순이다 */
  const known = new Map<number, RoundSide>()
  for (const row of evidence) {
    const side: RoundSide = row.action === 'install' ? 'attack' : 'defense'
    const seen = known.get(row.round)
    if (seen !== undefined && seen !== side) {
      return { side: new Map(), switchRound: null, bracket: null, conflict: true }
    }
    known.set(row.round, side)
  }

  const rounds = [...known.keys()].sort((a, b) => a - b)
  const firstSide = known.get(rounds[0] as number) as RoundSide

  /* 앞에서부터 같은 진영이 이어지다 한 번 바뀌고, 그 뒤로는 다시 안 바뀌어야 한다 */
  let switchAt: number | null = null
  for (const round of rounds) {
    const side = known.get(round) as RoundSide
    if (switchAt === null) {
      if (side !== firstSide) switchAt = round
    } else if (side === firstSide) {
      /* 바뀐 뒤에 원래 진영이 또 나왔다 — 교대가 한 번이라는 전제가 깨진다 */
      return { side: new Map(), switchRound: null, bracket: null, conflict: true }
    }
  }

  if (switchAt === null) {
    /* 아직 교대를 못 봤다. 아는 라운드만 돌려준다 — 나머지를 지어내지 않는다 */
    return { side: new Map(known), switchRound: null, bracket: null, conflict: false }
  }

  const lastBefore = Math.max(...rounds.filter((r) => r < switchAt))
  const side = new Map<number, RoundSide>()
  const flipped: RoundSide = firstSide === 'attack' ? 'defense' : 'attack'
  for (let round = 1; round <= Math.max(totalRounds, switchAt); round += 1) {
    if (round <= lastBefore) side.set(round, firstSide)
    else if (round >= switchAt) side.set(round, flipped)
    /* lastBefore 와 switchAt 사이는 **비워 둔다.** 어디서 바뀌었는지 모른다 */
  }

  return {
    side,
    switchRound: switchAt,
    bracket: [lastBefore, switchAt],
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
