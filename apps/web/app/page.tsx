'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  FEATURED_LEAGUES,
  HOT_POST_COUNT,
  HotPostList,
  LeagueLabel,
  MainLogo,
  SearchBar,
  SiteIntro,
  isLeaguePreparing,
  type SearchType,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { LeagueEggGallery } from './_egg/LeagueEggGallery'
import { useApiReady } from './providers'

/**
 * 홈.
 *
 * ── 2026-09-01: **신전 히어로를 뺐다.** op.gg 식으로 정리 (사용자 지시)
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
 *
 * ── 한 화면을 꽉 채우지 않는다
 *   배경 장식을 깔지 않는다. 바탕은 `--color-page` 하나다.
 *   위아래 여백을 넉넉히 두고 본문 폭을 제한한다.
 */

/**
 * 메인의 리그 바로가기.
 *
 * GNB 와 같은 목록(`FEATURED_LEAGUES`)에서 온다 — 여기에 리그명을 다시 적지 않는다.
 * **준비중 리그(`daerule`)는 뺀다.** 눌러도 랭킹이 없는 리그를 랭킹 바로가기에
 * 세워 두면 거짓말이 된다. GNB 링크는 그대로 살아 있다 (거기서는 안내가 뜬다).
 *
 * 대상은 `/league/{slug}/rank/player` — **개인랭킹**이다. `/league/{slug}` 로 보내면
 * 리그홈(`/home/info`)으로 한 번 더 튕긴다.
 */
const LEAGUE_SHORTCUTS = FEATURED_LEAGUES.filter(
  (league) => !isLeaguePreparing(league.href.split('/')[2] ?? ''),
).map((league) => ({ label: league.label, href: `${league.href}/rank/player` }))

export default function HomePage() {
  const router = useRouter()
  const ready = useApiReady()

  const hot = useQuery({
    queryKey: ['boards', 'hot'],
    queryFn: () => apiGet('boardList', { search: { category: 'hot' } }),
    enabled: ready,
  })

  /**
   * 검색 제출.
   * 정확일치 조회에 성공하면 해당 상세로 이동하고, 결과가 없으면 화면 전환 없이 머문다.
   *
   * 플레이어는 닉네임뿐 아니라 **병영수첩 주소**도 받는다 — 서버의 `playersByName`이
   * 주소에서 식별자를 뽑아 조회한다 (D-162). 화면에서 따로 파싱하지 않는다.
   */
  const handleSearch = async (type: SearchType, query: string) => {
    try {
      if (type === 'player') {
        const found = await apiGet('playersByName', { params: { name: query } })
        router.push(`/player/${found.data.id}`)
        return
      }
      if (type === 'clan') {
        const found = await apiGet('clansByName', { params: { name: query } })
        router.push(`/clan/${found.data.slug}`)
        return
      }
      const found = await apiGet('leaguesByName', { params: { name: query } })
      router.push(`/league/${found.data.slug}`)
    } catch {
      // 결과 없음 / 요청 실패 — 아무 것도 하지 않는다
    }
  }

  return (
    <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 max-md:px-3">
      {/* ================= 0 로고 · 1 검색 · 2 리그 바로가기 =================
             배경을 칠하지 않는다. 페이지 바탕(`--color-page`) 위에 글자와 선만 있다. */}
      <section className="flex flex-col items-center pb-[72px] pt-[104px] max-md:pb-[56px] max-md:pt-[64px]">
        {/* --- 0 로고 — 작게. 화면의 주인공은 아래 검색창이다 --- */}
        <Link href="/" aria-label="3rd cloud 홈" className="block">
          <MainLogo className="h-[42px] w-auto text-[var(--color-text-strong,#f6eded)] max-md:h-[32px]" />
        </Link>

        {/* --- 1 통합검색 — 크고 가운데. 동작은 하나도 바뀌지 않았다 --- */}
        <div className="mt-9 w-full max-md:mt-7">
          <SearchBar onSubmit={handleSearch} />
        </div>

        {/* --- 2 리그 바로가기 — 누르면 **바로 랭킹** ---
               면을 칠하지 않는다. 글자 한 줄이고 진홍은 hover 에만 닿는다. */}
        <nav aria-label="리그 랭킹 바로가기" className="mt-7 max-md:mt-6">
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 max-md:gap-x-5">
            {LEAGUE_SHORTCUTS.map((league) => (
              <li key={league.href}>
                <Link href={league.href} className="block">
                  {/* `a { color: inherit }` 때문에 색은 안쪽 span 에 준다 (D-204) */}
                  <span className="text-[13px] text-meta transition-colors duration-100 hover:text-accent">
                    <LeagueLabel name={league.label} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {/* 검색 덩어리와 아래 목록을 가르는 선 하나. 여기까지가 «윗머리» 다 */}
      <hr className="border-0 border-t border-line-soft" />

      {/* --- 3 알 모음집 — 검색 **바로 밑** (`docs/EGG_SYSTEM_SPEC.md` 5-1)
             SPL 이 먼저, 그 아래 IPL. 알 밑에는 반드시 클랜명을 쓴다 --- */}
      <div className="section-stack pt-[var(--section-gap,40px)]">
        <LeagueEggGallery leagueSlug="supply" title="SPL" />
        <LeagueEggGallery leagueSlug="nolink" title="IPL" />
      </div>

      {/* --- 4 인기게시글 --- */}
      <div className="pt-[var(--section-gap,40px)]">
        <HotPostList
          items={hot.data?.data.slice(0, HOT_POST_COUNT)}
          loading={!ready || hot.isPending}
          error={hot.isError}
          onRetry={() => void hot.refetch()}
        />
      </div>

      {/* --- 꼬리말: 사이트 소개 + 관리자 서약서 --- */}
      <div className="pb-[var(--section-gap,40px)] pt-[80px] max-md:pt-[56px]">
        <SiteIntro />
      </div>
    </div>
  )
}
