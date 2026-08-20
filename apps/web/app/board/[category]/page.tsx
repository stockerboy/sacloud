'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { BoardPager, BoardSearch, BoardTable, type BoardSearchType } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 게시판 목록 `/board/{category}`.
 *
 * 원본 동작
 * - 공지는 `category=notice` 로 **따로 호출**해서 목록 위에 고정한다
 * - 페이지 이동은 `?cursor=` 를 URL에 실어 이동한다 (랭킹의 `더 불러오기`와 다름)
 * - 한 페이지 15건 (`PAGE_SIZE.BOARD`)
 */
export default function BoardListPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const ready = useApiReady()

  const cursor = searchParams.get('cursor')
  const type = (searchParams.get('type') as BoardSearchType | null) ?? 'board'
  const q = searchParams.get('q')

  const list = useQuery({
    queryKey: ['boards', category, cursor, type, q],
    queryFn: () =>
      apiGet('boardList', {
        search: {
          category,
          cursor: cursor ?? undefined,
          type: q ? type : undefined,
          q: q ?? undefined,
        },
      }),
    enabled: ready,
  })

  // 공지는 검색 중이 아닐 때, 첫 페이지에만 고정 노출한다
  const showNotice = !q && !cursor
  const notices = useQuery({
    queryKey: ['boards', 'notice'],
    queryFn: () => apiGet('boardList', { search: { category: 'notice' } }),
    enabled: ready && showNotice,
  })

  const search = (nextType: BoardSearchType, query: string) => {
    router.push(`/board/${category}?type=${nextType}&q=${encodeURIComponent(query)}`)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-2xl">
          {q ? `"${q}" 검색 결과` : null}
        </div>
        <Link
          href={`/board/${category}/write`}
          className="my-2 inline-flex items-center rounded bg-more px-4 py-2 text-white"
        >
          글쓰기
        </Link>
      </div>

      <BoardTable
        notices={showNotice ? notices.data?.data : undefined}
        items={list.data?.data}
        loading={!list.data}
        error={list.isError}
        onRetry={() => void list.refetch()}
      />

      <BoardPager
        category={category}
        prev={list.data?.metadata.cursor.prev ?? null}
        next={list.data?.metadata.cursor.next ?? null}
      />

      <BoardSearch defaultType={type} defaultQuery={q ?? ''} onSearch={search} />
    </>
  )
}
