import { redirect } from 'next/navigation'
import { leagueLandingPath, leagueScreen } from '@sacloud/contract'
import { ClanDirectory } from './ClanDirectory'

/**
 * `/league/{slug}/rank/clan` — **「고용가능 클랜」** (2026-09-02 사용자 지시 · D-260).
 *
 * > "SPL 리그 누르면 두가지 메뉴 첫번째가 클랜 -1부2부 분류 체계 아예 없애기 1,2부라는 개념x"
 * > "클랜순위는 없애고 고용가능 클랜 이라는 항목으로 소속된 클랜 전부 보여주기"
 * > (두 칸 분할 랭킹에 대해) "이건 폐지"
 *
 * ── 여기서 없어진 것 셋
 *   ```
 *   ① 부리그로 넘기던 흐름   «클랜이 있는 첫 부리그» 를 찾아 `/rank/clan/{division}` 으로
 *                            보내던 DB 질의가 통째로 없다. 1,2부 개념이 없으니 고를 것도 없다
 *   ② SPL·IPL 두 칸 분할     `ClanRankSplit` 을 부르지 않는다 (사용자: "이건 폐지").
 *                            **파일은 지우지 않았다** — `./ClanRankSplit.tsx` 에 그대로 있고
 *                            되돌리려면 이 파일에서 그걸 부르면 된다 (`CLAUDE.md` 10-4)
 *   ③ 클랜순위               순위 숫자 칸을 내렸다. 값(승률·승패·래더)은 그대로다
 *   ```
 *
 * ── 옛 부리그 탭 화면
 *   `/rank/clan/{division}` 라우트는 **살아 있다.** 들어오면 여기로 보낸다.
 *   화면 코드도 `[division]/ClanRankDivisionLegacy.tsx` 에 그대로 남겨 뒀다.
 *
 * ── `10mountain`(`sanply`)
 *   클랜 화면이 없는 리그는 개인순위로 보낸다 (D-245). 그 판단은 화면이 아니라
 *   `leagueScreen()` 한 곳이 한다 — 리그별 분기를 화면에 뿌리지 않는다 (D-204).
 */
/**
 * **껍데기를 굳힌다** (2026-09-03 · O-016).
 *
 * 이 파일은 이미 서버 컴포넌트라 가를 필요가 없었다 — 두 줄만 더한다.
 * 자세한 이유는 `app/player/[playerId]/page.tsx` 에 한 번만 적어 두었다.
 */

/** 빈 배열이다 — 미리 만들 목록이 없다. 빌드에서 DB 를 보지 않는다 */
export function generateStaticParams(): { leagueSlug: string }[] {
  return []
}

/** 목록에 없는 리그도 열린다. 첫 요청 때 만들어져 캐시된다 */
export const dynamicParams = true

export default async function ClanIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params

  if (!leagueScreen(leagueSlug).clanRank) redirect(leagueLandingPath(leagueSlug))

  return <ClanDirectory leagueSlug={leagueSlug} />
}
