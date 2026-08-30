/**
 * 스나수의 두 축 — **스나싸움**과 **작업 성공률** (D-195 · 사양 4절 2번·5번).
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다. `roundState.ts` 의 형제 모듈이다.
 *
 * ── 두 축이 무엇인가 (사양 4절)
 *
 *     스나싸움     스나싸움 구역에서 **상대 스나와** 벌인 교전의 성과
 *     작업 성공률  스나수가 **상대 라플을** 잡는 비율
 *
 *   둘 다 "상대가 그 경기에서 무슨 무기를 들었나" 를 알아야 한다.
 *   스나끼리 싸우는 것과 라플을 잡는 것은 다른 능력이라 축을 나눈 것이다.
 *
 * ── 상대 무기를 어디서 아는가 — **사양과 다른 길을 택했다**
 *   사양은 우리 DB(`MatchPlayerStat.weapon`)에서 읽으라고 한다. 그런데 수집한
 *   배틀로그 2,449경기 중 우리 `Match` 표에 있는 것이 **344건(14%)뿐**이다.
 *   그것만 쓰면 이 두 축이 사실상 아무에게도 안 붙는다.
 *
 *   그래서 **킬로그에서 직접 되짚는다.** 킬 한 건마다 죽인 사람이 든 무기가 찍혀 있으므로
 *   (`weapon` / `target_weapon`), 그 경기에서 그 사람의 킬들을 모으면 무기가 나온다.
 *   D-114 의 무기 판정이 쓰는 것과 같은 신호다.
 *
 *   ⚠ **킬이 없는 선수의 무기는 모른다.** 죽기만 한 선수는 알 수 없다.
 *   그때는 `null` 이고, 그 교전은 분모에도 넣지 않는다 — 모르는 것을 라플로도
 *   스나로도 세지 않는다 (D-106).
 *
 * ── 겹치는 344경기로 **교차검산한다**
 *   우리 DB 에 무기가 있는 경기에서는 두 값이 같아야 한다. 부르는 쪽이
 *   `weaponAgreementOf()` 로 재고, 어긋나면 이 길을 쓰지 않는다.
 */

/** `0 = 라이플` · `1 = 스나이퍼`. 프로젝트 전체가 쓰는 표기 그대로다 */
export type Weapon = 0 | 1

/** 킬로그에서 무기 판정에 쓰는 키 (D-114 와 같다) */
const KILL_KEY = { rifle: 'riple', sniper: 'sniper' } as const

