/**
 * 경기별 라플/스나 판정 — **순수 함수** (D-114).
 *
 * ── 왜 이제야 가능한가
 *   넥슨 Open API에는 무기 필드가 **없다**(D-097). 그건 그대로다.
 *   병영수첩 공개 BattleLog에는 있다. 그래서 병영수첩을 **보조 출처**로 쓴다.
 *   Open API가 1차 출처라는 것은 바뀌지 않는다.
 *
 * ── 두 가지 신호
 *   1. **킬 신호** — BattleLog의 무기 분류별 킬 수 (`riple` / `sniper`)
 *   2. **적중 신호** — 매치 상세의 AR / SR 적중 수
 *
 *   둘이 같은 답을 가리키면 그 답을 쓴다. **어긋나면 `unknown`이다.**
 *   하나만 있으면 그 하나로 정한다. 둘 다 없으면 `unknown`.
 *
 * ── 절대 하지 않는 것
 *   - 헤드샷률·딜량·킬수로 **추정하지 않는다** (D-097의 금지 규칙은 그대로다)
 *   - 선수에게 고정 포지션을 붙이지 않는다. 판정은 **경기 × 선수** 단위다
 *   - 권총·근접·투척·특수는 분모에서 **뺀다**. 라플/스나 판정의 근거가 아니다
 *   - 동률이면 찍지 않는다. `unknown`이 정답이다
 */

/** 무기 판정 결과. `null`이 아니라 명시적 상태로 남긴다 */
export type WeaponRole = 'rifle' | 'sniper' | 'unknown'

/** 우리 도메인의 무기 코드 (`0 = 라이플`, `1 = 스나이퍼`) */
export const WEAPON_CODE = { rifle: 0, sniper: 1 } as const

export interface WeaponSignals {
  /** BattleLog `riple` 킬 수 */
  rifleKills: number | null
  /** BattleLog `sniper` 킬 수 */
  sniperKills: number | null
  /** 매치 상세 AR 적중 수 */
  arHits: number | null
  /** 매치 상세 SR 적중 수 */
  srHits: number | null
}

export interface WeaponVerdict {
  role: WeaponRole
  /** 우리 도메인 코드. `unknown`이면 `null` */
  weapon: 0 | 1 | null
  /** 각 신호가 무엇을 가리켰는가 — 나중에 재검증할 수 있게 남긴다 */
  killSignal: WeaponRole
  hitSignal: WeaponRole
  /** 왜 그렇게 판정했는지 한 줄 */
  reason: string
}

export const WEAPON_CLASSIFIER_VERSION = 'weapon-v1-kills+hits'

/** 두 값 중 큰 쪽. 같거나 판단 근거가 없으면 `unknown` */
function decide(rifle: number | null, sniper: number | null): WeaponRole {
  if (rifle === null || sniper === null) return 'unknown'
  if (rifle === 0 && sniper === 0) return 'unknown'
  if (rifle === sniper) return 'unknown'
  return rifle > sniper ? 'rifle' : 'sniper'
}

/**
 * 한 선수의 한 경기 무기를 정한다.
 *
 * 킬 신호와 적중 신호가 **어긋나면 `unknown`** 이다. 둘 중 하나를 골라 이기게 하지 않는다 —
 * 틀린 분류는 그 선수의 포지션 기록을 통째로 오염시키고, 사용자는 그게 추정값인지 알 수 없다.
 */
export function classifyWeapon(signals: WeaponSignals): WeaponVerdict {
  const killSignal = decide(signals.rifleKills, signals.sniperKills)
  const hitSignal = decide(signals.arHits, signals.srHits)

  const both = (role: WeaponRole, reason: string): WeaponVerdict => ({
    role,
    weapon: role === 'rifle' ? WEAPON_CODE.rifle : role === 'sniper' ? WEAPON_CODE.sniper : null,
    killSignal,
    hitSignal,
    reason,
  })

  if (killSignal === 'unknown' && hitSignal === 'unknown') {
    return both('unknown', '킬·적중 신호가 모두 없거나 동률이다')
  }
  if (killSignal === 'unknown') {
    return both(hitSignal, `적중 신호만 있다 (AR ${signals.arHits} / SR ${signals.srHits})`)
  }
  if (hitSignal === 'unknown') {
    return both(
      killSignal,
      `킬 신호만 있다 (라플 ${signals.rifleKills} / 스나 ${signals.sniperKills})`,
    )
  }
  if (killSignal !== hitSignal) {
    return both(
      'unknown',
      `킬 신호(${killSignal})와 적중 신호(${hitSignal})가 어긋난다 — 찍지 않는다`,
    )
  }
  return both(
    killSignal,
    `킬·적중 신호가 모두 ${killSignal} (라플 ${signals.rifleKills}/스나 ${signals.sniperKills}, ` +
      `AR ${signals.arHits}/SR ${signals.srHits})`,
  )
}

