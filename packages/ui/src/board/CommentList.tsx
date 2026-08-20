'use client'

import { useState } from 'react'
import type { Comment, CommentReply } from '@sacloud/contract'
import { RelativeTime } from '../common/RelativeTime'
import { EmptyState } from '../common/EmptyState'
import { formatCount } from '../common/format'
import { sanitizePostContent } from './sanitize'

/**
 * 댓글 목록.
 *
 * 원본 규칙 (docs/3rd-supply-structure.md · 계약)
 * - 대댓글은 **1단계까지만** 허용된다 (`comments[]` 중첩이 한 겹)
 * - 삭제된 댓글은 행을 남기고 내용만 가린다 (`deleted`)
 * - 글쓴이가 단 댓글에는 표식이 붙는다 (`board_writer`)
 * - 익명 댓글은 자동 별칭(`무명-123` 형태)으로 표시된다
 *
 * 원본의 댓글 영역 세부 배치는 실측하지 못했다 `[미확인]` — 글 상세와 같은 뼈대를 재사용했다.
 */

function CommentBody({ comment }: { comment: Comment | CommentReply }) {
  if (comment.deleted) {
    return <div className="py-1 text-meta">삭제된 댓글입니다.</div>
  }
  return (
    <div
      className="break-words py-1 leading-6"
      dangerouslySetInnerHTML={{ __html: sanitizePostContent(comment.content) }}
    />
  )
}

function CommentHead({ comment }: { comment: Comment | CommentReply }) {
  return (
    <div className="flex items-center text-sm">
      <span className={comment.writer.id ? 'text-writer' : 'text-card-text'}>
        {comment.writer.nickname}
      </span>
      {comment.board_writer ? (
        <span className="ml-1 rounded bg-badge px-1 text-xs text-white">글쓴이</span>
      ) : null}
      <span className="ml-2 text-meta">
        <RelativeTime value={comment.created_at} />
      </span>
      {comment.last_edited ? <span className="ml-1 text-meta">(수정됨)</span> : null}
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
  return (
    <div className="mt-1 flex items-center text-sm">
      <button
        type="button"
        onClick={() => onVote(comment.id, 1)}
        className={`mr-2 ${comment.like_type === 1 ? 'text-vote-up' : 'text-meta'}`}
      >
        ▲ {formatCount(comment.like_count)}
      </button>
      <button
        type="button"
        onClick={() => onVote(comment.id, -1)}
        className={comment.like_type === -1 ? 'text-vote-down' : 'text-meta'}
      >
        ▼ {formatCount(comment.dislike_count)}
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

  if (loading) return <div className="py-6 text-center text-meta">댓글을 불러오는 중…</div>
  if (!comments || comments.length === 0) {
    return <EmptyState message="첫 댓글을 남겨보세요." />
  }

  return (
    <div className="flex flex-col">
      {comments.map((comment) => (
        <div key={comment.id} className="border-b border-b-divider py-3 last:border-b-0">
          <CommentHead comment={comment} />
          <CommentBody comment={comment} />
          <div className="flex items-center">
            <VoteRow comment={comment} onVote={onVote} />
            {!comment.deleted ? (
              <button
                type="button"
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="ml-3 mt-1 text-sm text-meta"
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

          {/* 대댓글은 1단계까지만 — 여기서 더 중첩하지 않는다 (원본 규칙) */}
          {comment.comments.length > 0 ? (
            <div className="mt-2 border-l-2 border-l-divider pl-4">
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
    <div className="mt-2 flex items-start">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        className="flex-grow rounded border border-line px-2 py-1"
        placeholder="답글을 입력하세요."
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={() => {
          onSubmit(value.trim())
          setValue('')
        }}
        className="ml-2 h-10 w-20 rounded bg-more text-white disabled:opacity-60"
      >
        등록
      </button>
    </div>
  )
}

/** 댓글 작성 폼 (원본: `댓글쓰기` 제목 + 에디터 + 등록 버튼) */
export function CommentForm({
  onSubmit,
  requirePassword,
}: {
  onSubmit: (content: string, password: string | null) => void
  /** 비로그인 작성이면 삭제용 비밀번호를 받는다 (원본 동작) */
  requirePassword: boolean
}) {
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = content.trim().length > 0 && (!requirePassword || password.length > 0)

  return (
    <div className="mb-4 flex flex-col">
      <div className="my-4 font-bold">댓글쓰기</div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        className="rounded border border-line px-3 py-2"
        placeholder="댓글을 입력하세요."
      />
      <div className="mt-4 flex h-14 items-center">
        {requirePassword ? (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="삭제용 비밀번호"
            className="mr-3 h-10 w-48 rounded border border-line px-3"
          />
        ) : null}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit(content.trim(), requirePassword ? password : null)
            setContent('')
            setPassword('')
          }}
          className="inline-flex h-10 w-24 items-center justify-center rounded bg-more px-4 py-2 text-white shadow-card disabled:opacity-60"
        >
          등록
        </button>
      </div>
    </div>
  )
}
