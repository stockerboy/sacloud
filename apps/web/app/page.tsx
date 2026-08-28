'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { HOT_POST_COUNT, HotPostList, MainLogo, SearchBar, type SearchType } from '@sacloud/ui'
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
   * 원본은 정확일치 조회에 성공하면 해당 상세로 이동하고,
   * 결과가 없으면 **화면 전환 없이 그대로 머문다**(2026-08-20 관측).
   * 결과 없음에 대한 안내 표시는 확인되지 않았다 [미확인].
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
