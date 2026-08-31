import { redirect } from 'next/navigation'
import { prisma } from '@sacloud/db'
import { resolveLeagueId } from '@/lib/server/queries/leagues'

/**
 * `/league/{slug}/rank/clan` → **클랜이 실제로 있는 첫 부리그**.
 *
 * ── 왜 1부로 고정하면 안 되나 (2026-08-31 실측)
 *   IPL 은 **1티어를 비워 둔다** (`docs/IPL_SPEC.md` · 사용자 지시).
 *   그래서 1부에는 클랜이 한 곳도 없다 — 실측 분포는 2부 11 · 3부 7 · 4부 9 · 5부 10 · 6부 6 이다.
 *   그런데 이 페이지가 무조건 `/1` 로 보내서 **클랜랭킹을 누르면 빈 화면**이 떴다.
 *
 *   "1부가 비어 있을 수 있다" 는 IPL 만의 사정이 아니다. 리그마다 부리그 구성이 다르므로
 *   **화면이 데이터를 보고 정한다.** 부리그 번호를 코드에 박지 않는다.
 *
 * ── 아무 데도 클랜이 없으면
 *   그때는 1부로 보낸다. 빈 화면이 뜨지만 그건 **정말로 비어 있다는 뜻**이라 맞는 표시다.
 */
export default async function ClanRankIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params

  const leagueId = await resolveLeagueId(leagueSlug)
  let division = 1

  if (leagueId) {
    /* 랭킹 화면은 배치고사 중인 클랜을 빼고 보여 준다. 그 조건을 그대로 써서 고른다 */
    const first = await prisma.leagueClan.findFirst({
      where: { leagueId, placement: false },
      orderBy: { division: 'asc' },
      select: { division: true },
    })
    /* 전부 배치고사면 «클랜이 있는» 부리그로라도 보낸다 — 배치고사 안내가 보이는 편이 낫다 */
    const fallback = first
      ? null
      : await prisma.leagueClan.findFirst({
          where: { leagueId },
          orderBy: { division: 'asc' },
          select: { division: true },
        })
    division = first?.division ?? fallback?.division ?? 1
  }

  redirect(`/league/${leagueSlug}/rank/clan/${division}`)
}
