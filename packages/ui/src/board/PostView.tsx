'use client'

import Link from 'next/link'
import { ThumbIcon } from './ThumbIcon'
import type { Board } from '@sacloud/contract'
import { sanitizePostContent } from './sanitize'
import { formatCount } from '../common/format'
import { WriterName } from './WriterName'
import { looksLikeHtml } from './plainText'

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
      <ThumbIcon up={up} size={15} />
      <span className="num">{formatCount(count)}</span>
      <span className="sr-only">{up ? '추천' : '비추천'}</span>
    </button>
  )
}

/**
 * ★글 상세도 에타 꼴로★ (2026-09-25 사장님 「게시판 좀 더 에타처럼 바꿔줘 (메인 말고
 * 게시판 메뉴 내에서)」). 목록(`BoardListEta`)만 에타였고 눌러서 들어간 글 상세는
 * 옛 적진 카드(얇은 선 · 밝은 카드) 그대로라 들어가는 순간 다른 사이트처럼 보였다.
 * 색·둥근 모서리를 목록과 같은 값으로 맞춘다. 옛 판은 `POST_ETA=false` 로 돌아간다.
 */
export const POST_ETA = true
const ETA = {
  bg: '#0f1729',
  border: '#243250',
  divider: '#1e2a42',
  strong: '#f2f4f8',
  dim: '#8f95af',
  faint: '#6f7b95',
  accent: '#5c80e0',
} as const

function EtaVoteButton({
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
      className="inline-flex w-28 items-center justify-center gap-2 rounded-full border py-2 text-sm font-bold transition-colors duration-100"
      style={{
        borderColor: active ? ETA.accent : ETA.divider,
        color: active ? ETA.accent : ETA.dim,
        background: active ? 'rgba(92,128,224,.12)' : 'transparent',
      }}
    >
      <ThumbIcon up={up} size={15} />
      <span className="num">{formatCount(count)}</span>
      <span className="sr-only">{up ? '추천' : '비추천'}</span>
    </button>
  )
}

