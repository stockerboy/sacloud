'use client'

import { useState } from 'react'
import type { Comment, CommentReply } from '@sacloud/contract'
import { RelativeTime } from '../common/RelativeTime'
import { EmptyState } from '../common/EmptyState'
import { formatCount } from '../common/format'
import { sanitizePostContent } from './sanitize'
import { WriterName } from './WriterName'

/**
 * 댓글 목록 — `적진`.
 *
 * 규칙은 그대로다.
 * - 대댓글은 **1단계까지만** 허용된다 (`comments[]` 중첩이 한 겹)
 * - 삭제된 댓글은 행을 남기고 내용만 가린다 (`deleted`)
 * - 글쓴이가 단 댓글에는 표식이 붙는다 (`board_writer`)
 * - 익명 댓글은 자동 별칭(`무명-123` 형태)으로 표시된다
 *
 * 겉만 바꿨다 — 구분선을 `--color-line-soft` 1px 하나로 줄이고, 대댓글은 선 대신
 * 들여쓰기 + 왼쪽 얇은 선으로 나눈다. 진홍은 **내가 누른 추천/비추천**에서만 나온다.
 */

const FIELD =
  'rounded-[var(--radius)] border border-line bg-card px-3 py-2 text-sm text-text placeholder:text-faint outline-none transition-colors duration-100 focus:border-accent'
const INPUT = `w-full ${FIELD}`

const SUBMIT =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-accent px-4 text-sm text-accent transition-colors duration-100 hover:bg-card-2 disabled:border-line disabled:text-faint'

function CommentBody({ comment }: { comment: Comment | CommentReply }) {
  if (comment.deleted) {
    return <div className="py-1 text-sm text-faint">삭제된 댓글입니다.</div>
  }
  return (
    <div
      className="max-w-[68ch] break-words py-1 text-[0.95rem] leading-6"
      dangerouslySetInnerHTML={{ __html: sanitizePostContent(comment.content) }}
    />
  )
}

function CommentHead({ comment }: { comment: Comment | CommentReply }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-sm">
      {/* 반익명 — 소속(`veritas 소속`) + 이름(`글쓴이` · `익명1` …). 번호는 서버가 매긴다 */}
      <WriterName writer={comment.writer} />
      {/* 익명 이름이 이미 `글쓴이` 면 배지를 겹쳐 달지 않는다 */}
      {comment.board_writer && !comment.writer.anonymous ? (
        <span className="rounded-[var(--radius)] border border-line px-1.5 text-xs text-meta">
          글쓴이
        </span>
      ) : null}
      <span className="num text-xs text-faint">
        <RelativeTime value={comment.created_at} />
      </span>
      {comment.last_edited ? <span className="text-xs text-faint">(수정됨)</span> : null}
    </div>
  )
}

function VoteRow({
  comment,
  onVote,
}: {
  comment: Comment | CommentReply
  onVote: (commentId: string, type: number) => void
}) {
  if (comment.deleted) return null
  const base = 'num text-xs transition-colors duration-100 hover:text-text-strong'
  return (
    <div className="mt-1 flex items-center gap-3">
      <button
        type="button"
        onClick={() => onVote(comment.id, 1)}
        aria-pressed={comment.like_type === 1}
        className={`${base} ${comment.like_type === 1 ? 'text-accent' : 'text-faint'}`}
      >
        <span aria-hidden>▲</span> {formatCount(comment.like_count)}
      </button>
      <button
        type="button"
        onClick={() => onVote(comment.id, -1)}
        aria-pressed={comment.like_type === -1}
        className={`${base} ${comment.like_type === -1 ? 'text-accent' : 'text-faint'}`}
      >
        <span aria-hidden>▼</span> {formatCount(comment.dislike_count)}
      </button>
    </div>
  )
}

