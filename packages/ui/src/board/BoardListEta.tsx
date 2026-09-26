'use client'

/**
 * ★게시판 — 에브리타임(에타) 꼴★ (사장님 2026-09-24 「게시판을 진짜 에타 게시판 UI 로 · 자유게시판이나 게시판 형식도 에타랑 똑같이」)
 *
 *   ┌ ‹  자유게시판          🔍 ⋮ ┐   ← 머리: 뒤로 · 이름 · 검색
 *   │    연합                     │
 *   ├ 인기  자유  ─────────────── ┤   ← 탭 (사장님 「인기/자유 순으로 상단에 탭」)
 *   │ ▣ 공지  …                   │   ← 에타의 광고 자리 = ★우리 공지 자리★ (사장님 「광고 안 넣으니 그 자리에 공지사항」)
 *   │ 제목                         │
 *   │ 미리보기 한 줄                │
 *   │ 👍 2 · 💬 1 | 방금 | [마크] 익명 · 클랜명 │   ← 사장님 「날짜 옆에 클랜마크-익명 / 클랜마크-닉네임」
 *   └──────────────────── [✎ 글 쓰기] ┘
 *
 *   글마다 클랜마크가 ★꼭★ 들어간다 — 소속을 모르면 「모름 마크」(FallbackClanMark · 사장님 그림).
 *   옛 표(`BoardTable`)는 그대로 있다 — `BoardListScreen` 의 BOARD_ETA=false 로 돌아간다 (CLAUDE.md 1-4).
 */
import Link from 'next/link'
import type { BoardListItem, BoardWriter } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { RelativeTime } from '../common/RelativeTime'
import { formatCount } from '../common/format'
import { affiliationName } from './boardCopy'
import { isAdminWriter } from './adminPost'
import { AdminWriterName } from './WriterName'

/** 탭 — 사장님 순서: 인기 · 자유 (공지는 탭이 아니라 위 칸에 붙는다) */
export const ETA_TABS: readonly { slug: string; label: string }[] = [
  { slug: 'hot', label: '인기' },
  { slug: 'free', label: '자유' },
]

/** 글쓴이 한 조각 — [마크] 익명 · 클랜명  /  [마크] 닉네임 · 클랜명. 마크는 언제나 있다 */
export function EtaWriter({ writer }: { writer: BoardWriter }) {
  /* ★관리자가 공개로 쓴 글★ — SACLOUD 이름 + 사이트 구름 (2026-09-25 사장님) */
  if (isAdminWriter(writer)) return <AdminWriterName size={14} />
  const clan = writer.clan ?? null
  const clanName = affiliationName(clan?.name)
  /*
   * ⚠ ★2026-09-26 — 표시 이름을 여기서 다시 정하지 않는다★ (사장님 스샷 「이건
   * 간고딩어가 쓴거니까 익명으로 표시하면 안되지」).
   *
   *   옛 줄은 익명이면 무조건 리터럴 '익명' 을 그렸다 — 서버가 애써 골라 준 표시
   *   이름(목록이면 「익명」, 관리자 대리 닉네임을 줬으면 그 이름 그대로 — 위
   *   `toBoardWriter`)을 통째로 무시했다. `WriterName.tsx`(글 상세·댓글)는 처음부터
   *   `writer.nickname` 을 그대로 썼는데 ★목록만 따로 놀았다.★ `writer.nickname` 은
   *   `BoardWriter` 계약상 항상 있다 — 익명이어도 서버가 이미 적절한 문자열을 넣어
   *   보낸다. 그대로 쓴다.
   */
  const who = writer.nickname
  /* ★클랜명은 눌러서 클랜 페이지로★ (2026-09-25 사장님 「모든 클랜명 누르면 바로 클랜페이지로」) */
  const mark = <ClanMark clan={clan} size="xxs" alt="" />
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {clan ? (
        <Link prefetch={false} href={`/clan/${clan.slug}`} className="shrink-0 hover:opacity-80" onClick={(e) => e.stopPropagation()}>
          {mark}
        </Link>
      ) : (
        mark
      )}
      <span className={`shrink-0 ${writer.anonymous ? 'text-[#a4b0c8]' : 'text-[#e8eaf2]'}`}>{who}</span>
      {clanName ? (
        <Link prefetch={false} href={clan ? `/clan/${clan.slug}` : '#'} className="min-w-0 truncate text-[#8f95af] hover:text-[#e8eaf2]" onClick={(e) => e.stopPropagation()}>
          · {clanName}
        </Link>
      ) : null}
    </span>
  )
}

/* ★0개도 뜬다★ (2026-09-25 사장님 「좋아요 몇개인지 댓글 몇개인지 안떠 0개여도 떠야하는데」)
   옛 판은 0이면 통째로 숨겼다 — 그래서 0인지 안 온 것인지 구별이 안 됐다. 이제는 항상 그린다. */
