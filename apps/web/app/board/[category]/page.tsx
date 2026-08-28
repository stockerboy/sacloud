'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  BoardPager,
  BoardSearch,
  BoardTable,
  boardAllowsWriteAndSearch,
  boardHeading,
  type BoardSearchType,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 게시판 목록 `/board/{category}`.
 *
 * 원본 동작
 * - 공지는 `category=notice` 로 **따로 호출**해서 목록 위에 고정한다
 * - 페이지 이동은 `?cursor=` 를 URL에 실어 이동한다 (랭킹의 `더 불러오기`와 다름)
 * - 한 페이지 15건 (`PAGE_SIZE.BOARD`)
 *
 * 화면 순서도 원본을 따른다 — **소제목 + 글쓰기 → 검색 폼 → 목록 → 페이지 이동**.
 * 인기게시판은 집계 화면이라 글쓰기·검색이 **둘 다 없다** (UI_PARITY_AUDIT 9-1 · 9-2 · 9-5).
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

  /* 소제목은 카테고리 **이름**으로 만든다 (`자유` → `자유게시판`).
     이름은 레이아웃이 이미 받아 둔 `GET /infos` 에서 온다 — 캐시를 공유하므로 추가 호출이 없다. */
  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
  })
  const categoryName = infos.data?.data.categories.find((item) => item.slug === category)?.name

  const writable = boardAllowsWriteAndSearch(category)

  const search = (nextType: BoardSearchType, query: string) => {
    router.push(`/board/${category}?type=${nextType}&q=${encodeURIComponent(query)}`)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-2xl">
          {q ? `"${q}" 검색 결과` : categoryName ? boardHeading(categoryName) : null}
        </div>
        {writable ? (
          <Link
            href={`/board/${category}/write`}
            className="my-2 inline-flex items-center rounded bg-more px-4 py-2 text-white"
          >
            글쓰기
          </Link>
        ) : null}
      </div>

      {writable ? (
        <BoardSearch defaultType={type} defaultQuery={q ?? ''} onSearch={search} />
      ) : null}

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
    </>
  )
}
