/**
 * **딜량·어시·헤드샷을 믿을 수 있는 참가 기록**만 고르는 조건 (D-209).
 *
 * ── 무엇을 발견했나 (실측 2026-08-30 · 로컬 미러 DB)
 *   `MatchPlayerStat.damage = 0` 은 "딜을 0 넣었다" 가 아니라 **결측이 0 으로 저장된 것**이다.
 *
 *     damage > 0 이고 dropout = true      0 행
 *     damage = 0 이고 dropout = true    122,200 행
 *     damage = 0 이고 dropout = false     1,976 행    → 98.4% 가 탈주와 일치
 *     damage IS NULL                        265 행    (전체 3,647,466 중)
 *
 *   같은 행에서 `assist` 도 전원 정확히 0, `headshot` 도 전원 0 이다.
 *   그런데 `damage = 0` 이면서 `kill > 0` 인 행이 126,465 건 있다 — 킬을 냈는데 딜이 0일 수는
 *   없다. 즉 그 세 칸은 **모르는 값**이고, `damage = 0` 이 그 표식이다.
 *
 * ── 왜 고쳤나
 *   전투력 육각형 `샷싸움` 축(라플수)이 그 0 들을 평균에 넣고 있었다. 실측:
 *
 *     라플 판당딜 중앙값   탈주판 포함  919.7  →  탈주판 제외  1,422.9
 *     스나 판당딜 중앙값   탈주판 포함 1,469.0 →  탈주판 제외  2,266.6
 *
 *   축이 딜량이 아니라 **"우리 팀이 얼마나 자주 탈주하나"** 를 절반쯤 재고 있었다.
 *   탈주는 팀 단위로 몰리는 사건이라 개인 특성이 아니다.
 *
 * ── 조건이 **두 개**다. 목적이 다르다 (2026-08-31 정정)
 *
 *   `playedGamesWhere()`  `damage > 0`            **딜량을 평균 내거나 합치는** 자리
 *   `notZeroedWhere()`    `damage` 가 `0` 이 아니다  **어시·헤드샷을 더하는** 자리
 *
 *   갈라 놓은 이유는 `damage IS NULL` 을 어느 쪽으로 볼 것이냐가 다르기 때문이다.
 *   모르는 딜량은 **평균에 넣을 수 없지만**, 그 행의 어시는 진짜 값일 수 있다.
 *   실측으로 `damage IS NULL` 265행이 어시 **144** 를 들고 있다 (전체 8,093,268 중).
 *   한쪽 조건으로 뭉뚱그리면 그 144 가 조용히 사라진다.
 *
 * ── 쓰는 곳 / 쓰지 않는 곳
 *
 *   `playedGamesWhere`   `playerTraits.ts` 샷싸움(판당 평균 딜량)
 *   `notZeroedWhere`     `playerTotals.ts` 누적 어시 · 헤드샷
 *
 *   **`clanMetrics.ts` 화력은 둘 다 쓰지 않는다.** 거기는 행이 아니라 **팀 5명 묶음**을
 *   통째로 넣거나 뺀다 — 한 명이라도 결측이면 합계 자체가 거짓이라 경기를 버려야 한다.
 *   그래서 `groupBy` 결과에 `_count.damage`(null 검사)와 `_min.damage`(0 검사)를 직접 건다.
 *
 *   쓰지 않는다  **`kill` · `death`.** 이쪽은 결측이 없다 — 경기당 `sum(red kill)` 과
 *            `sum(blue death)` 가 34,801 경기 중 33,766건(97.0%)에서 정확히 0이고
 *            나머지 907건도 ±1이다. 믿을 수 있으므로 그대로 센다.
 *
 *   쓰지 않는다  **매치 상세의 한 줄 한 줄.** 거기는 평균이 아니라 그 경기의 기록 그대로를
 *            보여 주는 자리다.
 *
 * ── 분모가 바뀐다
 *   탈주판을 빼면 선수당 **딜량을 아는 판수**가 줄어든다. 그래서 딜량 축은
 *   `TRAIT_MIN_GAMES` 를 킬 판수가 아니라 **딜량 판수**에도 따로 건다.
 *   그러지 않으면 두 판짜리 평균이 백분위 안에 섞인다.
 *
 * > `[미확인]` 원본(3rd.supply)이 딜량 평균을 어떻게 냈는지는 관측되지 않았다.
 * > "결측을 빼고 평균 낸다" 는 우리 판단이고 **원본과 동일함이 검증되지 않았다**
 * > (`CLAUDE.md` 3장 7번).
 */
