'use client'

import Link from 'next/link'
import type { BoardListItem } from '@sacloud/contract'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { RelativeTime } from '../common/RelativeTime'
import { formatCount } from '../common/format'
import { WriterName } from './WriterName'

/**
 * 게시판 목록 표.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * 머리글  <div class="flex items-stretch h-12 border-t border-t-mblack border-b border-b-border">
 *   <div class="flex justify-center items-center w-8/12">제목</div>
 *   <div class="flex items-center w-1/12">작성시간</div>
 *   <div class="flex items-center w-1/12">조회수</div>
 *   <div class="flex items-center w-2/12">작성자</div>
 *
 * 공지행  <div class="flex items-stretch h-12 pl-2 border-b border-b-border bg-boardBlue">
 *   <div class="w-1/8"><div class="rounded px-1.5 py-0.5 bg-red-500 text-white text-sm">공지</div></div>
 *
 * 일반행  <div class="flex items-stretch h-12 pl-2 border-b border-b-border">
 *   <div class="flex items-center w-1/8">
 *     <div class="flex w-16"><추천아이콘 text-blue-400/>{추천}</div>
 *     <div class="flex w-16"><비추천아이콘 text-red-400/>{비추천}</div>
 *   <div class="flex items-center w-13/24">
 *     <a href="/board/{cat}/{id}"><div class="hover:underline">{제목}</div>
 *       <div class="ml-1 text-red-500">[{댓글수}]</div></a>
 *   <div class="w-1/12">{상대시간}</div>
 *   <div class="w-1/12">{조회수}</div>
 *   <div class="w-2/12">{작성자}</div>       로그인 작성자는 #3B82F6, 익명은 #464C4C
 * ```
 * 행 높이 3rem(42px). 머리글은 제목만 가운데 정렬이고 나머지는 왼쪽 정렬이다.
 *
 * **주의** — 머리글의 컬럼 폭(`w-8/12`)과 실제 행의 폭(`w-1/8` + `w-13/24`)이 서로 다르다.
 * 원본이 실제로 그렇다. 행은 추천/비추천 칸이 앞에 하나 더 있고, 머리글에는 그 칸이 없다.
 * `w-1/8`(12.5%)과 `w-13/24`(54.1667%)는 Tailwind 기본 스케일에 없어 임의값으로 적었다.
 */

const HEAD = 'flex items-stretch h-12 border-t border-t-board-top border-b border-b-board-line'
const ROW = 'flex items-stretch h-12 pl-2 border-b border-b-board-line'

function VoteIcon({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 14 12"
      className={`mr-1 h-3 w-3.5 self-center ${up ? 'text-vote-up' : 'text-vote-down'}`}
      fill="currentColor"
      aria-hidden
    >
      {up ? <path d="M7 0 14 9H0z" /> : <path d="M7 12 0 3h14z" />}
    </svg>
  )
}

function Row({ item }: { item: BoardListItem }) {
  return (
    <div className={`${ROW} ${item.notice ? 'bg-board-blue' : ''}`}>
      <div className="flex w-[12.5%] items-center">
        {item.notice ? (
          <div className="flex items-center justify-center rounded bg-lose px-1.5 py-0.5 text-sm text-white">
            공지
          </div>
        ) : (
          <>
            <div className="flex w-16">
              <VoteIcon up />
              <div>{formatCount(item.like_count)}</div>
            </div>
            <div className="flex w-16">
              <VoteIcon up={false} />
              <div>{formatCount(item.dislike_count)}</div>
            </div>
          </>
        )}
      </div>

      <div className="flex w-[54.1667%] items-center">
        <Link className="flex items-start" href={`/board/${item.category}/${item.id}`}>
          <div className="hover:underline">{item.title}</div>
          {item.comment_count > 0 ? (
            <div className="ml-1 text-comment">[{formatCount(item.comment_count)}]</div>
          ) : null}
          {item.has_image ? <ImageIcon /> : null}
        </Link>
      </div>

      <div className="flex w-1/12 items-center">
        <RelativeTime value={item.created_at} />
      </div>
      <div className="flex w-1/12 items-center">{formatCount(item.view_count)}</div>
      <div className="flex w-2/12 items-center">
        {/* 반익명 — 소속(`veritas 소속`) + 이름. 익명 글은 목록에서 번호 없이 `익명` 이다
            (번호는 글 안에서만 뜻이 있다 · SITE_SPEC_V2 2절) */}
        <WriterName writer={item.writer} />
      </div>
    </div>
  )
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 12 12" className="ml-1 h-3 w-3 self-center text-meta" fill="currentColor" aria-hidden>
      <path d="M1 1h10v10H1zm1.5 7.5 2-2.5 1.5 2L8.5 5l2 3.5z" />
    </svg>
  )
}

