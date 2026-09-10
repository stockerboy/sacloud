import { HydrationBoundary } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { leagueLandingPath, leagueScreen } from '@sacloud/contract'
import { ClanDirectory } from './ClanDirectory'
import { prefetchClanRank } from './prefetchClanRank'

/**
 * `/league/{slug}/rank/clan` — ★클랜랭킹★ (2026-09-10 사장님 지시로 순위가 돌아왔다).
 *
 * > «여유되면 클랜랭킹까지 매기고 ★지금 클랜랭킹페이지에 클랜들이 그냥 나열만 돼있음★»
 *
 * 화면은 그대로 `ClanDirectory` 다 — 안에서 ★순위표★ 를 그린다 (래더 내림차순 · 티어 구분선).
 * 옛 「고용가능 클랜」(순위 없는 이름순)은 `./ClanDirectoryV1.tsx` 에 그대로 있고,
 * `ClanDirectory.tsx` 의 `RANKED` 를 `false` 로 두면 돌아온다 (`CLAUDE.md` 1-4).
 *
 * ⚠ 옛 서술 (2026-09-02 사용자 지시 · D-260) — 그때는 순위를 없애라고 하셨다.
 *
 * > "SPL 리그 누르면 두가지 메뉴 첫번째가 클랜 -1부2부 분류 체계 아예 없애기 1,2부라는 개념x"
 * > "클랜순위는 없애고 고용가능 클랜 이라는 항목으로 소속된 클랜 전부 보여주기"
 * > (두 칸 분할 랭킹에 대해) "이건 폐지"
 *
 * ── 그때 없어진 것 셋 (①②는 지금도 그대로다 · ③만 오늘 뒤집혔다)
 *   ```
 *   ① 부리그로 넘기던 흐름   «클랜이 있는 첫 부리그» 를 찾아 `/rank/clan/{division}` 으로
 *                            보내던 DB 질의가 통째로 없다. 1,2부 개념이 없으니 고를 것도 없다
 *   ② SPL·IPL 두 칸 분할     `ClanRankSplit` 을 부르지 않는다 (사용자: "이건 폐지").
 *                            **파일은 지우지 않았다** — `./ClanRankSplit.tsx` 에 그대로 있고
 *                            되돌리려면 이 파일에서 그걸 부르면 된다 (`CLAUDE.md` 10-4)
 *   ③ 클랜순위               순위 숫자 칸을 내렸었다 → ★2026-09-10 에 도로 붙였다.★
 *                            값(승률·승패·래더·클랜마크)은 그때도 지금도 그대로다
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

/**
 * ★알맹이까지 담아서 굳힌다★ (2026-09-10 · 폰 첫 화면이 2~4초 비어 있던 것).
 *
 * 60초마다 뒤에서 다시 만든다. ★람다는 리그당 60초에 한 번만 깬다★ —
 * 방문 수와 무관하다는 O-016 의 알맹이는 그대로다. 까닭은 `prefetchClanRank.ts` 에 적었다.
 * 되돌리려면 이 줄만 지운다. 그러면 예전처럼 빈 껍데기가 캐시된다 (`CLAUDE.md` 1-4).
 */
export const revalidate = 60

export default async function ClanIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params

  if (!leagueScreen(leagueSlug).clanRank) redirect(leagueLandingPath(leagueSlug))

  /* 목록을 서버에서 미리 받아 화면에 실어 보낸다 — 첫 그림에 클랜이 들어 있게 된다 */
  const { state, category } = await prefetchClanRank(leagueSlug)

  return (
    <HydrationBoundary state={state}>
      <ClanDirectory leagueSlug={leagueSlug} leagueCategory={category} />
    </HydrationBoundary>
  )
}