import type { Prisma } from '@sacloud/db'

/**
 * 딜량이 결측인 표식. `0` 이면 탈주(또는 그와 같은 결측)이고 `null` 이면 아예 모른다.
 *
 * `damage > 0` 하나로 **둘 다** 걸러진다 — `null` 은 어떤 비교에도 참이 되지 않는다.
 */
export const DROPOUT_DAMAGE_ZERO = 0

/**
 * 딜량·어시·헤드샷을 셀 수 있는 참가 기록인가 — `MatchPlayerStat` 에 바로 거는 조건.
 *
 * ```ts
 * prisma.matchPlayerStat.aggregate({ where: { ...base, ...playedGamesWhere() } })
 * ```
 *
 * `kill` · `death` 에는 걸지 마라. 그쪽은 결측이 아니다(위 주석).
 */
export function playedGamesWhere(): Prisma.MatchPlayerStatWhereInput {
  return { damage: { gt: DROPOUT_DAMAGE_ZERO } }
}

/**
 * **탈주로 0 이 박힌 기록만** 뺀다 — `damage` 를 아예 모르는 기록(`null`)은 남긴다.
 *
 * ── 왜 `playedGamesWhere` 와 갈랐나 (2026-08-31)
 *   두 조건은 목적이 다른데 하나로 쓰이고 있었다.
 *
 *   `playedGamesWhere` (damage > 0)
 *       **딜량을 평균 내는** 자리용이다. 모르는 값(`null`)은 평균에 넣을 수 없으니
 *       빼는 것이 맞다
 *
 *   `notZeroedWhere` (damage 가 0 이 아니다)
 *       **어시·헤드샷을 더하는** 자리용이다. 이 둘이 0 으로 박히는 표식은
 *       `damage = 0` 이지 `damage IS NULL` 이 아니다.
 *       딜량을 못 받아 온 기록이라도 **어시는 진짜 값일 수 있다.**
 *
 *   실데이터에서 `damage IS NULL` 은 3,647,466 행 중 **265 행**뿐이라 숫자로는 미미하다.
 *   그런데 딜량을 안 주는 수집원이 새로 생기면 그 몫이 통째로 사라진다.
 *   실제로 이 구분이 없어서 `independentLeague` 테스트의 `assist` 가 3 → 0 이 됐다
 *   (픽스처는 `damage` 를 넣지 않는다 — 딜량 없이도 성립하는 기록이다).
 *
 * `null` 은 어떤 비교에도 참이 되지 않으므로 `not: { equals: 0 }` 만으로는 `null` 까지
 * 걸러진다. 그래서 **`OR` 로 `null` 을 명시적으로 남긴다.**
 */
export function notZeroedWhere(): Prisma.MatchPlayerStatWhereInput {
  return {
    OR: [{ damage: { gt: DROPOUT_DAMAGE_ZERO } }, { damage: null }],
  }
}

/**
 * 이미 다른 조건이 있는 `MatchPlayerStat` where 에 안전하게 덧붙인다.
 *
 * `notZeroedWhere()` 는 `OR` 를 쓰므로 **다른 `OR` 와 같은 객체에 펼치면 한쪽이 덮인다.**
 * 그냥 `{ ...base, ...notZeroedWhere() }` 로 쓰다가 `base` 에 `OR` 가 생기는 날 조용히
 * 깨진다 — `ladderScope.ts` 가 같은 이유로 `withLadderMatch()` 를 둔다.
 */
export function withNotZeroed(
  where: Prisma.MatchPlayerStatWhereInput,
): Prisma.MatchPlayerStatWhereInput {
  return { AND: [where, notZeroedWhere()] }
}
