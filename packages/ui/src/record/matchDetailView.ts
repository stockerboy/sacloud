/**
 * 경기 상세(펼친 패널)의 표시 분기 — 전부 순수 함수.
 *
 * ── 왜 컴포넌트에서 떼어 놨나
 *   여기 있는 분기는 **틀려도 화면이 멀쩡해 보인다.** 딜량 막대가 엉뚱한 기준으로 그려져도
 *   막대는 그럴듯하게 나오고, 헤드샷 비율이 0킬을 나눠 `Infinity%` 가 돼도 한 셀만 이상해진다.
 *   실제로 예전 구현은 래더가 없는 참가자에게 `0점` 을, K/D/A 를 모르는 참가자에게
 *   `null / null / null` 을 그렸다. 눈으로는 안 잡히니 분기를 떼어 테스트로 고정한다
 *   (`lineupCopy` · `officialCopy` · `weaponCopy` 와 같은 이유).
 *
 * ── 여기서 지키는 하나
 *   **없는 값을 만들지 않는다.** 모르면 `알수없음`, 0으로 채우지 않는다 (D-034 · D-148).
 *   비율은 분모를 아는 경우에만 만든다.
 */
import { WEAPON } from '@sacloud/contract'

/* 값이 없다는 뜻의 공용 표기. 원본 용어를 바꾸지 않는다 (CLAUDE.md 6장) */
export const UNKNOWN = '알수없음'

/* ------------------------------------------------------------------ 딜량 --- */

/** 딜량 막대 계산에 필요한 최소 모양 */
export interface DamageLike {
  damage: number | null
}

/**
 * 딜량 막대의 기준값 — **그 경기 참가자 중 최대 딜량.**
 *
 * `null`(결측)은 최대값 계산에서 **뺀다.** 0으로 보면 안 되는 것도 아니지만,
 * 그보다 중요한 건 결측이 최대값을 끌어내리지 않는다는 점이다.
 * 아무도 딜량을 모르면 기준이 없으므로 `null` 이고, 그때는 막대를 아예 그리지 않는다.
 * 상대 클랜 소속은 딜량이 결측돼 내려오므로(원본 노출 한계) 실제로 자주 일어난다.
 */
export function maxDamage(stats: readonly DamageLike[]): number | null {
  let max: number | null = null
  for (const stat of stats) {
    if (stat.damage === null) continue
    if (max === null || stat.damage > max) max = stat.damage
  }
  return max
}

/**
 * 막대 길이(%). **그릴 근거가 없으면 `null`** 이고, 호출부는 막대를 그리지 않는다.
 *
 * 기준이 0 이하면 나눌 수 없다 — 전원 0딜인 경기에서 모두 100% 막대가 뜨는 것을 막는다.
 */
export function damageBarPercent(damage: number | null, max: number | null): number | null {
  if (damage === null || max === null || max <= 0) return null
  return Math.min(100, Math.max(0, (damage / max) * 100))
}

/* ---------------------------------------------------------------- 헤드샷 --- */

export type HeadshotView =
  | { kind: 'unknown' }
  /** `rate` 는 킬을 알 때만 있다. 모르면 비율을 만들지 않는다 */
  | { kind: 'known'; headshot: number; rate: number | null }

/**
 * 헤드샷 칸.
 *
 * 비율은 **킬 대비**다. 킬을 모르거나 0킬이면 비율 자체가 성립하지 않으므로 만들지 않는다 —
 * `0/0` 을 `0%` 로 적으면 "헤드샷을 못 냈다"는 거짓 정보가 된다.
 */
export function headshotView(headshot: number | null, kill: number | null): HeadshotView {
  if (headshot === null) return { kind: 'unknown' }
  if (kill === null || kill <= 0) return { kind: 'known', headshot, rate: null }
  return { kind: 'known', headshot, rate: (headshot / kill) * 100 }
}

/* ------------------------------------------------------------------- kda --- */

export interface KdaLike {
  kill: number | null
  death: number | null
  assist: number | null
  kd_rate: number | null
}

export type KdaView =
  | { kind: 'unknown' }
  | { kind: 'known'; kill: number | null; death: number | null; assist: number | null; rate: number | null }

/**
 * kda 칸.
 *
 * 셋 다 모르면 명단만 복원된 참가자다 (D-148) — 그때는 `알수없음` 이다.
 * **0 으로 채우지 않는다.** 일부만 아는 경우는 아는 값을 그대로 두고 모르는 자리에 `-` 를 찍는다.
 */
export function kdaView(stat: KdaLike): KdaView {
  if (stat.kill === null && stat.death === null && stat.assist === null) return { kind: 'unknown' }
  return {
    kind: 'known',
    kill: stat.kill,
    death: stat.death,
    assist: stat.assist,
    rate: stat.kd_rate,
  }
}

/* ------------------------------------------------------------------ 래더 --- */

export type RatingCellView =
  | { kind: 'placement' }
  | { kind: 'rating'; value: number }
  | { kind: 'unknown' }

/**
 * 래더 칸.
 *
 * 배치고사 중이면 숫자 자리에 `배치고사` 를 쓴다 (원본 규칙 · CLAUDE.md 6장).
 * 배치도 아닌데 값이 없으면 **모르는 것**이라 `알수없음` 이다 —
 * 예전 구현의 `rating ?? 0` 은 그 선수의 래더가 0점이었다고 말하는 것이라 틀렸다.
 */
