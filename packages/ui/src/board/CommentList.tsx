'use client'

import { useState, type ReactNode } from 'react'
import { ThumbIcon } from './ThumbIcon'
import type { Comment, CommentReply } from '@sacloud/contract'
import { RelativeTime } from '../common/RelativeTime'
import { EmptyState } from '../common/EmptyState'
import { formatCount } from '../common/format'
import { sanitizePostContent } from './sanitize'
import { WriterName } from './WriterName'
import { POST_ETA } from './PostView'

/** 글 상세와 같은 팔레트 (2026-09-25 「게시판 좀 더 에타처럼」) — `PostView.tsx` 의 `ETA` 와 값이 같다 */
const ETA = {
  divider: '#1e2a42',
  strong: '#f2f4f8',
  dim: '#8f95af',
  faint: '#6f7b95',
  accent: '#5c80e0',
} as const

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

const FIELD = POST_ETA
  ? 'rounded-[14px] border px-3 py-2 text-sm outline-none transition-colors duration-100'
  : 'rounded-[var(--radius)] border border-line bg-card px-3 py-2 text-sm text-text placeholder:text-faint outline-none transition-colors duration-100 focus:border-accent'
const INPUT = `w-full ${FIELD}`
const FIELD_ETA_STYLE = { background: '#0b1220', borderColor: ETA.divider, color: ETA.strong } as const

const SUBMIT = POST_ETA
  ? 'inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-sm font-bold transition-colors duration-100 disabled:opacity-40'
  : 'inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-accent px-4 text-sm text-accent transition-colors duration-100 hover:bg-card-2 disabled:border-line disabled:text-faint'
const SUBMIT_ETA_STYLE = { background: ETA.accent, color: '#0c1526' } as const

function CommentBody({ comment }: { comment: Comment | CommentReply }) {
  if (comment.deleted) {
    return (
      <div className="py-1 text-sm" style={POST_ETA ? { color: ETA.faint } : undefined}>
        삭제된 댓글입니다.
      </div>
    )
  }
  return (
    <div
      className="max-w-[68ch] break-words py-1 text-[0.95rem] leading-6"
      style={POST_ETA ? { color: '#dbe0ee' } : undefined}
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
        POST_ETA ? (
          <span className="rounded-full border px-1.5 text-xs" style={{ borderColor: ETA.accent, color: ETA.accent }}>
            글쓴이
          </span>
        ) : (
          <span className="rounded-[var(--radius)] border border-line px-1.5 text-xs text-meta">
            글쓴이
          </span>
        )
      ) : null}
      <span className="num text-xs" style={POST_ETA ? { color: ETA.faint } : undefined}>
        <RelativeTime value={comment.created_at} />
      </span>
      {comment.last_edited ? (
        <span className="text-xs" style={POST_ETA ? { color: ETA.faint } : undefined}>
          (수정됨)
        </span>
      ) : null}
    </div>
  )
}

function VoteRow({
  comment,
  onVote,
  adminUnlimitedLike = false,
}: {
  comment: Comment | CommentReply
  onVote: (commentId: string, type: number) => void
  /** `PostView.tsx` 의 같은 이름 prop과 같은 뜻 — 추천 단추는 토글 대신 항상 1을 보낸다 */
  adminUnlimitedLike?: boolean
}) {
  if (comment.deleted) return null
  const likeType = () => (adminUnlimitedLike ? 1 : comment.like_type === 1 ? 0 : 1)
  const base = 'num text-xs transition-colors duration-100 hover:text-text-strong'
  if (POST_ETA) {
    const on = (active: boolean) => ({ color: active ? ETA.accent : ETA.faint })
    return (
      <div className="mt-1 flex items-center gap-3">
        <button type="button" onClick={() => onVote(comment.id, likeType())} aria-pressed={comment.like_type === 1} className="num flex items-center gap-1 text-xs" style={on(comment.like_type === 1)}>
          <ThumbIcon up size={13} /> {formatCount(comment.like_count)}
        </button>
        <button type="button" onClick={() => onVote(comment.id, comment.like_type === -1 ? 0 : -1)} aria-pressed={comment.like_type === -1} className="num flex items-center gap-1 text-xs" style={on(comment.like_type === -1)}>
          <ThumbIcon up={false} size={13} /> {formatCount(comment.dislike_count)}
        </button>
      </div>
    )
  }
  return (
    <div className="mt-1 flex items-center gap-3">
      {/* 2026-09-25 — 눌린 단추를 다시 누르면 취소(type 0) · 글 추천과 같은 규칙 */}
      <button
        type="button"
        onClick={() => onVote(comment.id, likeType())}
        aria-pressed={comment.like_type === 1}
        className={`${base} ${comment.like_type === 1 ? 'text-accent' : 'text-faint'}`}
      >
        <ThumbIcon up size={13} /> {formatCount(comment.like_count)}
      </button>
      <button
        type="button"
        onClick={() => onVote(comment.id, comment.like_type === -1 ? 0 : -1)}
        aria-pressed={comment.like_type === -1}
        className={`${base} ${comment.like_type === -1 ? 'text-accent' : 'text-faint'}`}
      >
        <ThumbIcon up={false} size={13} /> {formatCount(comment.dislike_count)}
      </button>
    </div>
  )
}

