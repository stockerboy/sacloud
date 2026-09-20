import { HydrationBoundary } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { leagueLandingPath, leagueScreen } from '@sacloud/contract'
import { ClanDirectoryV1 } from '../rank/clan/ClanDirectoryV1'
import { prefetchClanRank } from '../rank/clan/prefetchClanRank'

/**
 * `/league/{slug}/hire` — ★고용 가능 클랜★ (2026-09-20 사장님)
 *
 * > 「지금 열산클랜으로 등록 돼있는 클랜목록 열산리그에 세번째파트로
 * >  고용가능클랜 으로 넣어」
 *
 * ── ★새로 만들지 않았다. 되살렸다★
 *   이 화면은 2026-09-02(D-260)에 사장님이 시키셔서 이미 만들었던 것이다 —
 *   ★순위 없이 가나다순 + 검색★. 09-10 에 클랜랭킹이 돌아오면서 자리를 내줬고,
 *   그때 ★지우지 않고 `ClanDirectoryV1.tsx` 에 남겨 뒀다★ (CLAUDE.md 1-4).
 *   그 판을 그대로 이 주소에 건다 — ★한 줄도 고치지 않았다.★
 *
 * ── ★왜 10산에 필요한가★
 *   10산은 ★클랜 기록을 안 재는 리그★ 라 클랜랭킹 탭이 없다. 그 자리에
 *   「고용 가능 클랜으로 진행하는 리그입니다」 라는 공지만 떠 있었는데,
 *   ★정작 그 클랜이 어디 있는지 볼 자리가 없었다.★ 이 화면이 그 자리다.
 *
 * ── ⚠ 순위가 아니다
 *   ★가나다순으로 늘어놓기만 한다.★ 이 리그는 클랜 기록을 안 재므로
 *   ★줄을 세울 근거가 없다.★ 없는 순위를 지어내지 않는다 (CLAUDE.md 2-1).
 *
 * ⚠ 리그별 분기를 화면에 뿌리지 않는다 — 켜고 끄는 것은
 *   `leagueScreen(slug).hireClans` 한 곳이 정한다 (D-204).
 */
export const revalidate = 60

export default async function HireClansPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params

  /* 이 화면을 안 쓰는 리그로 들어오면 그 리그의 첫 화면으로 보낸다 */
  if (!leagueScreen(leagueSlug).hireClans) redirect(leagueLandingPath(leagueSlug))

  /* 목록을 서버에서 미리 받아 실어 보낸다 — 첫 그림에 클랜이 들어 있게 된다 */
  const { state } = await prefetchClanRank(leagueSlug)

  return (
    <HydrationBoundary state={state}>
      <ClanDirectoryV1 leagueSlug={leagueSlug} />
    </HydrationBoundary>
  )
}