export function PostView({
  post,
  onVote,
  basePath,
  admin,
}: {
  post: Board
  /** 1 = 추천, -1 = 비추천 (계약의 `VoteType`) */
  onVote: (type: number) => void
  /** 수정·삭제 링크의 뿌리 (지시 #14-2 — 리그 안 게시판). 없으면 예전 그대로 `/board/{category}` */
  basePath?: string
  /**
   * ★관리자 단추★ (2026-09-25 사장님 「관리자 권한으로 아무글이나 상단 고정하고 내릴 수 있게」).
   * 보는 사람이 관리자일 때만 호출부가 넘긴다. 없으면 아무것도 안 그린다.
   */
  admin?: { onTogglePin: () => void; busy?: boolean } | null
}) {
  const base = basePath ?? `/board/${post.category}`
  /* 태그 없는 옛 글(줄바꿈만 있는 글)은 줄바꿈을 살려 그린다 — 새 글은 저장할 때 <p> 로 바뀐다 */
  const preWrap = !looksLikeHtml(post.content)

  if (POST_ETA) {
    return (
      <article className="rounded-[18px] border px-5 py-5 max-md:px-4" style={{ background: ETA.bg, borderColor: ETA.border, color: ETA.strong }}>
        <header className="flex flex-col gap-2.5">
          <h1 className="text-[19px] font-extrabold leading-snug max-md:text-[17px]" style={{ color: ETA.strong }}>
            {post.pinned ? (
              <span className="mr-2 inline-block rounded-sm px-1.5 py-0.5 align-middle text-[10px] font-bold" style={{ background: ETA.accent, color: '#0c1526' }}>
                고정
              </span>
            ) : null}
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px]" style={{ color: ETA.dim }}>
            <WriterName writer={post.writer} />
            <span className="num" style={{ color: ETA.faint }}>{formatPostDate(post.created_at)}</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]" style={{ color: ETA.faint }}>
            <span className="num">조회 {formatCount(post.view_count)}</span>
            <span className="num">추천 {formatCount(post.like_count)}</span>
            <span className="num">비추천 {formatCount(post.dislike_count)}</span>
          </div>
        </header>

        <div className="my-4 border-t" style={{ borderColor: ETA.divider }} />

        <div
          className={`post-body max-w-[68ch] break-words text-[14.5px] leading-7 ${preWrap ? 'whitespace-pre-wrap' : ''}`}
          style={{ color: '#dbe0ee' }}
          // sanitizePostContent 를 거친 문자열만 들어온다
          dangerouslySetInnerHTML={{ __html: sanitizePostContent(post.content) }}
        />
        {/* 문단 HTML(<p>·<h3>) 이 붙어 보이지 않게 — 글 본문 안에서만 산다 */}
        <style>{`.post-body p{margin:0 0 1em}.post-body p:last-child{margin-bottom:0}.post-body h2,.post-body h3{margin:1.6em 0 .6em;font-weight:700;font-size:1.15em;color:${ETA.strong}}.post-body h2:first-child,.post-body h3:first-child{margin-top:0}`}</style>

        {admin ? (
          <div className="mt-5 flex items-center gap-2 text-[12px]" style={{ color: ETA.dim }}>
            관리자
            <button
              type="button"
              disabled={admin.busy}
              onClick={admin.onTogglePin}
              className="rounded-full border px-3 py-1 text-[12px] font-bold disabled:opacity-50"
              style={{ borderColor: ETA.accent, color: ETA.accent }}
            >
              {post.pinned ? '상단 고정 해제' : '상단 고정'}
            </button>
          </div>
        ) : null}

        <div className="mt-8 flex select-none items-center justify-center gap-2">
          {/*
            ★2026-09-25 — 같은 단추를 다시 누르면 ★취소★★ (감시 QA 에서 잡음)
              서버는 type 0(취소)을 받는데 화면이 늘 1/-1 만 보내서 한 번 누른 추천을 되돌릴 길이 없었다
              (서버 `applyVote` 는 같은 값이면 아무것도 안 한다). 눌린 상태면 0 을 보낸다. 옛 판: 늘 1 / -1.
          */}
          <EtaVoteButton count={post.like_count} up active={post.like_type === 1} onClick={() => onVote(post.like_type === 1 ? 0 : 1)} />
          <EtaVoteButton count={post.dislike_count} up={false} active={post.like_type === -1} onClick={() => onVote(post.like_type === -1 ? 0 : -1)} />
        </div>

        {/*
          본인 글일 때만 수정/삭제가 보인다. 비로그인 글은 비밀번호로 삭제한다.
          ★관리자는 남의 글도 삭제할 수 있다★ (2026-09-25 사장님 「관리자는 글 아무거나 다
          삭제할 수 있게 해줘 기본권한으로」) — 수정은 그대로 본인만(내용을 대신 고치면 안 된다).
        */}
        {post.me || !post.login ? (
          <div className="mt-5 flex select-none flex-row-reverse gap-2 text-[12px]">
            <Link prefetch={false} href={`${base}/${post.id}/delete`} className="rounded-full border px-3 py-1.5 font-bold" style={{ borderColor: ETA.divider, color: ETA.dim }}>
              삭제
            </Link>
            <Link prefetch={false} href={`${base}/${post.id}/update`} className="rounded-full border px-3 py-1.5 font-bold" style={{ borderColor: ETA.divider, color: ETA.dim }}>
              수정
            </Link>
          </div>
        ) : admin ? (
          <div className="mt-5 flex select-none flex-row-reverse gap-2 text-[12px]">
            <Link prefetch={false} href={`${base}/${post.id}/delete`} className="rounded-full border px-3 py-1.5 font-bold" style={{ borderColor: ETA.accent, color: ETA.accent }}>
              삭제 (관리자)
            </Link>
          </div>
        ) : null}

        <div className="mt-7 border-t pt-4 text-[12px]" style={{ borderColor: ETA.divider, color: ETA.dim }}>
          댓글 <span className="num">{formatCount(post.comment_count)}</span>개
        </div>
      </article>
    )
  }

  return (
    <article className="rounded-[var(--radius)] border border-line bg-card px-6 py-6 text-text max-md:px-4">
      <header className="flex flex-col gap-3">
        <h1 className="display text-3xl leading-snug text-text-strong">
          {post.pinned ? <span className="mr-2 inline-block rounded-sm bg-[#5c80e0] px-2 py-0.5 align-middle text-xs font-bold text-[#0c1526]">고정</span> : null}
          {post.title}
        </h1>

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
        className={`post-body max-w-[68ch] break-words text-[1.05rem] leading-7 ${preWrap ? 'whitespace-pre-wrap' : ''}`}
        // sanitizePostContent 를 거친 문자열만 들어온다
        dangerouslySetInnerHTML={{ __html: sanitizePostContent(post.content) }}
      />
      {/* 문단 HTML(<p>·<h3>) 이 붙어 보이지 않게 — 글 본문 안에서만 산다 */}
      <style>{`.post-body p{margin:0 0 1em}.post-body p:last-child{margin-bottom:0}.post-body h2,.post-body h3{margin:1.6em 0 .6em;font-weight:700;font-size:1.15em;color:var(--color-text-strong,#f2f4f8)}.post-body h2:first-child,.post-body h3:first-child{margin-top:0}`}</style>

      {admin ? (
        <div className="mt-6 flex items-center gap-2 text-sm">
          <span className="text-faint">관리자</span>
          <button type="button" disabled={admin.busy} onClick={admin.onTogglePin} className="btn-line px-3 py-1.5 text-sm disabled:opacity-50">
            {post.pinned ? '상단 고정 해제' : '상단 고정'}
          </button>
        </div>
      ) : null}

      <div className="mt-10 flex select-none items-center justify-center gap-2">
        <VoteButton
          count={post.like_count}
          up
          active={post.like_type === 1}
          onClick={() => onVote(post.like_type === 1 ? 0 : 1)}
        />
        <VoteButton
          count={post.dislike_count}
          up={false}
          active={post.like_type === -1}
          onClick={() => onVote(post.like_type === -1 ? 0 : -1)}
        />
      </div>

      {post.me || !post.login ? (
        <div className="mt-6 flex select-none flex-row-reverse gap-2">
          <Link prefetch={false} href={`${base}/${post.id}/delete`} className="btn-line px-3 py-1.5 text-sm">
            삭제
          </Link>
          <Link prefetch={false} href={`${base}/${post.id}/update`} className="btn-line px-3 py-1.5 text-sm">
            수정
          </Link>
        </div>
      ) : admin ? (
        <div className="mt-6 flex select-none flex-row-reverse gap-2">
          <Link prefetch={false} href={`${base}/${post.id}/delete`} className="btn-line border-accent px-3 py-1.5 text-sm text-accent">
            삭제 (관리자)
          </Link>
        </div>
      ) : null}

      <div className="mt-10 border-t border-t-line pt-5 text-sm tracking-[0.12em] text-faint">
        댓글 <span className="num">{formatCount(post.comment_count)}</span>개
      </div>
    </article>
  )
}