export function CommentList({
  comments,
  loading,
  onVote,
  onReply,
  adminUnlimitedLike = false,
}: {
  comments?: readonly Comment[]
  loading?: boolean
  onVote: (commentId: string, type: number) => void
  onReply: (parentId: string, content: string) => void
  /** `PostView.tsx` 의 같은 이름 prop과 같은 뜻 — 댓글·대댓글 추천 단추에도 똑같이 적용한다 */
  adminUnlimitedLike?: boolean
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="py-6 text-center text-sm" style={POST_ETA ? { color: ETA.dim } : undefined}>
        댓글을 불러오는 중…
      </div>
    )
  }
  if (!comments || comments.length === 0) {
    return <EmptyState message="첫 댓글을 남겨보세요." />
  }

  const rowBorder = POST_ETA ? { borderColor: ETA.divider } : undefined
  const replyLinkStyle = POST_ETA ? { color: ETA.faint } : undefined

  return (
    <div className="flex flex-col text-text">
      {comments.map((comment) => (
        <div key={comment.id} className={POST_ETA ? 'border-b py-4 last:border-b-0' : 'border-b border-b-line-soft py-4 last:border-b-0'} style={rowBorder}>
          <CommentHead comment={comment} />
          <CommentBody comment={comment} />
          <div className="flex items-center gap-3">
            <VoteRow comment={comment} onVote={onVote} adminUnlimitedLike={adminUnlimitedLike} />
            {!comment.deleted ? (
              <button
                type="button"
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="mt-1 text-xs transition-colors duration-100 hover:text-text-strong"
                style={replyLinkStyle}
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
            <div className={POST_ETA ? 'mt-3 border-l pl-4' : 'mt-3 border-l border-l-line-soft pl-4'} style={POST_ETA ? { borderColor: ETA.divider } : undefined}>
              {comment.comments.map((reply) => (
                <div key={reply.id} className="py-2">
                  <CommentHead comment={reply} />
                  <CommentBody comment={reply} />
                  <VoteRow comment={reply} onVote={onVote} adminUnlimitedLike={adminUnlimitedLike} />
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
        style={POST_ETA ? FIELD_ETA_STYLE : undefined}
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
        style={POST_ETA && value.trim() ? SUBMIT_ETA_STYLE : undefined}
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
  viewerIsAdmin = false,
  renderAsClanPicker,
}: {
  /** `anonymous` 가 false 면 닉네임과 소속이 모두 공개된다 (SITE_SPEC_V2 2절) */
  onSubmit: (content: string, password: string | null, anonymous: boolean, asClanSlug: string | null) => void
  /** 비로그인 작성이면 삭제용 비밀번호를 받는다 */
  requirePassword: boolean
  /** 익명 체크박스를 보일지 */
  showAnonymousToggle?: boolean
  /** 체크박스 초기값. 에브리타임처럼 익명이 기본이다 */
  defaultAnonymous?: boolean
  /**
   * ★관리자 대리 클랜★ (2026-09-25 사장님 「댓글 달때도 다른 클랜인척하면서 클랜 바꿔서
   * 달 수 있게」). true 면 대리 클랜 고르는 칸을 보여준다. 실제 권한 검사는 서버가 한다.
   */
  viewerIsAdmin?: boolean
  /**
   * ★고르는 UI 자체는 호출부(`apps/web`)가 그린다★ — 이 패키지(`@sacloud/ui`)는 API 를
   * 모르는 순수 부품이라 클랜 검색(`clansSearch`)을 직접 부를 수 없다. 고른/고름 상태만
   * 여기서 들고, 그리는 것은 `AdminAsClanPicker` (apps/web) 에 맡긴다.
   */
  renderAsClanPicker?: (
    picked: { slug: string; name: string } | null,
    onPick: (c: { slug: string; name: string } | null) => void,
  ) => ReactNode
}) {
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [anonymous, setAnonymous] = useState(defaultAnonymous)
  const [asClan, setAsClan] = useState<{ slug: string; name: string } | null>(null)

  const canSubmit = content.trim().length > 0 && (!requirePassword || password.length > 0)

  return (
    <div
      className={POST_ETA ? 'mt-8 flex flex-col border-t pt-6' : 'mt-8 flex flex-col border-t border-t-line pt-6'}
      style={POST_ETA ? { borderColor: ETA.divider } : undefined}
    >
      <div className="mb-3 text-sm tracking-[0.12em]" style={POST_ETA ? { color: ETA.faint } : undefined}>
        댓글쓰기
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        className={INPUT}
        style={POST_ETA ? FIELD_ETA_STYLE : undefined}
        placeholder="댓글을 입력하세요."
      />
      {viewerIsAdmin && renderAsClanPicker ? (
        <div className="mt-3">{renderAsClanPicker(asClan, setAsClan)}</div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {showAnonymousToggle ? (
          <label
            className="flex cursor-pointer select-none items-center gap-1 text-sm"
            style={POST_ETA ? { color: ETA.dim } : undefined}
          >
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
            style={POST_ETA ? FIELD_ETA_STYLE : undefined}
          />
        ) : null}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit(content.trim(), requirePassword ? password : null, anonymous, viewerIsAdmin ? asClan?.slug ?? null : null)
            setContent('')
            setPassword('')
          }}
          className={`${SUBMIT} ml-auto w-24`}
          style={POST_ETA && canSubmit ? SUBMIT_ETA_STYLE : undefined}
        >
          등록
        </button>
      </div>
    </div>
  )
}
