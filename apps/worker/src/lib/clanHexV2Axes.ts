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
  sniperDuel: object | null
  outnumbered: object | null
  save: object | null
  riflePower: object | null
  /** ⑤ 지금 쓰는 것 — 스나영향력 (2026-09-16 사장님) */
  sniperInfluence: object | null
  /** 옛 ⑤ 선짤. 세는 데는 안 쓰지만 받기는 받는다 */
  firstBlood: object | null
  trade: object | null

  /* ── 아래 셋은 **옛 축**이다. 세는 데는 안 쓰지만 받기는 받는다 (`CLAUDE.md` 1-4) ── */
  sniperFight?: object | null
  tempo?: object | null
  lastSniper?: object | null
  attackZone?: object | null
}

/**
 * 여섯 축 중 **`null` 이 아닌** 개수 (0~6). 화면의 `측정중 N/6` 에 쓴다.
 *
 * ⚠ ★2026-09-15 — 이 함수는 줄곧 ★옛 여섯 축★ 을 세고 있었다★
 *   `sniperFight` · `lastSniper` · `attackZone` 은 2026-09-02(D-256)에 화면에서
 *   내려갔는데 여기만 안 따라왔다. 그래서 «측정중 N/6» 의 N 이 화면과 어긋났다.
 *   ④ 를 라이플화력으로 바꾸면서 같이 바로잡는다. 옛 셈은 `axesMeasuredOfV1` 에 남긴다.
 */
export function axesMeasuredOf(tally: ClanHexAxisHolder): number {
  const axes = [
    tally.sniperDuel,
    tally.outnumbered,
    tally.save,
    tally.riflePower,
    tally.sniperInfluence,
    tally.trade,
  ]
  return axes.filter((axis) => axis !== null).length
}

/** 2026-09-15 까지 쓰던 셈 — **옛 여섯 축**을 센다. 지우지 않는다 (`CLAUDE.md` 1-4) */
export function axesMeasuredOfV1(tally: ClanHexAxisHolder): number {
  const axes = [
    tally.sniperFight ?? null,
    tally.outnumbered,
    tally.save,
    tally.tempo ?? null,
    tally.lastSniper ?? null,
    tally.attackZone ?? null,
  ]
  return axes.filter((axis) => axis !== null).length
}
