'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  BoardPager,
  BoardSearch,
  BoardTable,
  boardAllowsWriteAndSearch,
  boardDisplayName,
  boardHeading,
  type BoardSearchType,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 게시판 목록 **화면** — 라우트가 아니다 (2026-09-02 지시 #14-2).
 *
 * 같은 화면을 두 주소가 부른다.
 * ```
 * /board/{category}                 basePath = /board/{category}          (옛 전역 게시판 · 그대로)
 * /league/{slug}/board              basePath = /league/{slug}/board       (리그 안 게시판 · 새것)
 * ```
 * 글·글쓰기·수정·삭제 링크와 검색·페이지 이동이 전부 `basePath` 아래로 간다.
 * 데이터(API · 카테고리 slug)는 둘이 같다 — 바뀌는 것은 **주소와 껍데기**뿐이다.
 *
 * ── 원래 `app/board/[category]/page.tsx` 에 있던 본문을 그대로 옮겼다
 *   원본 동작: 공지는 `category=notice` 로 따로 받아 위에 고정 · 페이지 이동은 `?cursor=` ·
 *   한 페이지 15건 · Hot게시판은 글쓰기·검색 없음 · 소제목은 `boardDisplayName`(`인기` → `Hot`).
 */
export function BoardListScreen({ category, basePath }: { category: string; basePath: string }) {
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

  /* 소제목은 카테고리 **표시 이름**으로 만든다 (`자유` → `자유게시판`, `인기` → `Hot게시판`).
     이름은 `GET /infos` 에서 온다 — 전역 게시판 레이아웃과 캐시를 공유한다. */
  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
  })
  const categoryName = infos.data?.data.categories.find((item) => item.slug === category)?.name

  const writable = boardAllowsWriteAndSearch(category)

  const search = (nextType: BoardSearchType, query: string) => {
    router.push(`${basePath}?type=${nextType}&q=${encodeURIComponent(query)}`)
  }

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="display text-2xl text-text-strong">
          {q
            ? `"${q}" 검색 결과`
            : categoryName
              ? boardHeading(boardDisplayName(category, categoryName))
              : null}
        </h1>
        {writable ? (
          <Link href={`${basePath}/write`} className="btn-line shrink-0 px-4 py-1.5 text-sm">
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
        basePath={basePath}
      />

      <BoardPager
        category={category}
        prev={list.data?.metadata.cursor.prev ?? null}
        next={list.data?.metadata.cursor.next ?? null}
        basePath={basePath}
      />
    </>
  )
}
