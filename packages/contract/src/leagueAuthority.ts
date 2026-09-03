/**
 * **리그 권위와 통합 순위** (O-043 · 2026-09-03 사장님 회의 · 래더 편).
 *
 * ══ 왜 이 판이 생겼나 ══
 *
 * > 사장님: «잘하는 네임드 유저들이 어떤 이유든지 너무 뒤쪽에 있고 못하던 애들이 치고올라와서
 * >  순위권에 올라오는 경우가 생기면 **사람들이 신뢰를 안할까봐**»
 * > «**잘하는 사람들은 거의 잘하는 사람들끼리만 상대로 한다**»
 *
 * 강자끼리만 붙으면 서로 뺏고 뺏겨 점수가 안 오른다. 그리고 —
 *
 * > 사장님: «IPL SPL 열산 모두 다른 리그인걸 잊지마라. **IPL은 IPL이랑 해야 기록이 찍힌다**»
 *
 * ★리그끼리는 「잘 안 붙는」 게 아니라 **구조적으로 절대 안 붙는다.**★
 * 그래서 Elo 로는 리그 간 비교가 영원히 불가능하고, ★권위를 사람이 넣어 주는 수밖에 없다.★
 *
 * ══ 권위 값은 ★사장님이 승률로 주신 것에서 유도했다★ ══
 *
 * 사장님이 주신 승률 (같은 리그 중간 실력자끼리 100판 붙었을 때)
 * ```
 * SPL      vs 열산     65판
 * IPL 1,2  vs SPL      70판
 * IPL 5,6  vs 열산     50판
 * ```
 * ⚠ 처음 주신 넷은 서로 안 맞았다 (IPL1,2 vs 열산을 99판으로 잡으면 798점,
 *   나머지 셋으로 유도하면 255점 — ★3배 차★). 그것을 보여 드리자 사장님이
 *   «**70판이 맞다 내려도된다 내려라**» 라고 정하셨다. ★그래서 255 다.★
 */

/** 리그 하나의 권위 */
export interface LeagueAuthority {
  /** `League.slug` */
  league: string
  /** 티어(division) 범위. 리그 전체면 `null` */
  divisions: readonly number[] | null
  /** Elo 400 환산 권위 점수 — ★리그 간 실력 비교용★ */
  eloBonus: number
  /** 통합 순위에서 곱하는 무게 — ★등수 점수에 곱한다★ */
  weight: number
}

/**
 * ★확정 표★ (열산 = 0 기준). 사장님: «배수 전부 좋다»
 *
 * ⚠ `daerule` 은 표에 없다. ★사장님이 「없는 리그」로 정하셨고 수집도 멈췄다★ (O-042).
 *   그래서 통합 순위에 넣지 않는다 — 무게가 없으면 더해지지 않는다.
 */
export const LEAGUE_AUTHORITY: readonly LeagueAuthority[] = [
  { league: 'nolink', divisions: [1, 2], eloBonus: 255, weight: 3 },
  { league: 'nolink', divisions: [3, 4], eloBonus: 108, weight: 2 },
  { league: 'nolink', divisions: [5, 6], eloBonus: 0, weight: 1 },
  { league: 'supply', divisions: null, eloBonus: 108, weight: 2 },
  { league: 'sanply', divisions: null, eloBonus: 0, weight: 1 },
]

/** 그 리그·티어의 권위. 표에 없으면 `null` — ★통합 순위에 안 들어간다★ */
export function authorityOf(leagueSlug: string, division: number): LeagueAuthority | null {
  return (
    LEAGUE_AUTHORITY.find(
      (a) => a.league === leagueSlug && (a.divisions === null || a.divisions.includes(division)),
    ) ?? null
  )
}

/**
 * **등수를 0~100 점으로** — 사장님이 (가)로 정하셨다.
 *
 * > «① 리그마다 「그 리그에서 몇 등인가」를 **0~100점**으로 바꾼다
 * >  ★1등 100점 · 꼴등 0점 · 사이는 등수대로 고르게★»
 *
 * ```
 * 점수 = 100 × (전체인원 − 내등수) / (전체인원 − 1)
 * ```
 * ⚠ 혼자뿐이면 나눌 수가 없다 — ★1등이므로 100점★ 으로 둔다.
 * ⚠ `rank` 는 **1부터**다. 0 을 넣으면 100 을 넘는다 — 부르는 쪽이 1부터 준다.
 */
export function rankScore(rank: number, total: number): number {
  if (total <= 1) return 100
  return (100 * (total - rank)) / (total - 1)
}

/**
 * **통합 점수 = Σ(등수 점수 × 무게)** — ★평균이 아니라 합★ 이다.
 *
 * ══ ★가중평균은 쓰지 않는다★ ══
 *
 * 사장님 예시로 계산해 보니 가중평균은 **여러 리그를 뛴 게 손해**가 됐다 —
 * 낮은 점수가 섞여 내려가기 때문이다. 사장님 뜻은 그 반대다.
 *
 * > «**열산 1위가 통합 1위가 될수는 없다.** 근데 이럴수는 있다 —
 * >  IPL 기록20판(4-5티어물) SPL 400판 1위 열산 1000판 1위 이렇게 해서 통합 1등이 될수는 있다»
 *
 * ```
 * 열산만 1등           100 × 1 = 100
 * SPL 1등 + 열산 1등   100×2 + 100×1 = ★300★
 * ```
 * ★한 리그만 파서는 통합 1위가 안 된다.★ 여러 리그에서 다 잘해야 한다.
 */
export function unifiedScore(
  entries: readonly { leagueSlug: string; division: number; rank: number; total: number }[],
): number {
  let sum = 0
  for (const e of entries) {
    const a = authorityOf(e.leagueSlug, e.division)
    if (!a) continue /* 표에 없는 리그는 안 더한다 (daerule) */
    sum += rankScore(e.rank, e.total) * a.weight
  }
  return sum
}