function Counts({ item }: { item: BoardListItem }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5 tabular-nums">
      <span className="inline-flex items-center gap-1 text-[#ff6b6b]">
        <ThumbGlyph />
        {formatCount(item.like_count)}
      </span>
      <span className="inline-flex items-center gap-1 text-[#38bdf8]">
        <BubbleGlyph />
        {formatCount(item.comment_count)}
      </span>
    </span>
  )
}

function ThumbGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 7h3v7H2zM5 7l3-5c1 0 2 .8 2 2v3h3.2c.9 0 1.5.8 1.3 1.6l-1 4.4c-.1.6-.6 1-1.2 1H5" strokeLinejoin="round" />
    </svg>
  )
}
function BubbleGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 3h12v8H7l-3.5 3V11H2z" strokeLinejoin="round" />
    </svg>
  )
}

export function EtaRow({ item, basePath }: { item: BoardListItem; basePath?: string }) {
  const href = basePath ? `${basePath}/${item.id}` : `/board/${item.category}/${item.id}`
  return (
    <li className="border-b border-[#1e2a42]">
      {/* 2026-09-24 사장님 「게시판 글자 크기좀 줄여」 — 폰만(max-md:) */}
      <Link prefetch={false} href={href} className="block px-4 py-3.5 transition-colors hover:bg-[#121c2f] max-md:px-3.5 max-md:py-3">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[15.5px] font-bold leading-snug text-[#f2f4f8] max-md:text-[13.5px]">
            {/* ★고정·공지 표식★ (2026-09-25) — 고정 글은 첫 쪽 맨 위에 얹히므로 왜 위에 있는지 보여 준다 */}
            {item.pinned ? <span className="mr-1.5 inline-block rounded-sm bg-[#5c80e0] px-1.5 py-0.5 align-middle text-[10px] font-bold text-[#0c1526]">고정</span> : null}
            {item.notice && !item.pinned ? <span className="mr-1.5 inline-block rounded-sm border border-[#5c80e0] px-1.5 py-0.5 align-middle text-[10px] font-bold text-[#5c80e0]">공지</span> : null}
            {item.title}
          </span>
          {item.has_image ? <ImageGlyph /> : null}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-[12px] text-[#8f95af] max-md:mt-1.5 max-md:text-[11px]">
          <Counts item={item} />
          <span aria-hidden className="text-[#33405f]">|</span>
          <span className="shrink-0 tabular-nums"><RelativeTime value={item.created_at} /></span>
          <span aria-hidden className="text-[#33405f]">|</span>
          <span className="min-w-0 truncate"><EtaWriter writer={item.writer} /></span>
        </div>
      </Link>
    </li>
  )
}

function ImageGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="mt-1 h-3 w-3 shrink-0 text-[#8f95af]" fill="currentColor" aria-hidden>
      <path d="M1 1h10v10H1zm1.5 7.5 2-2.5 1.5 2L8.5 5l2 3.5z" />
    </svg>
  )
}

/**
 * ★공지 칸★ — 에타에서 광고가 앉던 자리.
 *
 * ⚠ ★2026-09-26 정정★ (사장님 「공지사항 올리니까 첫번째 공지사항이 없어졌어
 *   공지사항 올리면 무조건 누적 상단 고정시켜」) — 옛 판은 `notices` 중 ★맨 앞 하나만★
 *   카드로 그렸다. 그래서 새 공지를 쓰면 `notices[0]` 이 새 글로 바뀌면서 ★먼저 있던
 *   공지가 화면 어디에도 안 보이게★ 됐다(자유·Hot 목록 둘 다 `notice` 카테고리 글 자체를
 *   빼고 그린다 — 공지의 유일한 자리가 이 카드였다). 이제 `notices` 를 ★전부★ 쌓아 그린다.
 *
 * 관리자가 `notice` 게시판에 쓴 글의 카드는 없으면 칸을 안 그린다(빈 자리표시자를 두지
 * 않는다 · CLAUDE.md 2-3). 이 칸은 화면(`BoardListEta`)이 자유·Hot 어느 탭이든 똑같이
 * 그린다 — 그래서 공지는 ★이미★ Hot 에도 늘 보인다(따로 「자동 핫게시물」 처리가 필요 없다).
 */
