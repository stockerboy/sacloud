import Link from 'next/link'
import type { BoardListItem } from '@sacloud/contract'
import { RelativeTime } from '../common/RelativeTime'
import { Skeleton } from '../common/Skeleton'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'

/**
 * 홈 · 실시간 인기게시글.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 그렸다
 *   예전 모양(흰 카드 + 남색 4px 머리선 + 그림자)은 3rd.supply 실측이었다.
 *   이제 검은 판 위에 1px 선으로만 그린다. 그림자는 쓰지 않는다.
 *
 * ── 동작은 그대로다
 *   - 목록 링크는 카테고리와 무관하게 `/board/hot/{id}` 로 간다
 *   - 댓글 수는 0이면 표기하지 않는다
 *   - 노출 건수도 그대로 10건이다
 *
 * ── 모양 규칙
 *   - 제목(`실시간 인기게시글`)만 `--font-display`. 나머지는 본문 서체다
 *   - 진홍은 댓글 수와 hover 표시에만. 행 배경을 칠하지 않는다
 *   - 상대시간은 `--font-num` + tabular-nums 로 자릿수를 붙잡는다
 */

/** 홈에서 노출되는 건수 */
export const HOT_POST_COUNT = 10

export interface HotPostListProps {
  items?: readonly BoardListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function HotPostList({ items, loading, error, onRetry }: HotPostListProps) {
  return (
    <section className="mx-auto w-full max-w-[720px]">
      <h2 className="mb-4 text-[20px] font-normal leading-none text-[var(--color-text-strong,#f6eded)] font-[family-name:var(--font-display)]">
        실시간 인기게시글
      </h2>

      <div className="border-t border-line">
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
    </section>
  )
}

function HotPostRow({ item }: { item: BoardListItem }) {
  return (
    <Link
      href={`/board/hot/${item.id}`}
      className="group flex items-baseline gap-3 border-b border-[var(--color-line-soft,#1a1010)] py-3.5"
    >
      <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--color-text,#d6c9c9)] transition-colors duration-100 group-hover:text-[var(--color-text-strong,#f6eded)]">
        {item.title}
      </span>
      {item.comment_count > 0 ? (
        <span className="shrink-0 text-[12px] text-accent tabular-nums font-[family-name:var(--font-num)]">
          {item.comment_count}
        </span>
      ) : null}
      <RelativeTime
        value={item.created_at}
        className="w-[64px] shrink-0 text-right text-[12px] text-[var(--color-faint,#6b5555)] tabular-nums font-[family-name:var(--font-num)]"
      />
    </Link>
  )
}

function HotPostSkeleton() {
  return (
    <>
      {Array.from({ length: HOT_POST_COUNT }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-[var(--color-line-soft,#1a1010)] py-3.5"
        >
          <Skeleton className="h-[18px] min-w-0 flex-1" />
          <div className="w-[64px] shrink-0" />
        </div>
      ))}
    </>
  )
}
