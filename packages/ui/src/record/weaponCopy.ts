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

/**
 * 선수 **포지션** — 그 무기로 뛴 **경기 수**로만 정한다 (D-152).
 *
 * ── 왜 경기 수인가
 *   킬 수·킬뎃·현재 클랜으로 정하지 않는다. 그건 판단이지 사실이 아니다.
 *   "스나로 몇 판 뛰었나"는 경기마다 기록된 사실이고, 세면 끝난다.
 *
 * ── 동률은 반드시 `멀티`
 *   한쪽으로 몰아 주면 근거 없이 한 포지션을 지어내는 것이다.
 *   0판 대 0판(아직 무기 기록이 없는 선수)도 동률이므로 `멀티` 가 아니라
 *   **`none`** 이다 — 뛴 적이 없는데 "멀티로 뛴다"고 말할 수는 없다.
 *
 * `games`(그 무기로 뛴 경기 전부)를 쓴다. `knownGames`(K/D 를 아는 경기)가 아니다.
 * K/D 를 모른다고 그 경기를 안 뛴 것으로 칠 수는 없다.
 */
export type PlayerPosition = 'sniper' | 'rifle' | 'multi' | 'none'

export function resolvePlayerPosition(sniperGames: number, rifleGames: number): PlayerPosition {
  const sniper = Number.isFinite(sniperGames) ? Math.max(0, sniperGames) : 0
  const rifle = Number.isFinite(rifleGames) ? Math.max(0, rifleGames) : 0
  if (sniper === 0 && rifle === 0) return 'none'
  if (sniper > rifle) return 'sniper'
  if (rifle > sniper) return 'rifle'
  return 'multi'
}

/** 화면에 그대로 쓰는 한글 표기. 원본 용어를 바꾸지 않는다 (CLAUDE.md 6장) */
export function positionLabel(position: PlayerPosition): string {
  switch (position) {
    case 'sniper':
      return '스나이퍼'
    case 'rifle':
      return '라이플'
    case 'multi':
      return '멀티'
    case 'none':
      return '집계 없음'
  }
}
