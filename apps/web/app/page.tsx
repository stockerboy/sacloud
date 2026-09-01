'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  HOT_POST_COUNT,
  HotPostList,
  SearchBar,
  SiteIntro,
  TempleHero,
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
 * ── 2026-09-01: 최상단이 **신전 히어로**로 바뀌었다 (사용자 지시)
 *   ```
 *   0 신전 히어로   ← 먹구름 · 번개 · 대리석 조각상 · SA CLOUD 로고 · IPL 1등 클랜
 *   1 통합검색      ← 히어로가 품는다. 여전히 메인의 주인공이다
 *   2 알 모음집
 *   3 인기게시글
 *   ```
 *
 *   **`MainLogo`(SVG 워드마크)를 이 화면에서 뺐다.** 지운 것은 아니다 —
 *   컴포넌트는 그대로 있고 GNB(`NavLogo`)와 인증 카드가 계속 쓴다 (CLAUDE.md 10-4).
 *   히어로가 `SA CLOUD` 워드마크를 직접 그리기 때문에, 둘을 같이 두면 **같은 로고가
 *   200px 간격으로 두 번** 나온다. 그건 디자인이 아니라 버그로 읽힌다.
 *   히어로의 워드마크가 옛 로고보다 하는 일이 더 많다 — 약자(`CLOUD`)를 보여 준다.
 *
 *   **통합검색은 지우지 않고 히어로 안으로 넣었다.** 히어로 바로 아래에 붙어서
 *   구름이 바닥으로 녹는 자리에 놓인다. 순서·동작·제출 흐름은 하나도 바뀌지 않았다.
 *
 * ── 옛 서술 (2026-08-30)
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
   * 신전 히어로가 그릴 **IPL 1등 클랜**.
   *
   * ── 왜 `ranks/overall` 인가
   *   IPL(`nolink`)은 **1티어를 비워 둔다.** 부리그별 랭킹(`leagueRankClans`)으로는
   *   어느 부리그가 1등을 갖고 있는지 알 수 없다 — 실측으로 지금 1등(래더 3266)은
   *   **3부**에 있고 2부 1등은 그보다 낮다. 부리그를 섞어 rating 순으로 세우는 래더는
   *   `ranks/overall` 뿐이다 (D-104).
   *
   * ── **1건만 받는다**
   *   `limit=1` 이다. 43건을 전부 받아 화면에서 최대값을 고르지 않는다 (D-238).
   *   서버가 `take: 1` 로 끊어서 준다.
   *
   * ── 실패해도 화면은 선다
   *   `top` 이 `undefined` 면 히어로가 가운데 빛만 그린다. 메인이 500 을 띄우거나
   *   빈 칸을 남기지 않는다.
   */
  const iplTop = useQuery({
    queryKey: ['leagues', 'nolink', 'ranks', 'overall', 1],
    queryFn: () => apiGet('leagueRankOverall', { params: { leagueId: 'nolink' }, search: { limit: 1 } }),
    enabled: ready,
    staleTime: 5 * 60_000,
  })
  const top = iplTop.data?.data[0]

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
    <>
      {/* --- 0 신전 히어로 + 1 통합검색 ---
             히어로는 **화면 폭을 통째로** 쓴다. 먹구름이 본문 폭(1120px)에서 잘리면
             구름이 아니라 «네모난 회색 판» 으로 보인다. 안쪽 내용은 그대로 1120px 이다. */}
      <TempleHero
        top={
          top
            ? {
                name: top.clan.name,
                slug: top.clan.slug,
                mark: top.clan.mark,
                is_official_clan: top.clan.is_official_clan,
                rating: top.rating,
              }
            : null
        }
      >
        <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 pb-[var(--section-gap,40px)] pt-8 max-md:px-3 max-md:pt-6">
          <SearchBar onSubmit={handleSearch} />
        </div>
      </TempleHero>

      <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 max-md:px-3">
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
    </>
  )
}
