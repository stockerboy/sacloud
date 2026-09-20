'use client'

import Link from 'next/link'
import { ThumbIcon } from './ThumbIcon'
import type { BoardListItem } from '@sacloud/contract'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { RelativeTime } from '../common/RelativeTime'
import { formatCount } from '../common/format'
import { WriterName } from './WriterName'

/**
 * 게시판 목록 표 — `적진`.
 *
 * 선을 줄이고 **여백으로 나눈다.**
 * - 얼룩무늬(zebra) 없음. 행 구분은 `--color-line-soft` 1px 하나뿐이다
 * - 머리글만 `--color-line` 로 조금 진하게 받쳐 표의 시작을 알린다
 * - 색은 진홍 하나. 목록에서 진홍이 쓰이는 곳은 **댓글 수**와 `공지` 표식뿐이다
 * - 숫자는 전부 `--font-num` + `tabular-nums` — 세로로 자릿수가 맞는다
 *
 * 담고 있는 정보는 이전과 같다. 추천·비추천·조회수·상대시간·작성자·이미지 표식·공지,
 * 그리고 링크 주소(`/board/{category}/{id}`)까지 그대로다. 겉만 바꿨다.
 */

/* 컬럼 폭 — 머리글과 행이 같은 값을 쓴다 */
const COL_VOTE = 'w-24 shrink-0'
const COL_TIME = 'w-24 shrink-0 text-right'
const COL_VIEW = 'w-16 shrink-0 text-right'
const COL_WRITER = 'w-44 shrink-0 pl-6'

const NUM = 'num'
const ROW =
  'flex items-center gap-3 border-b border-b-line-soft py-3 transition-colors duration-100 hover:bg-card-2'

/* ★따봉은 공용 부품이다★ — 목록·글상세·댓글이 같은 그림을 쓴다 (`ThumbIcon.tsx`) */
function VoteIcon({ up }: { up: boolean }) {
  return <ThumbIcon up={up} size={14} className={`mr-1 self-center ${up ? 'text-meta' : 'text-faint'}`} />
}

