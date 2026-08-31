'use client'

/**
 * 알 모음집에 쓸 **리그의 클랜 전부** (사양 5-1: *"클랜 전부 다"*).
 *
 * `GET /leagues/{slug}/clans` 는 커서 목록이라 한 번에 20개만 온다. 모음집은 몇 개만
 * 보여 주는 화면이 아니므로 **다음 장이 없을 때까지 스스로 따라간다.**
 *
 * ── 무한히 따라가지는 않는다
 *   `MAX_PAGES` 에서 멈춘다. 메인 화면이 수백 번 요청하는 일이 없어야 한다.
 *   멈췄으면 `truncated` 가 참이다 — **몇 개를 못 그렸는지 화면에 적는다.**
 *   조용히 자르지 않는다.
 */

import { useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { LeagueClan } from '@sacloud/contract'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 20개 × 15장 = 300 클랜 */
const MAX_PAGES = 15

interface ClanPage {
  metadata: { cursor: { prev: string | null; next: string | null } }
  data: LeagueClan[]
}

export function useLeagueEggs(leagueSlug: string) {
  const ready = useApiReady()

  const query = useInfiniteQuery({
    queryKey: ['league', leagueSlug, 'clans', 'egg-gallery'],
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiGet('leagueClans', {
        params: { leagueSlug },
        search: { cursor: pageParam ?? undefined },
      }) as Promise<ClanPage>,
    getNextPageParam: (last) => last.metadata.cursor.next,
  })

  const pages = query.data?.pages.length ?? 0
  const capped = pages >= MAX_PAGES

  useEffect(() => {
    if (!query.hasNextPage || query.isFetchingNextPage || capped) return
    void query.fetchNextPage()
  }, [query, capped])

  return {
    clans: query.data?.pages.flatMap((page) => page.data) ?? [],
    /** 첫 장을 아직 못 받았거나, 아직 뒷장을 따라가는 중 */
    loading: !ready || query.isPending || (query.hasNextPage === true && !capped),
    error: query.isError,
    retry: () => void query.refetch(),
    /** 상한에서 멈췄는가 — 참이면 화면에 그 사실을 적는다 */
    truncated: capped && query.hasNextPage === true,
  }
}
