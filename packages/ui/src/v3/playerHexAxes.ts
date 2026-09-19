/**
 * ★선수 여섯 축 → 그림 입력★ — 한 곳에서만 만든다 (2026-09-12).
 *
 * 두 화면이 같은 그림을 그린다 —
 *   ① 머리 카드 왼쪽 (사장님: «왼쪽 정보들 오른쪽에 몰아넣고 공간 만들어서 저기도 그래프»)
 *   ② STRENGTH POINT 카드
 * 규칙을 두 곳에 적으면 조용히 갈라진다. 그래서 이 파일 하나만 본다.
 */
import { PLAYER_HEX_WEAPON_POOL_AXIS_KEYS, type LeaguePlayerDetail } from '@sacloud/contract'
import type { HexAxisView } from './Hexagon'
import { hexTierOf } from './hexTierLabel'
/* ⚠ `playerHexSteps` 는 2026-09-20 에 등급으로 바뀌며 안 쓰게 됐다 — 되돌릴 때 필요하다 */
import { rankColorPlayerHexAxis } from './rankColors'
import { V3 } from './tokens'

/**
 * ★축마다 모집단이 다르다★ (2026-09-12 사장님).
 *
 * > «스나싸움이랑 샷싸움만 라플끼리 스나끼리 비교해서 랭크매기고
 * >  나머지는 전부 다 통합으로 비교분석해»
 *
 * 셈은 워커(`playerHexScore.foldPlayerHex`)가 한다. 여기서는 이름만 붙인다.
 */
export function poolNameOf(key: string, weapon: 0 | 1 | null): string {
  /*
   * ⚠ ★여기가 «싸움» 하나만 알고 있었다★ (2026-09-16 밤 사장님:
   *   «통합 이라고 하면 안되고 스나수중 이라고 해야지»).
   *   그 사이 게임템포·크랙 성공도 무기별이 됐는데 이 줄만 안 따라와서
   *   «스나수 171명중» 이어야 할 자리에 «통합 171명중» 이라 적혔다.
   *   ★목록은 계약 한 곳에만 둔다★ — 축이 또 늘어도 여기는 안 고친다.
   */
  if (!PLAYER_HEX_WEAPON_POOL_AXIS_KEYS.includes(key as never)) return '통합'
  return weapon === 1 ? '스나수' : weapon === 0 ? '라플수' : '같은 무기'
}

export function strengthAxes(data: LeaguePlayerDetail): HexAxisView[] {
  const hex = data.hex
  if (!hex) return []
  return hex.axes.map((a) => ({
    label: a.label,
    value: a.percentile,
    /*
     * ★「n위」 가 아니라 「등급」★ (2026-09-20 사장님:
     *   「N명중 n위 이렇게 쓰지말고 최하위권 … 최상위권 3,2,1위 이렇게 해줘」)
     * ⚠ 1·2·3위만 숫자로 남는다. 옛 판은 `${a.rank}위` 였다.
     */
    note: a.rank === null ? '측정중' : (hexTierOf(a.rank, a.total)?.label ?? `${a.rank}위`),
    /* ★싸움 3위 · 나머지 5위★ (2026-09-12 사장님). 배지와 같은 경계다 */
    /* ★경계는 리그마다 다르다★ (2026-09-13 사장님) —
       IPL 10/50/100 (749명) · SPL·열산 5/10/20 (117명 · 171명).
       옛 판들: `rankColorHexAxis(rank, key === 'duel')`(싸움 3위·나머지 5위) → 10/50/100 한 벌 */
    /* ★상위권부터 더 잘 보이는 색★ (2026-09-20 사장님). 옛 색은 `rankColorPlayerHexAxis` 다 */
    noteColor:
      a.rank === null
        ? V3.textGhost
        : (hexTierOf(a.rank, a.total)?.color ?? rankColorPlayerHexAxis(a.rank, data.league.slug)),
    /*
     * ⚠ ★「1,161명 중」 을 뗐다★ (2026-09-20 사장님). 등급이 이미 자리를 말해 준다.
     *   모집단 이름(«스나수» · «라플수»)은 남긴다 — ★누구와 견줬는지★ 는 알아야 한다.
     *   옛 줄: `${poolNameOf(a.key, hex.weapon)} ${fmt(a.total)}명중`
     */
    note2: a.rank === null || a.total === null ? null : poolNameOf(a.key, hex.weapon),
    /* ★맨 윗칸(빨강)만 더 세게★ — 경계가 리그마다 다르니 숫자를 여기 또 적지 않는다 */
    /* ★상위권(상위 5%) 위로만 강하게★ — 등급과 같은 자를 쓴다 */
    strong: hexTierOf(a.rank, a.total)?.strong ?? false,
  }))
}
