'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  HOT_POST_COUNT,
  HotPostList,
  LeagueTop3,
  MainLogo,
  SearchBar,
  SiteIntro,
  type SearchType,
} from '@sacloud/ui'
import { HomeTop, resolveApiBaseUrl } from '@sacloud/contract'
import { apiGet } from '@/lib/api'
import { useApiReady } from './providers'

/**
 * 홈.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="bg-black pt-20 pb-10">        검은 히어로 (위 5rem / 아래 2.5rem)
 *   <div class="text-center">
 *     <img class="inline-block main-logo">   44rem(616px)
 *     <br>
 *     <통합검색 (mt-10)>
 * <div class="pc-container my-2 h-wide-ad"> ← 광고. 재현하지 않는다 (CLAUDE.md 4장)
 * <div class="my-2"><실시간 인기게시글></div>
 * ```
 * 광고 영역(280px 고정 높이 + 상하 여백)은 통째로 빼고 히어로 다음에 카드가 바로 이어진다.
 *
 * ── 2026-08-30: 사용자가 준 새 사양(`docs/SITE_SPEC_V2.md` 3절)으로 두 칸을 더했다
 *   ```
 *   1 플레이어 검색(닉네임 또는 병영수첩 주소)   ← 이미 있던 통합검색을 그대로 쓴다
 *   2 사이트 소개 + 관리자 서약서                ← 신규
 *   3 SPL / IPL / YSL 개인랭킹 TOP3             ← 신규
 *   4 HOT 게시판                                ← 기존 `실시간 인기게시글` 이 이 자리다
 *   ```
 *   **기존 것을 지우지 않았다.** 히어로(로고+통합검색)와 인기게시글 카드는 그대로 있고,
 *   사이 순서만 사양이 적어 준 대로다. 인기게시글은 이미 `category=hot` 을 부르고 있어
 *   사양의 "hot게시판"과 같은 목록이라, 새 카드를 만들지 않고 그 자리에 둔다.
 */
export default function HomePage() {
  const router = useRouter()
  const ready = useApiReady()

  const hot = useQuery({
    queryKey: ['boards', 'hot'],
    queryFn: () => apiGet('boardList', { search: { category: 'hot' } }),
    enabled: ready,
  })

  /*
   * 메인 TOP3 는 계약 엔드포인트 레지스트리에 없는 메인 전용 묶음이라
   * `apiGet` 대신 직접 부른다. 응답은 계약 스키마(`HomeTop`)로 파싱한다 —
   * 형태가 어긋나면 화면이 아니라 여기서 먼저 터져야 하기 때문이다.
   */
  const top = useQuery({
    queryKey: ['home', 'top'],
    queryFn: fetchHomeTop,
    enabled: ready,
  })

  /**
   * 검색 제출.
   * 원본은 정확일치 조회에 성공하면 해당 상세로 이동하고,
   * 결과가 없으면 **화면 전환 없이 그대로 머문다**(2026-08-20 관측).
   * 결과 없음에 대한 안내 표시는 확인되지 않았다 [미확인].
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
      // 결과 없음 / 요청 실패 — 원본과 동일하게 아무 것도 하지 않는다
    }
  }

  return (
    <>
      {/*
        모바일은 히어로 여백을 줄이고 좌우 여백을 준다 — 로고(44rem)와 검색바(39rem)가
        좁은 화면을 넘어가기 때문이다. `md:` 이상은 원본 실측값 그대로다.
      */}
      <div className="bg-ink pb-10 pt-20 max-md:px-3 max-md:pb-6 max-md:pt-10">
        <div className="text-center">
          <MainLogo className="inline-block w-logo max-w-full" />
          <br />
          <SearchBar onSubmit={handleSearch} />
        </div>
      </div>

      <div className="my-2">
        <SiteIntro />
      </div>

      <div className="my-2">
        <LeagueTop3
          data={top.data}
          loading={!ready || top.isPending}
          error={top.isError}
          onRetry={() => void top.refetch()}
        />
      </div>

      <div className="my-2">
        <HotPostList
          items={hot.data?.data.slice(0, HOT_POST_COUNT)}
          loading={!ready || hot.isPending}
          error={hot.isError}
          onRetry={() => void hot.refetch()}
        />
      </div>
    </>
  )
}

/** `GET /api/home/top` — 응답 래퍼(`{ message, data }`)를 벗기고 계약으로 검증한다 */
async function fetchHomeTop(): Promise<HomeTop> {
  const base = resolveApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL })
  const response = await fetch(`${base}/home/top`)
  if (!response.ok) throw new Error(`GET /home/top → ${response.status}`)
  const payload: unknown = await response.json()
  return HomeTop.parse((payload as { data: unknown }).data)
}