export function CommentList({
  comments,
  loading,
  onVote,
  onReply,
}: {
  comments?: readonly Comment[]
  loading?: boolean
  onVote: (commentId: string, type: number) => void
  onReply: (parentId: string, content: string) => void
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null)

  if (loading) return <div className="py-6 text-center text-sm text-faint">댓글을 불러오는 중…</div>
  if (!comments || comments.length === 0) {
    return <EmptyState message="첫 댓글을 남겨보세요." />
  }

  return (
    <div className="flex flex-col text-text">
      {comments.map((comment) => (
        <div key={comment.id} className="border-b border-b-line-soft py-4 last:border-b-0">
          <CommentHead comment={comment} />
          <CommentBody comment={comment} />
          <div className="flex items-center gap-3">
            <VoteRow comment={comment} onVote={onVote} />
            {!comment.deleted ? (
              <button
                type="button"
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="mt-1 text-xs text-faint transition-colors duration-100 hover:text-text-strong"
              >
                답글
              </button>
            ) : null}
          </div>

          {replyTo === comment.id ? (
            <ReplyForm
              onSubmit={(content) => {
                onReply(comment.id, content)
                setReplyTo(null)
              }}
            />
          ) : null}

          {/* 대댓글은 1단계까지만 — 여기서 더 중첩하지 않는다 */}
          {comment.comments.length > 0 ? (
            <div className="mt-3 border-l border-l-line-soft pl-4">
              {comment.comments.map((reply) => (
                <div key={reply.id} className="py-2">
                  <CommentHead comment={reply} />
                  <CommentBody comment={reply} />
                  <VoteRow comment={reply} onVote={onVote} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ReplyForm({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="mt-3 flex items-start gap-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        className={INPUT}
        placeholder="답글을 입력하세요."
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={() => {
          onSubmit(value.trim())
          setValue('')
        }}
        className={SUBMIT}
      >
        등록
      </button>
    </div>
  )
}

/**
 * 댓글 작성 폼.
 *
 * 반익명 체크박스는 **옵트인**이다 (`showAnonymousToggle`).
 * 호출부가 체크 값을 `disclose_type` 으로 서버에 보낼 준비가 됐을 때만 켠다 —
 * 켜 두고 값을 버리면 화면이 거짓말을 한다. 지금
 * `apps/web/app/board/[category]/[id]/page.tsx` 는 `disclose_type: 0` 을 고정으로 보낸다.
 */
export function CommentForm({
  onSubmit,
  requirePassword,
  showAnonymousToggle = false,
  defaultAnonymous = true,
}: {
  /** `anonymous` 가 false 면 닉네임과 소속이 모두 공개된다 (SITE_SPEC_V2 2절) */
  onSubmit: (content: string, password: string | null, anonymous: boolean) => void
  /** 비로그인 작성이면 삭제용 비밀번호를 받는다 */
  requirePassword: boolean
  /** 익명 체크박스를 보일지 */
  showAnonymousToggle?: boolean
  /** 체크박스 초기값. 에브리타임처럼 익명이 기본이다 */
  defaultAnonymous?: boolean
}) {
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [anonymous, setAnonymous] = useState(defaultAnonymous)

  const canSubmit = content.trim().length > 0 && (!requirePassword || password.length > 0)

  return (
    <div className="mt-8 flex flex-col border-t border-t-line pt-6">
      <div className="mb-3 text-sm tracking-[0.12em] text-faint">댓글쓰기</div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        className={INPUT}
        placeholder="댓글을 입력하세요."
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {showAnonymousToggle ? (
          <label className="flex cursor-pointer select-none items-center gap-1 text-sm text-meta">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            익명
          </label>
        ) : null}
        {requirePassword ? (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="삭제용 비밀번호"
            className={`h-9 w-48 ${FIELD}`}
          />
        ) : null}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit(content.trim(), requirePassword ? password : null, anonymous)
            setContent('')
            setPassword('')
          }}
          className={`${SUBMIT} ml-auto w-24`}
        >
          등록
        </button>
      </div>
    </div>
  )
}
