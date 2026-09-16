/**
 * ★클랜 뱃지★ — 육각 여섯 축 중 리그 5위 안에 든 축을 클랜 목록의 승률 옆에 단다.
 *
 * 2026-09-14 사장님:
 *   «옆에 승률이랑 우리가 등록해놓은 모든클랜중 6각이 5위 안에 드는 클랜은
 *     클랜목록에서 승률옆에 뱃지를 달아주자 그리고 이 뱃지는 아스트라 구간
 *     클랜들한테 유리하게끔 시스템 짜줘»
 *   «축마다 5위 안이면 전부 준다»   ← 한 클랜이 뱃지 여러 개를 가질 수 있다
 *   «그굼 모르겠다 너가 알아서 판단하고 보정값 설정해라»
 *
 * ── ★보정값은 실제 자료로 정했다★ (지어내지 않았다)
 *   운영 DB 의 IPL 클랜 42곳(ASTRA 12 · CHALLENGER 30)을 그대로 돌려 봤다.
 *   뱃지 자리는 6축 × 5위 = 30개다.
 *
 *   ```
 *     보정 없음      ASTRA 16개(53%)  CHALLENGER 14개(47%)
 *     1등 앞당김     ASTRA 16개(53%)  CHALLENGER 14개(47%)   ← 한 칸은 아무것도 안 바뀐다
 *   ★ 2등 앞당김     ASTRA 18개(60%)  CHALLENGER 12개(40%)   ← 고른 값
 *     3등 앞당김     ASTRA 18개(60%)  CHALLENGER 12개(40%)
 *     5등 앞당김     ASTRA 20개(67%)  CHALLENGER 10개(33%)
 *   ```
 *
 *   ★2등★ 을 고른 까닭 —
 *     · ASTRA 는 클랜 수로 29%인데 뱃지는 60%를 가져간다. 뚜렷하게 유리하다
 *     · 그런데 챌린저 최강(vAN`kA · 3개)은 안 밀린다. 실력으로 올라온 클랜까지
 *       지우면 뱃지가 우스워진다
 *     · 5등까지 당기면 Atraxia · dominator 같은 챌린저 강자가 통째로 밀렸다
 *
 * ── 왜 「점수 가산」 이 아니라 「등수 앞당김」 인가
 *   축 값은 ★그 리그 안 백분위★ 다 — 42곳이면 한 칸이 정확히 1/42(0.024)이고,
 *   여섯 축이 전부 같은 사다리를 쓴다. 그래서 «0.05점 더한다» 는 말은 사실
 *   «두 칸 앞당긴다» 와 ★같은 말★ 이다. 그런데 클랜이 늘면 한 칸 크기가 바뀌므로
 *   점수로 박아 두면 뜻이 흔들린다. 등수로 적으면 흔들리지 않는다.
 */
import { CLAN_HEX_V2_AXIS_KEYS, type ClanHexV2AnyAxisKey, type ClanHexV2AxisKey } from './clanTraitsV2'

/** 축마다 여기까지 뱃지를 준다 (사장님: «5위 안») */
export const CLAN_BADGE_TOP = 5

/**
 * ASTRA 구간이 앞당겨 받는 등수.
 *
 * ★사장님이 «더» / «덜» 하시면 ★이 숫자 하나만★ 고치면 된다.★
 * 0 이면 보정이 없어지고, 2 면 ASTRA 는 실질 7위까지 뱃지를 받는다.
 */
export const CLAN_BADGE_ASTRA_RANK_BONUS = 2

/** 보정을 받는 구간 — IPL 의 1구간(ASTRA) */
export const CLAN_BADGE_BONUS_DIVISION = 1

/** 한 축의 뱃지 판정에 필요한 것 */
export interface ClanBadgeAxisInput {
  key: ClanHexV2AnyAxisKey
  /** 리그 안 등수 (1 = 최고). 아직 못 잰 축은 `null` */
  rank: number | null
}

/**
 * 그 클랜이 받는 뱃지 축들. 못 잰 축은 절대 안 준다 (D-106 — 모르는 것을 잘한다고 하지 않는다).
 *
 * `division` 은 ★경기 당시★ 가 아니라 ★지금★ 의 구간이다. 뱃지는 지금 목록에 붙는
 * 표시라서 지금 값이 맞다 (래더 규칙 6-4 와 다른 자리다).
 */
export function clanBadgeAxes(
  axes: readonly ClanBadgeAxisInput[],
  division: number,
): ClanHexV2AxisKey[] {
  const bonus = division === CLAN_BADGE_BONUS_DIVISION ? CLAN_BADGE_ASTRA_RANK_BONUS : 0
  const cut = CLAN_BADGE_TOP + bonus
  const won = new Set<ClanHexV2AnyAxisKey>()
  for (const axis of axes) {
    if (axis.rank === null) continue
    if (axis.rank <= cut) won.add(axis.key)
  }
  /* 화면 순서를 고정한다 — 육각형이 도는 순서 그대로다 */
  return CLAN_HEX_V2_AXIS_KEYS.filter((k) => won.has(k))
}
