import { redirect } from 'next/navigation'
import { prisma } from '@sacloud/db'
import { isRankSplitLeague, leagueLandingPath, leagueScreen } from '@sacloud/contract'
import { resolveLeagueId } from '@/lib/server/queries/leagues'
import { ClanRankSplit } from './ClanRankSplit'

/**
 * `/league/{slug}/rank/clan`.
 *
 * ── SPL · IPL 은 **두 칸짜리 합친 화면**이다 (2026-09-01 사용자 지시)
 *   *"클랜랭킹 그냥 SPL이랑 IPL 한공간에 둬 SPL이 왼쪽 IPL이 오른쪽"*
 *
 *   그래서 이 두 리그는 부리그로 넘기지 않고 여기서 바로 그린다.
 *   **어느 쪽으로 들어와도 같은 화면**이다 — `/league/supply/rank/clan` 과
 *   `/league/nolink/rank/clan` 이 둘 다 SPL+IPL 을 보여 준다. 라우트는 그대로 살아 있다.
 *
 *   `10mountain`(`sanply`) 은 여기 없다. 개인기록만 있는 비공식 리그라 아래의
 *   기존 «첫 부리그로 보낸다» 흐름을 그대로 쓴다 (D-245).
 *
 *   ⚠ 옛 화면(부리그 탭)은 **지우지 않았다** — `/rank/clan/{division}` 에 그대로 있다
 *     (`CLAUDE.md` 10-4). 되돌리려면 아래 분기 한 줄만 빼면 된다.
 *
 * ── 아래는 나머지 리그의 흐름이다: **클랜이 실제로 있는 첫 부리그**로 보낸다
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

  /* SPL · IPL 은 합친 화면이다. 부리그를 고르러 가지 않는다 */
  if (isRankSplitLeague(leagueSlug)) return <ClanRankSplit />

  /* 클랜 화면이 없는 리그(`10🏔`)는 개인랭킹으로 보낸다 (D-245).
     라우트를 지우지 않고 **화면에서만** 빠지게 한다 (`CLAUDE.md` 10-4) */
  if (!leagueScreen(leagueSlug).clanRank) redirect(leagueLandingPath(leagueSlug))

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