export interface DuelEvent {
  round?: number | string | null
  event_type?: string | null
  target_event_type?: string | null
  /** 주체가 든 무기 (주체가 죽인 줄일 때 찍힌다) */
  weapon?: string | null
  /** 상대가 든 무기 (상대가 죽인 줄일 때 찍힌다) */
  target_weapon?: string | null
  str_usn?: string | null
  target_str_usn?: string | null
  event_time?: string | null
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

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** 킬 한 건 — 누가 무엇으로 누구를 어디서 잡았나 */
export interface KillRecord {
  round: number | null
  killer: string
  victim: string
  /** 죽인 쪽이 든 무기. `riple`/`sniper` 가 아니면 `null` (수류탄·근접 등) */
  weapon: Weapon | null
  /** 죽인 사람이 서 있던 자리 */
  at: { x: number; y: number } | null
}

/**
 * 이벤트에서 킬을 뽑는다.
 *
 * 한 줄이 킬 하나를 양쪽에서 적는다 — `event_type` 이 `kill` 이면 주체가 죽인 것,
 * `death` 면 상대가 죽인 것이다. **죽인 쪽의 무기 칸을 짝지어 읽어야 한다.**
 * 엇갈려 읽으면 스나가 라플로 뒤집힌다.
 *
 * 같은 킬이 두 줄로 올 수 있으므로(양 클랜 응답을 합칠 때)
 * `라운드 + 죽은 사람 + 시각` 으로 한 번만 센다.
 */
export function killsOf(events: readonly DuelEvent[]): KillRecord[] {
  const out: KillRecord[] = []
  const seen = new Set<string>()

  for (const event of events) {
    const subjectKilled = str(event.event_type) === 'kill'
    const targetKilled = str(event.target_event_type) === 'kill'
    if (subjectKilled === targetKilled) continue

    const killer = subjectKilled ? str(event.str_usn) : str(event.target_str_usn)
    const victim = subjectKilled ? str(event.target_str_usn) : str(event.str_usn)
    if (killer === null || victim === null) continue

    /* 죽인 쪽의 무기 칸을 고른다 */
    const rawWeapon = subjectKilled ? str(event.weapon) : str(event.target_weapon)
    const weapon: Weapon | null =
      rawWeapon === KILL_KEY.sniper ? 1 : rawWeapon === KILL_KEY.rifle ? 0 : null

    const round = numOrNull(event.round)
    const key = `${round}:${victim}:${str(event.event_time) ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)

    /* 좌표는 **죽인 사람이 서 있던 자리**다. 구역 판정은 그 자리로 한다 */
    const x = numOrNull(event.kill_x)
    const y = numOrNull(event.kill_y)

    out.push({
      round: round !== null && Number.isInteger(round) && round >= 1 ? round : null,
      killer,
      victim,
      weapon,
      at: x === null || y === null ? null : { x, y },
    })
  }
  return out
}

/**
 * 그 경기에서 **각자 무슨 무기를 들었나** — 자기 킬로 되짚는다.
 *
 * 과반이 아니라 **더 많이 쓴 쪽**을 고른다. 같으면 `null` 이다 —
 * 반반인 사람을 한쪽으로 밀면 그 사람이 낀 교전이 통째로 거짓이 된다 (D-106).
 * 킬이 하나도 없는 사람은 아예 들어오지 않는다. **모르는 것은 모르는 채로 둔다.**
 */
export function weaponByPlayerOf(kills: readonly KillRecord[]): Map<string, Weapon> {
  const tally = new Map<string, [number, number]>()
  for (const kill of kills) {
    if (kill.weapon === null) continue
    const entry = tally.get(kill.killer) ?? [0, 0]
    entry[kill.weapon] += 1
    tally.set(kill.killer, entry)
  }

  const out = new Map<string, Weapon>()
  for (const [usn, [rifle, sniper]] of tally) {
    if (rifle === sniper) continue
    out.set(usn, sniper > rifle ? 1 : 0)
  }
  return out
}

/** 구역 판정 — `data/barracks/sniper-lane.json` 같은 셀 집합 */
export interface ZoneCells {
  /** 격자 한 칸의 크기 */
  cell: number
  /** `"x,y"` 형태의 칸 목록 */
  cells: readonly string[]
}

/** 그 좌표가 구역 안인가 */
export function inZone(zone: ZoneCells, point: { x: number; y: number } | null): boolean {
  if (!point) return false
  const key = `${Math.floor(point.x / zone.cell)},${Math.floor(point.y / zone.cell)}`
  return zoneSetOf(zone).has(key)
}

const zoneCache = new WeakMap<ZoneCells, Set<string>>()
function zoneSetOf(zone: ZoneCells): Set<string> {
  const cached = zoneCache.get(zone)
  if (cached) return cached
  const set = new Set(zone.cells)
  zoneCache.set(zone, set)
  return set
}

/** 한 선수의 두 축 재료 */
export interface DuelTally {
  /** 스나싸움 — 구역 안에서 상대 **스나**와 얽힌 교전 수 */
  snipeDuels: number
  /** 그중 이긴 것(내가 잡은 것) */
  snipeDuelWins: number
  /** 작업 — 상대 무기를 아는 내 킬 전체 */
  workKills: number
  /** 그중 상대가 **라플**이었던 것 */
  workRifleKills: number
}

const EMPTY: DuelTally = { snipeDuels: 0, snipeDuelWins: 0, workKills: 0, workRifleKills: 0 }

/**
 * 한 경기에서 그 선수의 스나싸움·작업 재료를 센다.
 *
 * **그 선수가 그 경기에서 스나를 들었을 때만 센다.** 라플 든 판의 킬을
 * 스나수 지표에 넣으면 무기가 섞인다 (사양 4절: 같은 무기끼리 견준다).
 * 무기를 모르면 `null` 이다 — 0 을 돌려주지 않는다 (D-106).
 *
 * ── 스나싸움을 어떻게 세나
 *   구역 안에서 **상대도 스나**인 교전만 본다. 내가 잡으면 이긴 것, 내가 죽으면 진 것이다.
 *   자리는 **죽인 쪽이 서 있던 자리**로 판정한다 — 구역은 "어디서 싸웠나" 를 말하는 것이고
 *   그 판정 기준을 킬과 데스에서 다르게 잡으면 같은 교전이 두 구역으로 갈린다.
 *
 * ── 작업 성공률을 어떻게 세나
 *   내 킬 중 **상대가 라플이었던 비율**이다. 구역을 보지 않는다 —
 *   사양이 자리를 걸지 않았다.
 */
export function duelTallyOf(input: {
  kills: readonly KillRecord[]
  weaponByPlayer: ReadonlyMap<string, Weapon>
  usn: string
  zone: ZoneCells
}): DuelTally | null {
  const mine = input.weaponByPlayer.get(input.usn)
  if (mine !== 1) return null

  const tally: DuelTally = { ...EMPTY }

  for (const kill of input.kills) {
    const isMyKill = kill.killer === input.usn
    const isMyDeath = kill.victim === input.usn
    if (!isMyKill && !isMyDeath) continue

    const other = isMyKill ? kill.victim : kill.killer
    const otherWeapon = input.weaponByPlayer.get(other)
    /* 상대 무기를 모르면 어느 분모에도 넣지 않는다 */
    if (otherWeapon === undefined) continue

    if (isMyKill) {
      tally.workKills += 1
      if (otherWeapon === 0) tally.workRifleKills += 1
    }

    if (otherWeapon === 1 && inZone(input.zone, kill.at)) {
      tally.snipeDuels += 1
      if (isMyKill) tally.snipeDuelWins += 1
    }
  }

  return tally
}

/**
 * 킬로그로 되짚은 무기가 **우리 DB 의 무기와 같은가** (교차검산).
 *
 * 우리 DB 에 무기가 있는 경기에서만 잴 수 있다. 두 값이 크게 어긋나면
 * 이 모듈의 전제("킬로그로 무기를 알 수 있다")가 틀린 것이므로 쓰면 안 된다.
 */
export function weaponAgreementOf(
  inferred: ReadonlyMap<string, Weapon>,
  known: ReadonlyMap<string, Weapon>,
): { compared: number; same: number; different: number; onlyInferred: number } {
  let compared = 0
  let same = 0
  let different = 0
  let onlyInferred = 0
  for (const [usn, value] of inferred) {
    const truth = known.get(usn)
    if (truth === undefined) {
      onlyInferred += 1
      continue
    }
    compared += 1
    if (truth === value) same += 1
    else different += 1
  }
  return { compared, same, different, onlyInferred }
}
