'use client'

import Link from 'next/link'
import type { Board } from '@sacloud/contract'
import { sanitizePostContent } from './sanitize'
import { formatCount } from '../common/format'
import { WriterName } from './WriterName'

/**
 * 글 상세 — `적진`.
 *
 * 담는 것과 하는 일은 그대로다 (조회수 · 추천 · 비추천 · 제목 · 작성자 · 작성일 · 본문 ·
 * 추천/비추천 버튼 · 수정/삭제 · 댓글 수). 겉만 바꿨다.
 *
 * - 제목은 `--font-display`. 이 화면에서 큰 글씨는 여기 하나뿐이다
 * - 파란 머리글 상자와 그림자를 걷어내고 **얇은 선 하나**로 본문을 나눈다
 * - 본문 폭을 잡아 두어 한 줄이 너무 길어지지 않게 한다
 * - 진홍은 추천을 **누른 상태**에서만 나온다. 누르지 않은 버튼은 회색이다
 *
 * 수정/삭제 버튼은 본인 글일 때만 보인다(계약의 `me`). 비로그인 익명 글은 비밀번호로 삭제한다.
 */

/** `2026년 8월 20일 오후 11시 33분` */
export function formatPostDate(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return ''
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).formatToParts(new Date(time))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}년 ${get('month')}월 ${get('day')}일 ${get('dayPeriod')} ${get('hour')}시 ${get('minute')}분`
}

function VoteButton({
  count,
  up,
  active,
  onClick,
}: {
  count: number
  up: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex w-28 items-center justify-center gap-2 rounded-[var(--radius)] border py-2 text-sm transition-colors duration-100 ${
        active
          ? 'border-accent text-accent'
          : 'border-line text-meta hover:border-meta hover:text-text-strong'
      }`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="num">{formatCount(count)}</span>
      <span className="sr-only">{up ? '추천' : '비추천'}</span>
    </button>
  )
}

export function PostView({
  post,
  onVote,
  basePath,
}: {
  post: Board
  /** 1 = 추천, -1 = 비추천 (계약의 `VoteType`) */
  onVote: (type: number) => void
  /** 수정·삭제 링크의 뿌리 (지시 #14-2 — 리그 안 게시판). 없으면 예전 그대로 `/board/{category}` */
  basePath?: string
}) {
  const base = basePath ?? `/board/${post.category}`
  return (
    <article className="rounded-[var(--radius)] border border-line bg-card px-6 py-6 text-text max-md:px-4">
      <header className="flex flex-col gap-3">
        <h1 className="display text-3xl leading-snug text-text-strong">{post.title}</h1>

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-faint">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="shrink-0">작성자</span>
            <WriterName writer={post.writer} />
          </div>
          <div className="num">{formatPostDate(post.created_at)}</div>
        </div>

        <div className="flex items-center gap-4 text-xs text-faint">
          <span className="num">조회 {formatCount(post.view_count)}</span>
          <span className="num">추천 {formatCount(post.like_count)}</span>
          <span className="num">비추천 {formatCount(post.dislike_count)}</span>
        </div>
      </header>

      <div className="my-6 border-b border-b-line" />

      <div
        className="max-w-[68ch] break-words text-[1.05rem] leading-7"
        // sanitizePostContent 를 거친 문자열만 들어온다
        dangerouslySetInnerHTML={{ __html: sanitizePostContent(post.content) }}
      />

      <div className="mt-10 flex select-none items-center justify-center gap-2">
        <VoteButton
          count={post.like_count}
          up
          active={post.like_type === 1}
          onClick={() => onVote(1)}
        />
        <VoteButton
          count={post.dislike_count}
          up={false}
          active={post.like_type === -1}
          onClick={() => onVote(-1)}
        />
      </div>

      {/* 본인 글일 때만 수정/삭제가 보인다. 비로그인 글은 비밀번호로 삭제한다. */}
      {post.me || !post.login ? (
        <div className="mt-6 flex select-none flex-row-reverse gap-2">
          <Link href={`${base}/${post.id}/delete`} className="btn-line px-3 py-1.5 text-sm">
            삭제
          </Link>
          <Link href={`${base}/${post.id}/update`} className="btn-line px-3 py-1.5 text-sm">
            수정
          </Link>
        </div>
      ) : null}

      <div className="mt-10 border-t border-t-line pt-5 text-sm tracking-[0.12em] text-faint">
        댓글 <span className="num">{formatCount(post.comment_count)}</span>개
      </div>
    </article>
  )
}
