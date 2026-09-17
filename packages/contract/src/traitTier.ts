/**
 * ★특성 등급★ — 한 축에서 그 선수가 리그 안 어디쯤인가 (2026-09-17 사장님 확정).
 *
 * > 「5위 이내는 최상위권 10퍼센트 이내는 상위권 30퍼이내는 중상위권
 * >  30-60 중위권 60-70중하위권 70- 90하위권 90-100 최하위권 이런 기준으로 써줘」
 *
 * ── 왜 한 곳에 두나
 *   경계 숫자가 화면마다 흩어지면 ★같은 선수가 화면마다 다른 등급★ 이 된다.
 *   실제로 그 일이 있었다 — 배지 컷(5위)이 계약에 있고 색 경계(3/20/40/100)가
 *   따로 있어서 「배지는 있는데 색은 평범」 같은 줄이 나왔다.
 *   판정은 이 파일 하나가 한다. 화면은 `traitTierOf()` 를 부르기만 한다.
 *
 * ── ★등수와 비율을 같이 본다★
 *   맨 위 한 칸만 ★등수★ 다 (5위 이내). 나머지는 전부 ★비율★ 이다.
 *   까닭은 사장님이 정하신 그대로다 — 리그가 작으면 10% 가 두세 명뿐이라
 *   「상위권」이 너무 귀해지고, 리그가 크면 5위가 상위 1% 라 너무 흔해진다.
 *   둘을 겹쳐 두면 리그 크기가 달라져도 말이 통한다.
 *
 * ── 경계는 「이하」다
 *   `30% 이내` 는 30.0 을 포함한다. 사장님이 「30퍼이내」라고 쓰셨다.
 *   30 과 60 사이(30 초과 60 이하)가 중위권이다. 빈틈도 겹침도 없다.
 */

/** 등급 열쇠 — 좋은 쪽에서 나쁜 쪽 순서다 */
export const TRAIT_TIER_KEYS = [
  'best',
  'high',
  'midHigh',
  'mid',
  'midLow',
  'low',
  'worst',
] as const
export type TraitTierKey = (typeof TRAIT_TIER_KEYS)[number]

/** 화면에 적는 이름 — 사장님이 쓰신 말 그대로다 */
export const TRAIT_TIER_LABEL: Record<TraitTierKey, string> = {
  best: '최상위권',
  high: '상위권',
  midHigh: '중상위권',
  mid: '중위권',
  midLow: '중하위권',
  low: '하위권',
  worst: '최하위권',
}

/** ★최상위권은 등수로 가른다★ — 5위 이내 */
export const TRAIT_TIER_BEST_RANK = 5

/**
 * 비율 경계 (%) — 「이 값 이하」면 그 등급이다.
 * `best` 는 등수로 가르므로 여기 없다.
 */
export const TRAIT_TIER_PCT_MAX: Record<Exclude<TraitTierKey, 'best'>, number> = {
  high: 10,
  midHigh: 30,
  mid: 60,
  midLow: 70,
  low: 90,
  worst: 100,
}

/**
 * 그 축에서 이 선수는 어느 등급인가.
 *
 * @param rank  리그 안 등수 (1 = 최고). 모르면 `null`
 * @param total 그 축을 잰 사람 수 (모집단). 모르면 `null`
 * @returns 못 재면 `null` — ★0 으로 찍지 않는다★ (D-106: 0 은 꼴찌라는 뜻이다)
 *
 * ⚠ 모집단이 1명이면 비율이 100% 가 되어 「최하위권」이 된다. 그래서 ★혼자면 안 준다★ —
 *   견줄 상대가 없는데 등급을 매기는 것은 지어내는 것이다.
 */
export function traitTierOf(
  rank: number | null | undefined,
  total: number | null | undefined,
): TraitTierKey | null {
  if (rank === null || rank === undefined) return null
  if (total === null || total === undefined) return null
  if (!Number.isFinite(rank) || !Number.isFinite(total)) return null
  if (rank < 1 || total < 2) return null
  if (rank > total) return null

  if (rank <= TRAIT_TIER_BEST_RANK) return 'best'

  /* 등수를 비율로 — 1위가 가장 작은 값이 되게 */
  const pct = (rank / total) * 100
  for (const key of ['high', 'midHigh', 'mid', 'midLow', 'low'] as const) {
    if (pct <= TRAIT_TIER_PCT_MAX[key]) return key
  }
  return 'worst'
}

/**
 * ★랭킹 표에 앰블럼을 달 등급인가★ (2026-09-17 사장님:
 * 「상위10프로 안에 드는 특성들은 앰블럼을 줘」).
 *
 * 최상위권·상위권 둘뿐이다. 그 아래까지 달면 스무 줄이 전부 앰블럼 밭이 된다.
 */
export function traitTierGetsEmblem(tier: TraitTierKey | null): tier is 'best' | 'high' {
  return tier === 'best' || tier === 'high'
}
