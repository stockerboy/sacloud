/**
 * ★★CPL 두 진영★★ (2026-09-21~22 사장님)
 *
 * > 「CPL 14개 PL14개니까 ★둘이 대결구도 존나 간지나게★ 만들어
 * >  ★마크를 양쪽에 두고 vs★ 이런식으로
 * >  ★무소속은 무소속섹터에 서플라이는 서플라이 섹터에★ 따로 두고 둘이 비교되게끔」
 * > 「서플라이 클랜이랑 무소속 클랜 ★두 섹터로 나눠서 분리하고 vs로 대결구도처럼★」
 *
 * ── 왜 여기(계약)에 두나
 *
 *   ★명단을 세우는 쪽(워커)과 그리는 쪽(화면)이 같은 목록을 봐야 한다.★
 *   두 곳에 따로 적어 두면 한쪽만 고쳐져서 ★화면에 없는 클랜★ 이 생긴다 —
 *   랭킹 문턱이 워커 40 · 화면 15 로 갈렸던 그 병(2026-09-20)을 또 밟지 않는다.
 *
 * ⚠ ★이름이 아니라 slug 로 박는다★ — 위장문자가 섞여 있어 이름으로는 못 찾는다
 *   (`hing` → `hingˇ` · `valentina` → `vaIentina`(대문자 I) · `amarilys` → `amaryllis`).
 */

/** ★무소속 14곳★ — 2026-09-21 사장님이 직접 주신 목록 */
export const CPL_INDEPENDENT_SLUGS: readonly string[] = [
  'minjihun', //       sometimes
  'ajwjdjwuwuei5', //  grave
  'ferwfwfwfwf', //    deluxe
  'luverduck12', //    igloo
  'hanbi0302', //      luvme
  'ckdals2457', //     hardcores
  'uava01', //         vuvuzela
  '01025606089', //    〃veritas
  'ssdko', //          methodcrew
  '4473', //           evermore
  'fdd8', //           amaryllis
  'adgeodud20', //     hingˇ
  'valentina2', //     vaIentina
  'wdasdw', //         레트로폭탄
]

/** ★서플라이(PL) 14곳★ — 맞은편 진영 */
export const CPL_SUPPLY_SLUGS: readonly string[] = [
  'sorentolove', //    -tsAr.nTc
  'Onepoint', //       One.PoinT
  'Ensemble', //       isyour
  'aksrrzi', //        rNtwo-
  'susucom', //        unfair
  'suddenalexia', //   afterpray
  'DOKKIMAMA', //      Mentalist-
  'LaonJN', //         PokerFace.
  'luminouszzang', //  ctrI
  'inpum', //          respects-
  'Akillclass', //     ThelVub
  'footmania2', //     stylecIan
  'adfafasf', //       ＃chaseplay
  'e2stro2017', //     e2stro-
]

/** 두 진영을 합친 참가 명단 */
export const CPL_ALL_SLUGS: readonly string[] = [
  ...CPL_INDEPENDENT_SLUGS,
  ...CPL_SUPPLY_SLUGS,
]

export type CplSector = 'independent' | 'supply'

/**
 * 그 클랜이 어느 진영인가. ★목록에 없으면 `null`★ — 어느 쪽인지 지어내지 않는다 (D-106).
 */
export function cplSectorOf(slug: string): CplSector | null {
  if (CPL_INDEPENDENT_SLUGS.includes(slug)) return 'independent'
  if (CPL_SUPPLY_SLUGS.includes(slug)) return 'supply'
  return null
}
