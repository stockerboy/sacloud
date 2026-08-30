/**
 * 라인업 표기 분기 — 스나이퍼 `[S]` 와 닉네임 링크를 정하는 순수 함수.
 *
 * ── 왜 컴포넌트에서 떼어 놨나
 *   둘 다 **틀려도 화면은 멀쩡해 보이는** 종류의 버그다.
 *   `[S]` 는 안 붙어도 그냥 이름으로 보이고, 링크는 엉뚱한 선수로 가도 페이지가 열린다.
 *   눈으로는 못 잡으니 분기를 떼어 테스트로 고정한다 (`weaponCopy` · `officialCopy` 와 같은 이유).
 *
 * ── 여기서 지키는 두 가지
 *   1. `[S]` 는 **그 경기에서 실제로 스나이퍼를 쓴 선수**에게만 붙는다.
 *      선수의 포지션(`resolvePlayerPosition`)과는 무관하다 — 포지션은 여러 경기를 센 결과이고
 *      `[S]` 는 이 경기 한 판의 사실이다. 스나이퍼 포지션 선수가 라이플로 뛴 경기에
 *      `[S]` 가 붙으면 화면이 거짓말을 하는 것이다.
 *   2. 링크는 **canonical Player ID 가 있을 때만** 건다. 닉네임으로 사람을 찾아 잇지 않는다.
 */
import { WEAPON } from '@sacloud/contract'
import { leaguePlayerPath } from '../common/paths'

/** 원본 표기 그대로. 문구를 바꾸지 않는다 (CLAUDE.md 6장) */
export const SNIPER_MARK = '[S]'

/** 색만으로는 뜻이 전달되지 않는다 — 마우스를 올리면 무엇인지 알려 준다 */
export const SNIPER_MARK_TITLE = '이 경기에서 스나이퍼로 뛰었습니다'

/**
 * **이 경기에서** 스나이퍼를 썼는가. `0 = 라이플` · `1 = 스나이퍼`.
 *
 * `null`(수집원이 무기를 주지 않음)이면 `false` 다 — 모르는 것을 아는 척하지 않는다 (D-034).
 * 넥슨 Open API 에는 무기가 없어서 실제로 `null` 인 경기가 많다.
 * "안 붙었다"가 "라이플이었다"는 뜻은 아니다.
 */
export function usedSniper(weapon: number | null | undefined): boolean {
  return weapon === WEAPON.SNIPER
}

/**
 * 라인업 닉네임을 걸 리그 기록실 경로. **연결할 근거가 없으면 `null`** 이다.
 *
 * ── 왜 null 을 돌려주나
 *   잘못된 선수에게 연결되느니 링크가 없는 편이 낫다. 동명이인이 실제로 있고,
 *   3rd.supply 라인업으로 명단만 복원한 참가자는 신원이 확정되지 않은 경우가 있다 (D-148).
 *   그런 참가자는 응답에 `player_id` 가 비어 오므로, 그때는 이름만 그린다.
 *   닉네임 문자열로 선수를 찾아 잇지 않는다 — 그건 추측이다.
 *
 * `leagueSlug` 도 함께 본다. 하나라도 비면 `/league//player/…` 같은 깨진 경로가 만들어지고,
 * 그건 404 로 끝나는 게 아니라 **빈 페이지**가 된다 (`paths.ts` 주석의 사고와 같은 종류).
 */
/* ------------------------------------------------------------ 포지션 줄 --- */

/**
 * 경기 상세의 **포지션 줄** 한 사람 — `누검 숏포지 (S)` (D-199 · 사용자 원문).
 *
 * ```
 * 차값 B리베 / 누검 숏포지 (S) / 쨔잉나 2F / yuhwan 숏포지 / huwho 스나수
 * ```
 *
 * ── 두 값은 **다른 것**이다
 *   포지션은 그 선수의 **고유 자리**라 경기마다 바뀌지 않고, `(S)` 는 **이 판 한 판의
 *   사실**이다. 사용자가 못 박았다 — **"스나수가 무조건 스나를 드는것만은 아니야"**.
 *   그래서 포지션으로 `(S)` 를 붙이지 않고, `(S)` 로 포지션을 만들지도 않는다.
 *
 * ── 모르면 **이름만** 적는다 (D-106)
 *   포지션 판정이 없으면 자리 글자를 빼고, 무기가 `null` 이면 `(S)` 를 안 붙인다.
 *   `-` 나 `알수없음` 으로 채우지 않는다 — 안 붙은 것이 "라이플이었다" 는 뜻도 아니다.
 */
export function lineupPositionText(entry: {
  name: string
  position_label: string | null
  weapon: number | null
}): string {
  const position = entry.position_label?.trim()
  const sniper = usedSniper(entry.weapon) ? ' (S)' : ''
  return position ? `${entry.name} ${position}${sniper}` : `${entry.name}${sniper}`
}

/** 포지션 줄을 그릴 값이 있는가. 아무도 포지션을 모르면 줄 자체를 그리지 않는다 */
export function hasAnyPosition(
  entries: readonly { position_label: string | null }[],
): boolean {
  return entries.some((entry) => Boolean(entry.position_label?.trim()))
}

export function lineupPlayerHref(
  leagueSlug: string | null | undefined,
  playerId: string | null | undefined,
): string | null {
  const slug = leagueSlug?.trim()
  const id = playerId?.trim()
  if (!slug || !id) return null
  return leaguePlayerPath(slug, id)
}
