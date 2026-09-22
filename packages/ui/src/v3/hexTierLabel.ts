/**
 * ★육각 축을 「몇 위」 가 아니라 「등급」 으로 말한다★ (2026-09-20 사장님)
 *
 * > 「개인6각이랑 클랜6각 N명중 n위 이렇게 쓰지말고
 * >  최하위권 하위권 중하위권 중위권 중상위권 상위권 최상위권 3,2,1위 이렇게 해줘
 * >  상위권기준 빡세게 잡아줘
 * >  그리고 상위권부터는 더 잘보이고 강조되는 색으로 해줘」
 *
 * ── 왜 등급인가
 *   「1,161명 중 277위」 는 ★잘한 건지 못한 건지 한눈에 안 들어온다.★
 *   사람은 «상위권» 이라는 말로 자기 자리를 안다.
 *
 * ── 경계 (사장님: 「상위권기준 빡세게」)
 *   ```
 *     1 · 2 · 3위        그대로 숫자로            ← 셋뿐이다
 *     최상위권   상위 ★1%★
 *     상위권     상위 ★5%★
 *     중상위권   상위 ★20%★
 *     중위권     상위 ★50%★
 *     중하위권   상위 ★75%★
 *     하위권     상위 ★90%★
 *     최하위권   그 아래
 *   ```
 *   ⚠ ★일부러 빡세게 잡았다.★ 흔한 등급 나누기(상위 10%)보다 두 배 좁다 —
 *     사장님이 배지도 「너무 흔해빠졌다」 고 하셨던 것과 같은 뜻이다.
 *
 * ── 색 (사장님: 「상위권부터는 더 잘보이고 강조되는 색으로」)
 *   상위권 위로는 ★밝고 진한 색★, 중위권 아래는 ★차분한 회색 계열★ 이다.
 *   그래야 «잘한 축» 이 눈에 먼저 들어온다.
 */

/** 등급 한 칸 */
export interface HexTier {
  /** 화면에 적을 말 (`1위` · `상위권` …) */
  label: string
  /** 글자색 */
  color: string
  /** ★강조할 칸인가★ — 상위권 위로는 참이다 */
  strong: boolean
}

/*
 * 위에서부터 — [여기까지가 이 등급이다(%), 이름, 색]
 * ⚠ 2026-09-22 흰 바탕용 진하기로. 옛 값(다크 배경용, 지우지 않는다 — 1-4):
 *   최상위권 #ffd83d · 상위권 #ff9a3d · 중상위권 #7fd4ff
 */
const STEPS: readonly [number, string, string][] = [
  [1, '최상위권', '#b8860b'],
  [5, '상위권', '#c2600a'],
  [20, '중상위권', '#0e86c4'],
  [50, '중위권', '#9aa6bf'],
  [75, '중하위권', '#7a869e'],
  [90, '하위권', '#68738a'],
  [100, '최하위권', '#5a6478'],
]

/** 1·2·3위에만 쓰는 색 — 금·은·동. ⚠ 흰 바탕용. 옛 값(다크): #ffd83d · #dfe6f2 · #e0a14a — 1-4 */
const PODIUM: readonly string[] = ['#b8860b', '#7b8494', '#a9672c']

/**
 * 등수와 모집단으로 등급을 낸다.
 *
 * ⚠ ★모르면 `null` 이다★ — 「측정중」 을 부르는 쪽이 적는다. 지어내지 않는다.
 */
export function hexTierOf(
  rank: number | null | undefined,
  total: number | null | undefined,
): HexTier | null {
  if (rank === null || rank === undefined) return null
  if (total === null || total === undefined) return null
  if (!Number.isFinite(rank) || !Number.isFinite(total)) return null
  if (rank < 1 || total < 1 || rank > total) return null

  /* ★1·2·3위는 숫자 그대로★ — 사장님이 그렇게 적으셨다 */
  if (rank <= 3) {
    return { label: `${rank}위`, color: PODIUM[rank - 1] ?? PODIUM[0]!, strong: true }
  }

  const pct = (rank / total) * 100
  for (const [max, label, color] of STEPS) {
    if (pct <= max) return { label, color, strong: max <= 5 }
  }
  const last = STEPS[STEPS.length - 1]!
  return { label: last[1], color: last[2], strong: false }
}