export function ratingCellView(stat: { placement: boolean; rating: number | null }): RatingCellView {
  if (stat.placement) return { kind: 'placement' }
  if (stat.rating === null) return { kind: 'unknown' }
  return { kind: 'rating', value: stat.rating }
}

/* ------------------------------------------------------------------ 무기 --- */

/**
 * 무기 칸 표기. **모르면 `null`** 이고 호출부가 `알수없음` 을 그린다.
 *
 * 넥슨 Open API 에는 무기가 없어 실제로 `null` 인 경기가 많다 (D-034).
 * `null` 을 라이플로 떨어뜨리지 않는다 — 그건 없는 사실을 만드는 것이다.
 */
export function matchWeaponLabel(weapon: number | null | undefined): string | null {
  if (weapon === WEAPON.SNIPER) return '스나이퍼'
  if (weapon === WEAPON.RIFLE) return '라이플'
  return null
}

/* ------------------------------------------------------------ 시작 시각 --- */

/**
 * `게임시작시간: 2026년 7월 28일 오전 3시 40분` (원본 표기).
 *
 * 원본은 0 패딩을 하지 않고 `시`·`분`을 한글로 적는다. `Intl` 기본 포맷은
 * `오전 3:40` 이라 그대로 쓸 수 없어 조각을 직접 잇는다. 표시 기준 시간대는 `Asia/Seoul`.
 */
export function formatMatchStartAt(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return ''
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).formatToParts(new Date(time))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}년 ${get('month')}월 ${get('day')}일 ${get('dayPeriod')} ${get('hour')}시 ${get('minute')}분`
}

/* -------------------------------------------------------------- 팀 헤더 --- */

/**
 * 팀 블록의 진영 표기 — `선레드` / `선블루`.
 *
 * 서든어택 클랜전은 전반·후반에 진영을 바꾸므로, 원본은 두 팀에 각각
 * **처음 어느 진영에서 시작했는지**를 적는다(관측: 한 경기에 `선레드`와 `선블루`가 함께 나온다).
 *
 * `blue_team` 의 정확한 의미는 여전히 `[미확인]` 이다(계약 주석 참조).
 * 그래서 **값으로 어느 팀이 선공인지 단정하지 않고**, `null`(= 진영 정보를 모름)일 때
 * 양쪽 모두 표기하지 않는 근거로만 쓴다. 모르면 안 적는다 (D-034).
 */
export function firstSideLabel(
  blueTeam: boolean | null | undefined,
  side: 'red' | 'blue',
): string | null {
  if (blueTeam === null || blueTeam === undefined) return null
  return side === 'blue' ? '선블루' : '선레드'
}

/** 팀 승패 판정에 필요한 최소 모양 */
export interface TeamStatLike {
  win: boolean
}

/**
 * 이 팀이 이겼는가. 참가자 기록의 `win` 이 사실이다. 참가자가 없으면 `null`.
 *
 * 카드의 `match.win` 은 **보는 쪽 기준**이라 팀 블록의 승패로 바로 쓸 수 없다.
 */
export function teamWon(stats: readonly TeamStatLike[]): boolean | null {
  const first = stats[0]
  return first === undefined ? null : first.win
}

/**
 * 이 팀 블록이 **보는 쪽(`league_clan`)** 인가.
 *
 * ── 왜 필요한가
 *   응답은 팀을 `league_clan` / `opponent`(보는 쪽 기준)로 주는데, 참가자는
 *   `red` / `blue`(진영 기준)로 준다. 팀 헤더에 클랜명·부리그·점수를 적으려면
 *   **어느 진영이 어느 클랜인지**를 이어야 한다.
 *
 * ── 승패로 잇는다
 *   `viewerWin` 은 보는 쪽이 이겼는가이고, 참가자 `win` 은 그 팀이 이겼는가다.
 *   무승부가 없으므로 둘이 같으면 그 팀이 보는 쪽이다.
 *
 *   **경기 당시 소속 클랜 id 로 세지 않는다.** 용병이 본클랜원보다 많은 경기가 실제로 있어
 *   (D-081) 다수결이 뒤집힌다. 승패는 용병이 섞여도 흔들리지 않는다.
 *
 * 참가자가 하나도 없으면 근거가 없으므로 `null` 이다 — 그때는 클랜명을 지어내지 않고
 * 헤더에서 뺀다. 참가자가 없으면 표에 그릴 행도 없다.
 */
export function teamIsViewerClan(
  stats: readonly TeamStatLike[],
  viewerWin: boolean,
): boolean | null {
  const won = teamWon(stats)
  return won === null ? null : won === viewerWin
}

/* ------------------------------------------------------------------- MVP --- */

/**
 * 이 참가자에게 MVP 배지를 붙이는가.
 *
 * 경기가 지목한 `mvp_player_id` 가 있으면 **그 한 명만**이다 — 참가자별 `mvp` 플래그가
 * 여러 명에게 켜져 있어도 경기 단위 사실이 이긴다.
 * 지목이 없을 때만 참가자 플래그를 본다. `null`(모름)은 배지를 붙이지 않는다 (D-034).
 */
export function mvpBadgeVisible(
  playerId: string,
  statMvp: boolean | null,
  mvpPlayerId: string | null | undefined,
): boolean {
  if (mvpPlayerId !== null && mvpPlayerId !== undefined && mvpPlayerId !== '') {
    return playerId === mvpPlayerId
  }
  return statMvp === true
}
