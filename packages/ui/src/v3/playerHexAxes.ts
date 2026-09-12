/**
 * ★선수 여섯 축 → 그림 입력★ — 한 곳에서만 만든다 (2026-09-12).
 *
 * 두 화면이 같은 그림을 그린다 —
 *   ① 머리 카드 왼쪽 (사장님: «왼쪽 정보들 오른쪽에 몰아넣고 공간 만들어서 저기도 그래프»)
 *   ② STRENGTH POINT 카드
 * 규칙을 두 곳에 적으면 조용히 갈라진다. 그래서 이 파일 하나만 본다.
 */
import type { LeaguePlayerDetail } from '@sacloud/contract'
import type { HexAxisView } from './Hexagon'
import { rankColorHexAxis } from './rankColors'
import { V3, fmt } from './tokens'

/**
 * ★축마다 모집단이 다르다★ (2026-09-12 사장님).
 *
 * > «스나싸움이랑 샷싸움만 라플끼리 스나끼리 비교해서 랭크매기고
 * >  나머지는 전부 다 통합으로 비교분석해»
 *
 * 셈은 워커(`playerHexScore.foldPlayerHex`)가 한다. 여기서는 이름만 붙인다.
 */
export function poolNameOf(key: string, weapon: 0 | 1 | null): string {
  if (key !== 'duel') return '통합'
  return weapon === 1 ? '스나수' : weapon === 0 ? '라플수' : '같은 무기'
}

export function strengthAxes(data: LeaguePlayerDetail): HexAxisView[] {
  const hex = data.hex
  if (!hex) return []
  return hex.axes.map((a) => ({
    label: a.label,
    value: a.percentile,
    note: a.rank === null ? '측정중' : `${a.rank}위`,
    /* ★싸움 3위 · 나머지 5위★ (2026-09-12 사장님). 배지와 같은 경계다 */
    noteColor: a.rank === null ? V3.textGhost : rankColorHexAxis(a.rank, a.key === 'duel'),
    note2: a.rank === null || a.total === null ? null : `${poolNameOf(a.key, hex.weapon)} ${fmt(a.total)}명중`,
    /* ★10위 안은 더 세게★ (2026-09-11 사장님) */
    strong: a.rank !== null && a.rank <= 10,
  }))
}