function Row({ item, basePath }: { item: BoardListItem; basePath?: string }) {
  return (
    <div className={ROW}>
      <div className={`flex items-center ${COL_VOTE}`}>
        {item.notice ? (
          /* 공지 — 채운 블록 대신 테두리 표식. 진홍은 여기서만 아껴 쓴다 */
          <span className="rounded-[var(--radius)] border border-accent px-1.5 py-0.5 text-xs text-accent">
            공지
          </span>
        ) : (
          <>
            <span className={`flex w-12 items-center text-sm text-meta ${NUM}`}>
              <VoteIcon up />
              {formatCount(item.like_count)}
            </span>
            <span className={`flex w-12 items-center text-sm text-faint ${NUM}`}>
              <VoteIcon up={false} />
              {formatCount(item.dislike_count)}
            </span>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* 리그 안 게시판(지시 #14-2)은 `basePath` 아래로 간다. 없으면 예전 주소 그대로 */}
        <Link
          href={basePath ? `${basePath}/${item.id}` : `/board/${item.category}/${item.id}`}
          className="group flex items-center gap-1"
        >
          {/* 색은 안쪽 `span` 이 가진다 — `a { color: inherit }` 가 유틸리티를 누른다 */}
          <span
            className={`truncate transition-colors duration-100 group-hover:text-text-strong ${
              item.notice ? 'text-text-strong' : 'text-text'
            }`}
          >
            {item.title}
          </span>
          {/* 댓글 수 — 대괄호를 남긴다. 없으면 제목의 일부처럼 읽힌다 */}
          {item.comment_count > 0 ? (
            <span className={`shrink-0 text-sm text-accent ${NUM}`}>
              [{formatCount(item.comment_count)}]
            </span>
          ) : null}
          {item.has_image ? <ImageIcon /> : null}
        </Link>

        {/*
          ★★폰에서는 제목 아래로 내린다★★ (2026-09-20 사장님: 「소속클랜도 안뜨고」)

          ── 무엇이 문제였나
            한 줄에 ★투표 · 제목 · 시각 · 조회 · 작성자★ 를 늘어놓았는데,
            제목 말고는 전부 고정 폭이라 ★합이 360px 을 넘는다.★
            폰(390px)에서는 ★오른쪽 두 칸이 화면 밖으로 밀려 안 보였다.★
            그래서 사장님 화면에 작성자·소속이 통째로 없었다.

          ── 고친 것
            폰에서는 ★제목 아래 한 줄★ 로 내린다 — 「익명 · veritas · 13분 전」.
            넓은 화면은 ★지금까지와 똑같다★ (오른쪽 칸들이 그대로 산다).
        */}
        <div className="mt-1 flex items-center gap-2 text-[12px] text-faint md:hidden">
          <span className="min-w-0 truncate"><WriterName writer={item.writer} /></span>
          <span aria-hidden className="text-line">·</span>
          <span className={`shrink-0 ${NUM}`}><RelativeTime value={item.created_at} /></span>
        </div>
      </div>

      <div className={`text-sm text-faint max-md:hidden ${COL_TIME} ${NUM}`}>
        <RelativeTime value={item.created_at} />
      </div>
      <div className={`text-sm text-faint max-md:hidden ${COL_VIEW} ${NUM}`}>{formatCount(item.view_count)}</div>
      <div className={`min-w-0 truncate text-sm max-md:hidden ${COL_WRITER}`}>
        {/* 반익명 — 소속(`veritas 소속`) + 이름. 익명 글은 목록에서 번호 없이 `익명` 이다
            (번호는 글 안에서만 뜻이 있다 · SITE_SPEC_V2 2절) */}
        <WriterName writer={item.writer} />
      </div>
    </div>
  )
}

function ImageIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 shrink-0 self-center text-faint"
      fill="currentColor"
      aria-hidden
    >
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
  basePath,
}: {
  /** 공지는 `category=notice` 로 따로 받아 목록 위에 고정한다 */
  notices?: readonly BoardListItem[]
  items?: readonly BoardListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  /**
   * 글 링크의 뿌리 (2026-09-02 지시 #14-2 — 리그 안 게시판).
   * `/league/{slug}/board` 처럼 넘기면 행이 `{basePath}/{id}` 로 간다.
   * **넘기지 않으면 예전 그대로** `/board/{category}/{id}` 다.
   */
  basePath?: string
}) {
  return (
    /*
     * 모바일 — 컬럼을 **하나도 감추지 않는다.** 표를 자기 안에서만 가로로 밀리게 해
     * 본문(body)에는 가로 스크롤이 생기지 않게 한다.
     */
    <div className="mobile-scroll-x">
      <div className="flex flex-col max-md:min-w-[38rem]">
        <div className="flex items-center gap-3 border-b border-b-line pb-2 text-xs tracking-[0.12em] text-faint">
          {/* 추천·비추천 칸에는 머리글을 두지 않는다 (아이콘이 곧 이름이다) */}
          <div className={COL_VOTE} aria-hidden />

          <div className="min-w-0 flex-1">제목</div>
          <div className={`max-md:hidden ${COL_TIME}`}>작성시간</div>
          <div className={`max-md:hidden ${COL_VIEW}`}>조회수</div>
          <div className={`max-md:hidden ${COL_WRITER}`}>작성자</div>
        </div>

        {error ? (
          <ErrorState message="글 목록을 불러오지 못했습니다." onRetry={onRetry} />
        ) : loading ? (
          <>
            {Array.from({ length: 15 }, (_, index) => (
              <div key={index} className="border-b border-b-line-soft py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </>
        ) : (
          <>
            {notices?.map((item) => (
              <Row key={`notice-${item.id}`} item={{ ...item, notice: true }} basePath={basePath} />
            ))}
            {!items || items.length === 0 ? (
              <EmptyState message="글이 없습니다." />
            ) : (
              items.map((item) => <Row key={item.id} item={item} basePath={basePath} />)
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
 * 커서를 URL 쿼리에 실어 페이지를 이동한다 — 동작은 그대로다.
 */
export function BoardPager({
  category,
  prev,
  next,
  basePath,
}: {
  category: string
  prev: string | null
  next: string | null
  /** 목록 주소의 뿌리 (지시 #14-2). 없으면 예전 그대로 `/board/{category}` */
  basePath?: string
}) {
  /* 공용 헬퍼 `.btn-line` — 테두리만 있는 버튼. hover 에서만 진홍이 켜진다 */
  const button = 'btn-line px-4 py-2 text-sm'
  const list = basePath ?? `/board/${category}`

  return (
    <div className="flex items-center justify-center gap-2 py-10">
      {prev ? (
        <Link href={`${list}?cursor=${encodeURIComponent(prev)}`} className={button}>
          <span aria-hidden>‹</span> 이전
        </Link>
      ) : null}
      {next ? (
        <Link href={`${list}?cursor=${encodeURIComponent(next)}`} className={button}>
          다음 <span aria-hidden>›</span>
        </Link>
      ) : null}
    </div>
  )
}