/* --------------------------------------------------- 병영수첩 응답 읽기 --- */

/**
 * BattleLog 무기 분류 중 **라플/스나 판정에 쓰는 것만** 고른다.
 *
 * `special` · `assist` · `close` · `throw` 는 분모에서 뺀다.
 * 권총으로 2킬 했다고 그 사람이 라플인 것은 아니다.
 */
export const WEAPON_KILL_KEYS = { rifle: 'riple', sniper: 'sniper' } as const

/** 판정 근거에서 제외하는 분류 */
export const EXCLUDED_KILL_KEYS = ['special', 'assist', 'close', 'throw'] as const

function toCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * BattleLog 한 선수 행 → 킬 신호 (이미 집계된 형태).
 *
 * 응답 형태가 바뀔 수 있으므로 **키가 없으면 `null`** 이다. 0으로 채우지 않는다 —
 * "0킬"과 "값이 없다"는 다른 상태이고, 섞으면 판정이 틀린다.
 */
export function killSignalsOf(row: Record<string, unknown>): {
  rifleKills: number | null
  sniperKills: number | null
} {
  return {
    rifleKills: toCount(row[WEAPON_KILL_KEYS.rifle]),
    sniperKills: toCount(row[WEAPON_KILL_KEYS.sniper]),
  }
}

/**
 * BattleLog **이벤트 로그** → 선수별 무기 킬 수 (2026-08-23 실측 구조).
 *
 * 병영수첩 `GetBattleLogClan`은 집계표가 아니라 **한 줄에 한 사건**인 로그다.
 * ```
 * { event_type: 'kill',  user_nexon_sn, user_nick, weapon: 'riple' }
 * { event_type: 'death', user_nexon_sn, target_user_nexon_sn, target_weapon: 'sniper' }
 * ```
 * 같은 사건이 **가해자/피해자 두 관점으로** 들어오므로, 한쪽만 세야 두 번 세지 않는다.
 * 여기서는 `event_type === 'kill'` 행만 쓴다 — 그 행의 주인이 곧 킬을 낸 사람이다.
 *
 * `throw` · `assist` · `close` · `special` · `c4-install` 은 세지 않는다.
 * 수류탄 2킬은 그 사람이 라플이라는 근거가 아니다.
 */
export interface BattleLogEvent {
  event_type?: string | null
  user_nexon_sn?: number | null
  user_nick?: string | null
  weapon?: string | null
}

export function aggregateKillsFromBattleLog(
  events: readonly BattleLogEvent[],
): Map<number, { nickname: string | null; rifleKills: number; sniperKills: number }> {
  const byPlayer = new Map<number, { nickname: string | null; rifleKills: number; sniperKills: number }>()

  for (const event of events) {
    if (event.event_type !== 'kill') continue
    const sn = event.user_nexon_sn
    if (typeof sn !== 'number') continue
    const weapon = event.weapon
    if (weapon !== WEAPON_KILL_KEYS.rifle && weapon !== WEAPON_KILL_KEYS.sniper) continue

    const entry = byPlayer.get(sn) ?? {
      nickname: event.user_nick ?? null,
      rifleKills: 0,
      sniperKills: 0,
    }
    if (weapon === WEAPON_KILL_KEYS.rifle) entry.rifleKills += 1
    else entry.sniperKills += 1
    byPlayer.set(sn, entry)
  }

  return byPlayer
}

/**
 * 매치 상세 한 선수 행 → 적중 신호.
 *
 * 실측 키는 `M_PLAYER_hit_AR_*_cnt` / `M_PLAYER_hit_SR_*_cnt` 처럼 **부위별로 쪼개져** 있다.
 * 그래서 접두사로 모아 합친다. 하나도 없으면 `null`(모름)이다.
 */
export function hitSignalsOf(row: Record<string, unknown>): {
  arHits: number | null
  srHits: number | null
} {
  let ar: number | null = null
  let sr: number | null = null

  for (const [key, value] of Object.entries(row)) {
    const count = toCount(value)
    if (count === null) continue
    if (/hit_AR_.*cnt$/i.test(key)) ar = (ar ?? 0) + count
    else if (/hit_SR_.*cnt$/i.test(key)) sr = (sr ?? 0) + count
  }

  return { arHits: ar, srHits: sr }
}
