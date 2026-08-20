'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import type { EndpointKey } from '@sacloud/contract'
import { apiGet, type ApiGetOptions } from './api'
import { useApiReady } from '@/app/providers'

/**
 * 커서 기반 `더 불러오기` 목록.
 *
 * 원본은 페이지 번호가 없고 `metadata.cursor.next` 를 따라가는 방식만 쓴다.
 * (랭킹 20건 / 게시판 15건 단위 — `PAGE_SIZE`)
 */

interface CursorPage {
  metadata: { cursor: { prev: string | null; next: string | null } }
  data: unknown[]
}

export function useCursorQuery<T>(
  key: EndpointKey,
  queryKey: readonly unknown[],
  options: ApiGetOptions = {},
) {
  const ready = useApiReady()

  const query = useInfiniteQuery({
    queryKey,
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiGet(key, {
        ...options,
        search: { ...options.search, cursor: pageParam ?? undefined },
      }) as Promise<CursorPage>,
    getNextPageParam: (last) => last.metadata.cursor.next,
  })

  const items = (query.data?.pages.flatMap((page) => page.data) ?? []) as T[]

  return {
    items,
    /** 첫 페이지를 아직 못 받은 상태 */
    loading: !ready || query.isPending,
    error: query.isError,
    retry: () => void query.refetch(),
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  }
}
