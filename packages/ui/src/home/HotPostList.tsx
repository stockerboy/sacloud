import Link from 'next/link'
import type { BoardListItem } from '@sacloud/contract'
import { RelativeTime } from '../common/RelativeTime'
import { Skeleton } from '../common/Skeleton'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'

/**
 * 홈 · 실시간 인기게시글.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="flex justify-center mt-10">
 *   <div class="w-board bg-white shadow rounded">                        48rem(672px)
 *     <div class="px-4 py-2 text-lg font-semibold
 *                 text-blue-900 border-b-4 border-blue-900">실시간 인기게시글</div>
 *     <div>
 *       <div class="flex items-center px-4 py-4 border-b">               행 높이 53px
 *         <div class="w-title font-bold text-lg">                        42rem(588px)
 *           <a class="flex" href="/board/hot/{id}">
 *             <div>{제목}</div>
 *             <div class="ml-0.5 text-red-500">[{댓글수}]</div>
 *         <div class="w-24 text-gray-700 text-right">{상대시간}</div>     6rem(84px)
 *       … 10행
 * ```
 * - 목록 링크는 카테고리와 무관하게 `/board/hot/{id}` 로 간다 (원본 관측)
 * - 댓글 수는 0이면 표기하지 않는다 (원본에서 `[0]` 표기를 보지 못함) [미확인]
 */

/** 원본 홈에서 노출되는 건수 */
export const HOT_POST_COUNT = 10

export interface HotPostListProps {
  items?: readonly BoardListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function HotPostList({ items, loading, error, onRetry }: HotPostListProps) {
  return (
    <div className="mt-10 flex justify-center">
      <div className="w-board rounded-sm bg-card shadow-card">
        <div className="border-b-4 border-b-accent px-4 py-2 text-lg font-semibold text-accent">
          실시간 인기게시글
        </div>
        <div>
          {error ? (
            <ErrorState message="목록을 불러오지 못했습니다." onRetry={onRetry} />
          ) : loading ? (
            <HotPostSkeleton />
          ) : !items || items.length === 0 ? (
            <EmptyState message="게시글이 없습니다." />
          ) : (
            items.map((item) => <HotPostRow key={item.id} item={item} />)
          )}
        </div>
      </div>
    </div>
  )
}

function HotPostRow({ item }: { item: BoardListItem }) {
  return (
    <div className="flex items-center border-b border-b-divider px-4 py-4">
      <div className="w-board-title text-lg font-bold">
        <Link className="flex" href={`/board/hot/${item.id}`}>
          <div>{item.title}</div>
          {item.comment_count > 0 ? (
            <div className="ml-0.5 text-comment">[{item.comment_count}]</div>
          ) : null}
        </Link>
      </div>
      <RelativeTime value={item.created_at} className="w-board-time text-right text-meta" />
    </div>
  )
}

function HotPostSkeleton() {
  return (
    <>
      {Array.from({ length: HOT_POST_COUNT }, (_, index) => (
        <div key={index} className="flex items-center border-b border-b-divider px-4 py-4">
          <div className="w-board-title text-lg font-bold">
            <Skeleton className="h-[25px] w-80" />
          </div>
          <div className="w-board-time" />
        </div>
      ))}
    </>
  )
}
