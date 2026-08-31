'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  HOT_POST_COUNT,
  HotPostList,
  MainLogo,
  SearchBar,
  SiteIntro,
  type SearchType,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { LeagueEggGallery } from './_egg/LeagueEggGallery'
import { useApiReady } from './providers'

/**
 * 홈.
 *
 * ── 2026-08-30: 3rd.supply 재현을 그만두고 자체 디자인(`적진`)으로 다시 짰다
 *   예전 홈은 원본 실측 구조(검은 히어로 + 44rem 로고 + 흰 카드들)를 그대로 옮긴
 *   것이었다. 이제 원본을 따라가지 않는다.
 *
 * ── 메인은 세 덩어리다
 *   ```
 *   1 로고
 *   2 통합검색      ← 메인의 주인공이다. 화면 한가운데를 이것에 내준다
 *   3 인기게시글
 *   ```
 *   `리그별 개인랭킹 TOP3` 는 **사용자 지시로 뺐다** (2026-08-30). 컴포넌트도 지웠다.
 *   TOP3 만 부르던 `GET /api/home/top` 호출도 함께 없앴다 —
 *   **라우트 파일은 그대로 둔다.** 화면이 안 부를 뿐이다.
 *
 *   `사이트 소개 + 관리자 서약서`(SITE_SPEC_V2 3절)는 남겼다. 사용자가 항목을 직접
 *   지정한 내용이라 임의로 지우지 않고, 위 세 덩어리 아래에 **조용한 꼬리말**로 둔다.
 *
 * ── 한 화면을 꽉 채우지 않는다
 *   위아래 여백을 넉넉히 두고 본문 폭을 제한한다. 히어로에 배경색을 따로 깔지 않는다 —
 *   페이지 전체가 이미 검정이라 색을 나눌 이유가 없다.
 */
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
      {/* --- 1·2 로고 + 통합검색 --- */}
      <section className="pb-[var(--section-gap,40px)] pt-[120px] max-md:pt-[64px]">
        <MainLogo className="mx-auto block w-[320px] max-w-full text-[var(--color-text-strong,#f6eded)] max-md:w-[240px]" />
        <div className="mt-10 max-md:mt-8">
          <SearchBar onSubmit={handleSearch} />
        </div>
      </section>

      {/* --- 2-A 알 모음집 — 플레이어 검색 **바로 밑** (`docs/EGG_SYSTEM_SPEC.md` 5-1)
             DPL 이 먼저, 그 아래 IPL. 두 리그를 따로 한 벌씩 만든다.
             알 밑에는 반드시 클랜명을 쓴다 — 유저가 자기 클랜을 찾아야 깨러 온다 --- */}
      <div className="section-stack pt-[var(--section-gap,40px)]">
        <LeagueEggGallery leagueSlug="supply" title="DPL" />
        <LeagueEggGallery leagueSlug="nolink" title="IPL" />
      </div>

      {/* --- 3 인기게시글 --- */}
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
