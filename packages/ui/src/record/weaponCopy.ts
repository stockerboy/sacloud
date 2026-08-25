/**
 * 무기별 전적을 화면에 **어떻게 표시할지** 정하는 순수 함수 (D-149).
 *
 * ── 왜 컴포넌트에서 떼어 놨나
 *   여기가 틀리면 사용자에게는 고쳐지지 않은 것이다. 실제로 그랬다 —
 *   API 는 옳은 값을 주는데 화면은 `집계 없음` 만 그렸다.
 *   분기를 순수 함수로 떼어 테스트로 고정한다 (`officialCopy` 와 같은 이유).
 *
 * ── 세 가지 상태를 구분한다
 *   `none`    그 무기로 뛴 적이 정말 없다 → `집계 없음`
 *   `unknown` 뛰었지만 K/D 를 하나도 모른다 → 전 수는 보여 주고 K/D 자리는 비운다.
 *             **뛴 경기를 없던 일로 만들지 않는다.** 0킬로 채우지도 않는다
 *   `known`   K/D 를 아는 경기가 있다 → 전 수 · 킬뎃 · 순위를 보여 준다
 *
 * `집계 없음` 을 남발하면 사용자는 사이트가 고장 난 줄 안다.
 */
export type WeaponStatView =
  | { kind: 'none' }
  | { kind: 'unknown'; games: number }
  | {
      kind: 'known'
      games: number
      knownGames: number
      kill: number
      death: number
      kdRate: number
      /** 아는 경기가 전체보다 적으면 그 사실을 함께 적는다 */
      partial: boolean
    }

export function weaponStatView(input: {
  games?: number
  knownGames?: number
  kill?: number
  death?: number
  kdRate?: number | null
}): WeaponStatView {
  const games = input.games ?? 0
  if (games <= 0) return { kind: 'none' }

  const knownGames = input.knownGames ?? 0
  if (knownGames <= 0 || input.kdRate === null || input.kdRate === undefined) {
    return { kind: 'unknown', games }
  }

  return {
    kind: 'known',
    games,
    knownGames,
    kill: input.kill ?? 0,
    death: input.death ?? 0,
    kdRate: input.kdRate,
    partial: knownGames < games,
  }
}
