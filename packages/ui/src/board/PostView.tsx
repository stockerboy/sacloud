'use client'

import Link from 'next/link'
import type { Board } from '@sacloud/contract'
import { sanitizePostContent } from './sanitize'
import { formatCount } from '../common/format'

/**
 * 글 상세.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="flex flex-col px-6 shadow rounded bg-white min-h-1100px">
 *   <div class="flex flex-col mt-6 px-4 py-3 bg-boardBlue border-board-blue">
 *     <div class="flex items-stretch h-8">
 *       <div>{조회수}<eye/></div><div class="ml-3">{추천}</div><div class="ml-3">{비추천}</div>
 *     <div class="text-3xl">{제목}</div>
 *     <div class="flex justify-between mt-2">
 *       <div>작성자: <span class="text-boardText">{작성자}</span></div>
 *       <div>작성일: 2026년 8월 20일 오후 11시 33분</div>
 *   <div class="my-5 border-b-2 border-gray-200"></div>
 *   <div class="my-6 px-3 leading-6 text-lg min-h-250px text-content break-words">{본문}</div>
 *   <div class="my-5 border-b-2 border-gray-200"></div>
 *   <div class="flex my-3 justify-center items-center select-none">
 *     <div class="like-btn mr-3 like-inactive">{추천}</div><div class="like-btn like-inactive">{비추천}</div>
 *   <div class="flex flex-row-reverse my-5 select-none">
 *     <a class="update-btn">삭제</a><a class="update-btn mr-2">수정</a>
 *   <div class="text-xl font-semibold">댓글 {n}개</div>
 * ```
 * 실측 — `.like-btn` 6rem 폭 / 테두리 1px / padding 0.5rem 0.75rem / 가운데 정렬,
 * 비활성 테두리 #E5E7EB · 활성 #60A5FA, `.update-btn` 테두리·글자 #6366F1.
 *
 * 수정/삭제 버튼은 본인 글일 때만 보인다(계약의 `me`). 비로그인 익명 글은 비밀번호로 삭제한다.
 */

/** `2026년 8월 20일 오후 11시 33분` (원본 표기) */
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
      className={`w-24 cursor-pointer rounded border px-3 py-2 text-center ${
        active ? 'border-like-active' : 'border-divider'
      } ${up ? '' : 'ml-3'}`}
    >
      <span className={`mr-1 ${up ? 'text-vote-up' : 'text-vote-down'}`}>{up ? '▲' : '▼'}</span>
      {formatCount(count)}
    </button>
  )
}

export function PostView({
  post,
  onVote,
}: {
  post: Board
  /** 1 = 추천, -1 = 비추천 (계약의 `VoteType`) */
  onVote: (type: number) => void
}) {
  return (
    <div className="flex min-h-[1100px] flex-col rounded bg-card px-6 shadow-card">
      <div className="mt-6 flex flex-col bg-board-blue px-4 py-3">
        <div className="flex h-8 items-stretch text-sm text-meta">
          <div>조회 {formatCount(post.view_count)}</div>
          <div className="ml-3 text-vote-up">추천 {formatCount(post.like_count)}</div>
          <div className="ml-3 text-vote-down">비추천 {formatCount(post.dislike_count)}</div>
        </div>
        <div className="text-3xl">{post.title}</div>
        <div className="mt-2 flex justify-between">
          <div>
            작성자:{' '}
            <span className={post.writer.id ? 'text-writer' : 'text-card-text'}>
              {post.writer.nickname}
            </span>
          </div>
          <div>작성일: {formatPostDate(post.created_at)}</div>
        </div>
      </div>

      <div className="my-5 border-b-2 border-b-divider" />

      <div
        className="my-6 min-h-[250px] break-words px-3 text-lg leading-6"
        // sanitizePostContent 를 거친 문자열만 들어온다
        dangerouslySetInnerHTML={{ __html: sanitizePostContent(post.content) }}
      />

      <div className="my-5 border-b-2 border-b-divider" />

      <div className="my-3 flex select-none items-center justify-center">
        <VoteButton count={post.like_count} up active={post.like_type === 1} onClick={() => onVote(1)} />
        <VoteButton
          count={post.dislike_count}
          up={false}
          active={post.like_type === -1}
          onClick={() => onVote(-1)}
        />
      </div>

      {/* 본인 글일 때만 수정/삭제가 보인다 (원본 관측). 비로그인 글은 비밀번호로 삭제한다. */}
      {post.me || !post.login ? (
        <div className="my-5 flex select-none flex-row-reverse">
          <Link
            href={`/board/${post.category}/${post.id}/delete`}
            className="cursor-pointer rounded border border-more px-4 py-1.5 text-more"
          >
            삭제
          </Link>
          <Link
            href={`/board/${post.category}/${post.id}/update`}
            className="mr-2 cursor-pointer rounded border border-more px-4 py-1.5 text-more"
          >
            수정
          </Link>
        </div>
      ) : null}

      <div className="text-xl font-semibold">댓글 {formatCount(post.comment_count)}개</div>
      <div className="my-7 border-b-2 border-b-divider" />
    </div>
  )
}
