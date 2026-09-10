import 'server-only'
import { QueryClient, dehydrate } from '@tanstack/react-query'
import { PAGE_SIZE } from '@sacloud/contract'
import { getPlayerRanks, resolveLeagueId } from '@/lib/server/queries/leagues'
import { getFormTop } from '@/lib/server/queries/rankings'

/**
 * ★개인랭킹 첫 화면을 서버에서 그린다★ (2026-09-10).
 *
 * 클랜랭킹과 ★똑같은 방법★ 이다 — 까닭·함정은
 * `../clan/prefetchClanRank.ts` 주석에 한 번만 적어 두었다. 여기서 되풀이하지 않는다.
 *
 * ── ★첫 화면 몫만 담는다★
 *   무기 축은 셋(`통합·스나·라플`)인데 ★처음 열리는 것은 `all` 하나★ 다.
 *   나머지 둘까지 미리 받으면 DB 를 세 배로 읽고 ★아무도 안 보는 값★ 을 만든다.
 *   칩을 누르면 그때 브라우저가 받는다 — 예전과 같다.
 *
 * ── ★열쇠와 모양은 라우트와 한 글자도 같아야 한다★
 *   ```
 *   ['ranks','players',slug,'all']  { message, data, metadata:{cursor} }   .../ranks/players
 *   ['ranks','form',   slug,'all']  { message, data }                     .../ranks/form
 *   ```
 *
 * ── ★못 받아도 화면은 열린다★
 *   답이 없으면 아무것도 안 담고 넘어간다. 그러면 예전처럼 브라우저가 물어본다.
 */

const SUCCESS = 'success'

/** 첫 화면의 무기 축. 화면의 `useState<RankWeapon>('all')` 과 같은 값이다 */
const FIRST_WEAPON = 'all'

export async function prefetchPlayerRank(leagueSlug: string) {
  const client = new QueryClient()

  const leagueId = await resolveLeagueId(leagueSlug).catch(() => null)
  if (!leagueId) return dehydrate(client)

  const [page, form] = await Promise.all([
    getPlayerRanks(leagueId, null, PAGE_SIZE.RANK).catch(() => null),
    getFormTop(leagueId, FIRST_WEAPON).catch(() => null),
  ])

  if (page) {
    client.setQueryData(['ranks', 'players', leagueSlug, FIRST_WEAPON], {
      pages: [{ message: SUCCESS, data: page.items, metadata: { cursor: page.cursor } }],
      pageParams: [null],
    })
  }
  if (form) {
    client.setQueryData(['ranks', 'form', leagueSlug, FIRST_WEAPON], {
      message: SUCCESS,
      data: form,
    })
  }

  return dehydrate(client)
}
