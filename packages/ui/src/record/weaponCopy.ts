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
 * ⚠ **원본의 `포지션` 과 다른 개념이다. 화면에 쓰지 마라** (D-161).
 *   원본 `상세정보` 의 `포지션` 은 **선수가 직접 설정하는 문자열**이다
 *   (`A 숏` 처럼 맵 포지션을 가리킨다). 계산해서 얻는 값이 아니다.
 *   그 값은 API 응답 `data.player.position` 으로 오고, 화면은
 *   `RecordPanels.tsx` 의 `PlayerStatSidebar` 가 그 값만 쓴다.
 *
 *   아래 함수는 **우리가 만들어 낸 집계**다. 원본에 없는 개념이라 어떤 화면에도 붙이지 않는다.
 *   지우지 않고 남겨 둔 이유는 무기 분리가 `CLAUDE.md` 3-A 의 V1 승격 항목이라
 *   언젠가 다른 이름으로 쓰일 수 있어서다. **`포지션` 이라는 이름으로는 쓰지 않는다.**
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

/**
 * 화면에 그대로 쓰는 한글 표기.
 *
 * ── 2026-09-03 (O-040 ①) — **「스나이퍼·라이플」에서 「스나·라플」로 바꿨다**
 *   같은 것을 화면마다 넷으로 부르고 있었다. 강민재가 세었다 —
 *   `matchDetailView` 는 「스나」, 여기는 「스나이퍼」, `TraitHexagon` 은 「스나수」,
 *   `PlayerHeadCard` 는 **한 줄 안에서** 라벨 「스나 킬뎃」 · 값 「스나이퍼」였다.
 *   **뛰는 사람이 쓰는 말**로 맞춘다.
 *
 *   ⚠ 옛 표기 — `'스나이퍼'` · `'라이플'`. 되돌릴 일이 생기면 이 두 낱말이다.
 *   ⚠ **코드의 값 이름은 안 건드린다** — `WEAPON.SNIPER` · `sniper_rating_delta` 그대로다.
 *     바꾼 것은 **사람 눈에 뜨는 글자**뿐이다.
 *
 * ⚠ 원래 여기 「원본 용어를 바꾸지 않는다 (CLAUDE.md 6장)」이라고 적혀 있었는데
 *   **6장은 래더 공식 이야기라 이 줄과 상관이 없다.** 잘못 붙은 출처였다.
 */
export function positionLabel(position: PlayerPosition): string {
  switch (position) {
    case 'sniper':
      return '스나'
    case 'rifle':
      return '라플'
    case 'multi':
      return '멀티'
    case 'none':
      return '집계 없음'
  }
}