export function EtaNoticeCard({ notices, text }: { notices?: readonly BoardListItem[] | null; text?: { title: string | null; lines: string[] } | null }) {
  const hasText = !!(text && (text.title || text.lines.length > 0))
  const list = notices ?? []
  if (!hasText && list.length === 0) return null
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      {/* ★관리자가 /admin/texts 에 쓴 글이 먼저★ — 제목 한 줄 + 본문 줄들. 링크 없이 그 자리에서 읽는다 */}
      {hasText ? (
        <div className="rounded-[14px] border border-[#2b3a5c] bg-[#121c2f] px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.08em] text-[#5c80e0]">
            <span className="rounded-sm bg-[#5c80e0] px-1.5 py-0.5 text-[10px] text-[#0c1526]">공지</span>
            SACLOUD
          </div>
          {text?.title ? <div className="mt-1.5 text-[14.5px] font-bold text-[#f2f4f8]">{text.title}</div> : null}
          {text && text.lines.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] leading-relaxed text-[#a4b0c8]">
              {text.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      {list.map((notice) => (
        <Link
          key={notice.id}
          prefetch={false}
          href={`/board/notice/${notice.id}`}
          className="block rounded-[14px] border border-[#2b3a5c] bg-[#121c2f] px-4 py-3 transition-colors hover:border-[#5c80e0]"
        >
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.08em] text-[#5c80e0]">
            <span className="rounded-sm bg-[#5c80e0] px-1.5 py-0.5 text-[10px] text-[#0c1526]">공지</span>
            SACLOUD
          </div>
          <div className="mt-1.5 truncate text-[14.5px] font-bold text-[#f2f4f8]">{notice.title}</div>
          <div className="mt-1 text-[11.5px] text-[#8f95af]"><RelativeTime value={notice.created_at} /></div>
        </Link>
      ))}
    </div>
  )
}

export function BoardListEta({
  category,
  title,
  subtitle = 'SACLOUD',
  notices,
  noticeText,
  items,
  loading,
  error,
  onRetry,
  basePath,
  writeHref,
  onSearch,
}: {
  category: string
  title: string
  subtitle?: string
  notices?: readonly BoardListItem[]
  /** 관리자 「화면 글」 공지 — 있으면 notice 글보다 먼저 */
  noticeText?: { title: string | null; lines: string[] } | null
  items?: readonly BoardListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  basePath?: string
  /** 글쓰기 길 — 없으면 단추를 안 그린다 (Hot 게시판) */
  writeHref?: string | null
  onSearch?: () => void
}) {
  return (
    <div className="relative mx-auto w-full max-w-[720px] pb-24 text-[#e8eaf2]">
      {/* 머리 — 뒤로 · 이름 · 검색 */}
      <div className="flex items-center gap-2 px-2 py-2">
        <Link href="/" aria-label="홈" className="flex h-10 w-10 items-center justify-center text-[#e8eaf2]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
          <span className="text-[17px] font-bold text-[#f2f4f8]">{title}</span>
          <span className="text-[11.5px] text-[#8f95af]">{subtitle}</span>
        </div>
        <button type="button" aria-label="검색" onClick={onSearch} className="flex h-10 w-10 items-center justify-center text-[#e8eaf2]">
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" strokeLinecap="round" /></svg>
        </button>
      </div>

      {/* 탭 — 인기 · 자유 */}
      <div className="flex border-b border-[#1e2a42] px-2">
        {ETA_TABS.map((t) => {
          const on = t.slug === category
          return (
            <Link
              key={t.slug}
              prefetch={false}
              href={`/board/${t.slug}`}
              aria-current={on ? 'page' : undefined}
              className={`-mb-px px-4 py-2.5 text-[15px] font-bold ${on ? 'border-b-2 border-[#f2f4f8] text-[#f2f4f8]' : 'border-b-2 border-transparent text-[#6f7b95]'}`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>

      <EtaNoticeCard notices={notices} text={noticeText ?? null} />

      {error ? (
        <div className="px-4"><ErrorState message="글 목록을 불러오지 못했습니다." onRetry={onRetry} /></div>
      ) : loading ? (
        <ul /* 2026-09-24 사장님 「게시판 보드 너무 각져 — 에타처럼 모서리만 둥글게」: 좌우 12 띄운 둥근 카드(18). 옛 판은 맨몸 <ul> */ className="mx-3 mt-3 overflow-hidden rounded-[18px] border border-[#243250] bg-[#0f1729]">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="border-b border-[#1e2a42] px-4 py-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></li>
          ))}
        </ul>
      ) : !items || items.length === 0 ? (
        <div className="px-4"><EmptyState message="글이 없습니다." /></div>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => <EtaRow key={item.id} item={item} basePath={basePath} />)}
        </ul>
      )}

      {writeHref ? (
        <Link
          href={writeHref}
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1a2238] px-5 py-3 text-[15px] font-bold text-[#f2f4f8] shadow-[0_6px_24px_rgba(0,0,0,.45)] ring-1 ring-[#2b3a5c]"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-[#ff6b6b]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M4 20h4l10-10-4-4L4 16z" strokeLinejoin="round" /></svg>
          글 쓰기
        </Link>
      ) : null}
    </div>
  )
}
