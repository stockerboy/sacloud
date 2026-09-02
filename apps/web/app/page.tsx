import { HomeSearch } from './_home/HomeSearch'
import { HomeRankPreview } from './_home/HomeRankPreview'
import { HomeRecentMatches } from './_home/HomeRecentMatches'
import { getHomeRankPreview, getHomeRecentMatches } from './_home/homeData'

/**
 * 홈.
 *
 * ── 2026-09-02: **「사이트 소개」를 빼고 그 자리에 실제 데이터를 넣었다** (사장님 지시)
 *   ```
 *   0 로고        ← 작게. 워드마크 하나 (MainLogo)
 *   1 통합검색     ← 화면의 주인공. 크고 가운데          ┐ `_home/HomeSearch.tsx`
 *   2 리그 바로가기 ← 누르면 **바로 랭킹**                ┘ (클라이언트 · 동작 그대로)
 *   ─────────────
 *   3 리그별 개인랭킹   SPL · IPL · 10mountain 각 상위 5명 · 누르면 그 리그 랭킹
 *   4 최근 경기        IPL 왼쪽 / SPL 오른쪽 · 각 5경기 · 꺾쇠를 누르면 펼쳐진다
 *   ```
 *
 *   **`SiteIntro` 는 지우지 않았다.** `packages/ui/src/home/SiteIntro.tsx` 에 그대로 있고
 *   export 도 남아 있다. **이 화면이 안 부를 뿐이다** (`CLAUDE.md` 10-4).
 *   되돌리려면 이 파일 맨 아래에 `<SiteIntro />` 한 줄이면 된다.
 *
 *   ── 이 파일은 이제 **서버 컴포넌트**다
 *     3 · 4 는 DB 를 읽어야 한다. 홈이 열릴 때 API 를 여러 번 부르는 대신 서버에서
 *     한 번에 읽어 넘긴다 (`_home/homeData.ts` — 순서대로 읽고 10분 데이터 캐시).
 *     그래서 `useState` 를 가진 검색 부분을 `_home/HomeSearch.tsx` 로 떼어냈다.
 *     화면 조각(`HomeRankPreview` · `HomeRecentMatches`)은 랭킹 표·경기 카드를
 *     **재사용**하므로 클라이언트 컴포넌트이고, 서버는 JSON 값만 넘긴다.
 *
 *   ── `force-dynamic`
 *     동적 API 를 안 쓰는 페이지는 빌드 때 정적으로 굳는다 — 그러면 랭킹이 배포 시점에
 *     멈춘다. 매 요청 렌더로 두되 DB 는 데이터 캐시가 막는다 (`homeData.ts` 주석).
 *
 *   ── 메인에서 나가는 요청 (2026-09-02 기준)
 *     ```
 *     없음   홈이 열릴 때 클라이언트가 보내는 요청은 없다 (검색은 누를 때만)
 *     펼침   경기 카드 꺾쇠를 누를 때만 GET /leagues/{slug}/matches/{id} 하나
 *     ```
 *
 * ── 옛 서술 (2026-09-01 밤 · 지금은 위 구성이 대신한다)
 *   **알 모음집과 인기게시글을 뺐다** (사용자 지시)
 *   ```
 *   "애초에 알시스템은 걍 버려 필요없어 게시판 준비중으로 냅두고 마이페이지는 해야돼"
 *   ```
 *   남은 구성은 이렇게 짧아졌다.
 *   ```
 *   0 로고        ← 작게. 워드마크 하나 (MainLogo)
 *   1 통합검색     ← 화면의 주인공. 크고 가운데
 *   2 리그 바로가기 ← 누르면 **바로 랭킹**
 *   ─────────────
 *   3 사이트 소개 (꼬리말)
 *   ```
 *
 *   **알 모음집(`LeagueEggGallery` 두 벌 · SPL · IPL)** — 알 시스템을 버렸다.
 *   컴포넌트(`app/_egg/**` · `packages/ui/src/egg/**`)는 **지우지 않았다.**
 *   이 화면이 안 쓸 뿐이고, 스위치는 `EGG_SYSTEM_ENABLED` 하나다 (`CLAUDE.md` 10-4).
 *
 *   **인기게시글(`HotPostList`)** — 게시판을 준비중으로 닫았기 때문이다.
 *   목록은 `/board/hot/{id}` 로 들어가는데 그 문이 잠겼다. 눌러도 「준비중」만 뜨는
 *   제목 목록을 메인에 세워 두면 **막다른 길**이 된다. 목록만 있고 못 여는 것이
 *   없는 것보다 나쁘다. `HotPostList` 도 `packages/ui` 에 그대로 있다.
 *
 *   빈자리를 남기지 않았다 — 「윗머리」 아래 가르던 `<hr>` 까지 같이 뺐다.
 *   가를 것이 없는데 선만 남으면 아래가 잘려 보인다 (`CLAUDE.md` 4장의 광고 처리와 같다).
 *   그만큼 **메인에서 나가는 요청도 줄었다** — 아래 「나가는 요청」 참조.
 *
 *   메인에서 나가는 요청 (2026-09-01 밤 기준)
 *   ```
 *   없앰  GET /eggs/broken                    ← 알 (전역 EggBoot)
 *   없앰  GET /me/link                        ← 알 (전역 EggBoot)
 *   없앰  GET /players/{id} · /clans/{slug}   ← 알 (로그인·연동돼 있을 때만 나가던 것)
 *   없앰  GET /leagues/supply/clans (커서를 끝까지 따라감 · 최대 15장)
 *   없앰  GET /leagues/nolink/clans (〃)
 *   없앰  GET /boards?category=hot            ← 인기게시글
 *   남음  검색은 **누를 때만** 나간다. 가만히 있으면 한 건도 안 나간다
 *   ```
 *
 * ── 옛 서술 (2026-09-01): **신전 히어로를 뺐다.** op.gg 식으로 정리 (사용자 지시)
 *   ```
 *   "파일 찾기 가챠샵 전부 삭제하고 심플이즈 더 베스트다 op.gg 스타일 Ui로
 *    걍 깔끔하게 간다 진짜 깔끔이 젤 중요하다"
 *   ```
 *   op.gg 메인은 **로고 하나 · 큰 검색창 하나 · 그 아래 조용한 목록**이 전부다.
 *   장식이 없다. 그게 «깔끔» 이다. 그래서 이렇게 됐다.
 *   ```
 *   0 로고        ← 작게. 워드마크 하나 (MainLogo)
 *   1 통합검색     ← 화면의 주인공. 크고 가운데
 *   2 리그 바로가기 ← 누르면 **바로 랭킹**. 리그홈 같은 중간 화면을 거치지 않는다
 *   ─────────────
 *   3 알 모음집
 *   4 인기게시글
 *   5 사이트 소개 (꼬리말)
 *   ```
 *
 *   **`TempleHero` 컴포넌트를 지우지 않았다** (CLAUDE.md 10-4). `packages/ui` 에
 *   그대로 있고 export 도 남아 있다. **이 화면이 안 쓸 뿐이다.**
 *
 *   히어로가 빠지면서 **IPL 1등 클랜 조회(`leagueRankOverall`)도 같이 없앴다.**
 *   히어로 말고는 그 값을 쓰는 곳이 없었다. 안 쓰는 조회를 남겨 두면 메인이 켜질
 *   때마다 DB 를 헛되이 때린다 — 지금 DB 사정이 넉넉하지 않다.
 *   **라우트(`/api/leagues/[id]/ranks/overall`)는 그대로 둔다.** 화면만 안 부른다.
 *
 *   `SearchBar` 는 손대지 않았다. 검색 종류 셋(플레이어/클랜/리그)·제출 흐름 전부 그대로다.
 *
 * ── 옛 서술 (2026-09-01 오전 · 지금은 위 구성이 대신한다)
 *   ```
 *   0 신전 히어로   ← 먹구름 · 번개 · 대리석 조각상 · SA CLOUD 워드마크 · IPL 1등 클랜
 *   1 통합검색      ← 히어로가 품었다
 *   2 알 모음집
 *   3 인기게시글
 *   ```
 *   그때는 히어로가 워드마크를 직접 그렸기 때문에 `MainLogo` 를 화면에서 뺐었다.
 *   히어로가 사라졌으므로 `MainLogo` 가 제자리로 돌아왔다.
 *
 * ── 옛 서술 (2026-08-30)
 *   `리그별 개인랭킹 TOP3` 는 사용자 지시로 뺐다. `GET /api/home/top` 호출도 함께 없앴다 —
 *   **라우트 파일은 그대로 둔다.**
 *   (2026-09-02 — 리그별 랭킹이 **다시 돌아왔다.** 다만 API 가 아니라 서버에서 읽고,
 *    3명이 아니라 5명이며, 표는 랭킹 화면 것을 그대로 쓴다. `/api/home/top` 은 여전히 안 부른다.)
 *
 * ── 한 화면을 꽉 채우지 않는다
 *   배경 장식을 깔지 않는다. 바탕은 `--color-page` 하나다.
 *   위아래 여백을 넉넉히 두고 본문 폭을 제한한다.
 */

/* 빌드 때 굳지 않는다 — 위 주석 「`force-dynamic`」 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  /* 순서대로 읽는다. 운영 DB 통로가 하나라 `Promise.all` 로 묶지 않는다 (`homeData.ts`) */
  const rankPreview = await getHomeRankPreview()
  const recentMatches = await getHomeRecentMatches()

  return (
    <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 max-md:px-3">
      {/* 0 로고 · 1 검색 · 2 리그 바로가기 — 클라이언트. 동작은 그대로다 */}
      <HomeSearch />

      {/* 3 · 4 — 「사이트 소개」가 있던 자리. 구역 사이는 `.section-stack` 이 `--section-gap` 으로 띄운다.
          윗머리와 여기 사이에 선을 긋지 않는다 — 구역 제목 밑줄이 그 역할을 한다. */}
      <div className="section-stack pb-[var(--section-gap,40px)]">
        <HomeRankPreview leagues={rankPreview} />
        <HomeRecentMatches leagues={recentMatches} />
      </div>
    </div>
  )
}
