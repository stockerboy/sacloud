/**
 * 클랜 육각형 V2 의 **축 개수 세기** — 잡 두 개가 같은 규칙을 쓰게 여기 한 곳에 둔다.
 *
 * `clanHexV2Build`(경기 × 클랜)와 `clanHexV2Summary`(클랜 × 1)가 둘 다
 * `axesMeasured` 칸을 채운다. 한쪽에 두고 다른 쪽이 가져다 쓰면 **두 잡이 서로를
 * import 하는 고리**가 생기므로(요약 잡은 집계잡이 부른다) 규칙만 떼어 냈다.
 *
 * ⚠ 이 값은 **「분모가 0이 아닌가」가 아니라 「축 재료가 있나」**다.
 * 실제로 값이 나오는지는 계약의 `buildClanHexV2Raw` 가 정한다 (분모 0이면 `pending`).
 * 그래서 여기 숫자가 6이어도 화면에서 `측정중` 일 수 있다.
 */

/**
 * 여섯 축을 들고 있는 것이면 무엇이든 — `ClanHexTally`(nexon) 와
 * `ClanHexTallyLike`(contract) 가 **둘 다** 여기에 들어맞는다.
 *
 * 계약을 import 하지 않고 구조로만 받는다. 이 파일이 어느 쪽에도 매이지 않게 한다.
 */
export interface ClanHexAxisHolder {
  sniperFight: object | null
  outnumbered: object | null
  save: object | null
  tempo: object | null
  lastSniper: object | null
  attackZone: object | null
}

/** 여섯 축 중 **`null` 이 아닌** 개수 (0~6). 화면의 `측정중 N/6` 에 쓴다 */
export function axesMeasuredOf(tally: ClanHexAxisHolder): number {
  const axes = [
    tally.sniperFight,
    tally.outnumbered,
    tally.save,
    tally.tempo,
    tally.lastSniper,
    tally.attackZone,
  ]
  return axes.filter((axis) => axis !== null).length
}