export function BoardTable({
  notices,
  items,
  loading,
  error,
  onRetry,
}: {
  /** 공지는 `category=notice` 로 따로 받아 목록 위에 고정한다 (원본 동작) */
  notices?: readonly BoardListItem[]
  items?: readonly BoardListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}) {
  return (
    /*
     * 모바일 — 컬럼을 **하나도 감추지 않는다.** 원본 모바일이 이 표에서 무엇을 감추는지
     * 확인하지 못했기 때문이다 `[미확인]`. 대신 표를 **자기 안에서만** 가로로 밀리게 해
     * 본문(body)에는 가로 스크롤이 생기지 않게 한다 (UI_PARITY_AUDIT 부록 A 2·4번 방식).
     * `.mobile-scroll-x` 는 `@media (max-width:767px)` 안에서만 정의돼 있어 PC 는 무영향이다.
     */
    <div className="mobile-scroll-x">
      <div className="mb-8 mt-2 flex flex-col max-md:min-w-[38rem]">
        <div className={HEAD}>
          <div className="flex w-8/12 items-center justify-center">제목</div>
          <div className="flex w-1/12 items-center">작성시간</div>
          <div className="flex w-1/12 items-center">조회수</div>
          <div className="flex w-2/12 items-center">작성자</div>
        </div>

        {error ? (
          <ErrorState message="글 목록을 불러오지 못했습니다." onRetry={onRetry} />
        ) : loading ? (
          <>
            {Array.from({ length: 15 }, (_, index) => (
              <div key={index} className={ROW}>
                <Skeleton className="my-2 h-[25px] w-full" />
              </div>
            ))}
          </>
        ) : (
          <>
            {notices?.map((item) => (
              <Row key={`notice-${item.id}`} item={{ ...item, notice: true }} />
            ))}
            {!items || items.length === 0 ? (
              <EmptyState message="글이 없습니다." />
            ) : (
              items.map((item) => <Row key={item.id} item={item} />)
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 목록 하단 이전/다음.
 *
 * 원본은 랭킹의 `더 불러오기`와 달리 **커서를 URL 쿼리에 실어 페이지를 이동**한다.
 * `<a class="flex items-center px-4 py-2 border border-gray-400 rounded-md" href="/board/free?cursor=...">다음</a>`
 */
export function BoardPager({
  category,
  prev,
  next,
}: {
  category: string
  prev: string | null
  next: string | null
}) {
  return (
    <div className="h-20">
      <div className="flex items-center justify-center">
        {prev ? (
          <Link
            href={`/board/${category}?cursor=${encodeURIComponent(prev)}`}
            className="mr-2 flex items-center rounded-md border border-line px-4 py-2 hover:border-meta"
          >
            <span className="mr-2">‹</span> 이전
          </Link>
        ) : null}
        {next ? (
          <Link
            href={`/board/${category}?cursor=${encodeURIComponent(next)}`}
            className="flex items-center rounded-md border border-line px-4 py-2 hover:border-meta"
          >
            다음 <span className="ml-2">›</span>
          </Link>
        ) : null}
      </div>
    </div>
  )
}
