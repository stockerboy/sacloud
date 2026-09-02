import { rankTone, type RankTone } from '@sacloud/contract'

/**
 * 선수 정보줄의 **문구 판단** (2026-09-02 사용자 지시).
 *
 * 컴포넌트에서 떼어 놓은 이유는 `weaponCopy.ts` 와 같다 —
 * **여기가 틀리면 사용자에게는 안 고쳐진 것**이고, 분기는 테스트로 고정해야 한다.
 */

/** 순위 색 → CSS 변수. 토큰 이름은 `styles.css` 에 있다 */
const RANK_COLOR: Record<RankTone, string> = {
  gold: 'var(--color-rank-gold)',
  blue: 'var(--color-rank-blue)',
  brown: 'var(--color-rank-brown)',
  green: 'var(--color-rank-green)',
  plain: 'var(--color-rank-plain)',
}

/** 그 순위를 무슨 색으로 적나. 순위가 없으면 `null` — 색을 지어내지 않는다 */
export function rankColor(rank: number | null | undefined): string | null {
  const tone = rankTone(rank)
  return tone === null ? null : RANK_COLOR[tone]
}

/**
 * 포지션 한 줄을 어떻게 쓰나.
 *
 * > "닉네임/포지션-포지션:스나or라플인지만 쓰고
 * >  만약 유저가 로그인 후 본인 포지를 넣었다면 라플(숏포지) 이런식으로 써줘"
 *
 * ```
 *   주무기만 안다          스나
 *   본인이 자리도 넣었다    라플(숏포지)
 *   주무기를 모르는데 자리만 있다   숏포지
 *   아무것도 없다          null  → 화면이 줄을 그리지 않는다
 * ```
 *
 * ── 주무기를 **지어내지 않는다**
 *   스나·라플을 반반 든 선수는 주무기가 없다 (`splitWeapons` 가 `null` 을 준다).
 *   그때 한쪽을 골라 적으면 거짓이다. 자리만 적거나, 그것도 없으면 줄이 사라진다.
 *
 * ── 괄호는 **본인이 넣은 값일 때만**
 *   우리가 좌표로 판정한 자리(`coords`)는 괄호에 넣지 않는다 — 사용자가 「본인 포지를
 *   넣었다면」이라고 못박았다. 판정값은 주무기 자리에 그대로 온다.
 */
export function positionLine(input: {
  /** `0 = 라이플` · `1 = 스나이퍼` · `null = 모름/반반` */
  mainWeapon: 0 | 1 | null
  /** 화면에 적을 자리 한 줄 (D-199) */
  positionLabel: string | null | undefined
  /** 그 값이 어디서 왔나 */
  positionSource: 'user' | 'weapon' | 'coords' | null | undefined
}): string | null {
  const weaponWord = input.mainWeapon === null ? null : input.mainWeapon === 1 ? '스나' : '라플'
  const own = input.positionSource === 'user' ? (input.positionLabel?.trim() ?? '') : ''

  if (own !== '') return weaponWord === null ? own : `${weaponWord}(${own})`
  if (weaponWord !== null) return weaponWord
  /* 주무기도 모르고 본인이 넣은 값도 없다. 좌표 판정값이라도 있으면 그것을 쓴다 */
  const judged = input.positionLabel?.trim() ?? ''
  return judged === '' ? null : judged
}

/**
 * 무기별 기록에서 **주무기**를 고른다.
 *
 * `RecordPanels.tsx` 의 `splitWeapons` 와 **같은 규칙**이다 — 판수가 많은 쪽이 주무기,
 * 똑같으면 주무기가 **없다**(`null`). 한쪽을 골라 적으면 거짓이 된다.
 *
 * 규칙을 두 번 적은 것이 아니라, 저쪽은 「두 줄을 어느 순서로 놓나」를 정하고
 * 이쪽은 「포지션 한 단어를 무엇으로 쓰나」를 정한다. 같은 판단을 쓰므로 값이 어긋나지 않게
 * **여기 한 줄로 요약**해 둔다 — 저쪽 규칙이 바뀌면 여기도 같이 바꾼다.
 */
export function mainWeaponFromStats(
  weaponStats: readonly { weapon: number; games: number }[] | undefined,
): 0 | 1 | null {
  const sniper = weaponStats?.find((row) => row.weapon === 1 && row.games > 0) ?? null
  const rifle = weaponStats?.find((row) => row.weapon === 0 && row.games > 0) ?? null
  if (sniper && rifle) {
    if (sniper.games === rifle.games) return null
    return sniper.games > rifle.games ? 1 : 0
  }
  if (sniper) return 1
  if (rifle) return 0
  return null
}
