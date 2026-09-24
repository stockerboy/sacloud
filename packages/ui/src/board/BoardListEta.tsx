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

/** 탭 — 사장님 순서: 인기 · 자유 (공지는 탭이 아니라 위 칸에 붙는다) */
export const ETA_TABS: readonly { slug: string; label: string }[] = [
  { slug: 'hot', label: '인기' },
  { slug: 'free', label: '자유' },
]

/** 글쓴이 한 조각 — [마크] 익명 · 클랜명  /  [마크] 닉네임 · 클랜명. 마크는 언제나 있다 */
export function EtaWriter({ writer }: { writer: BoardWriter }) {
  const clan = writer.clan ?? null
  const clanName = affiliationName(clan?.name)
  const who = writer.anonymous || !writer.player ? '익명' : writer.nickname
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ClanMark clan={clan} size="xxs" alt="" />
      <span className={`shrink-0 ${writer.anonymous ? 'text-[#a4b0c8]' : 'text-[#e8eaf2]'}`}>{who}</span>
      {clanName ? <span className="min-w-0 truncate text-[#8f95af]">· {clanName}</span> : null}
    </span>
  )
}

function Counts({ item }: { item: BoardListItem }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5 tabular-nums">
      {item.like_count > 0 ? (
        <span className="inline-flex items-center gap-1 text-[#ff6b6b]">
          <ThumbGlyph />
          {formatCount(item.like_count)}
        </span>
      ) : null}
      {item.comment_count > 0 ? (
        <span className="inline-flex items-center gap-1 text-[#38bdf8]">
          <BubbleGlyph />
          {formatCount(item.comment_count)}
        </span>
      ) : null}
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
      <Link prefetch={false} href={href} className="block px-4 py-3.5 transition-colors hover:bg-[#121c2f]">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[15.5px] font-bold leading-snug text-[#f2f4f8]">{item.title}</span>
          {item.has_image ? <ImageGlyph /> : null}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-[12px] text-[#8f95af]">
          <Counts item={item} />
          {item.like_count > 0 || item.comment_count > 0 ? <span aria-hidden className="text-[#33405f]">|</span> : null}
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
 * ★공지 칸★ — 에타에서 광고가 앉던 자리. 관리자가 `notice` 게시판에 쓴 글의 ★맨 위 하나★ 를 카드로 보인다.
 * 없으면 칸을 안 그린다 (빈 자리표시자를 두지 않는다 · CLAUDE.md 2-3).
 */
export function EtaNoticeCard({ notice, text }: { notice: BoardListItem | null | undefined; text?: { title: string | null; lines: string[] } | null }) {
  /* ★관리자가 /admin/texts 에 쓴 글이 먼저★ — 제목 한 줄 + 본문 줄들. 링크 없이 그 자리에서 읽는다 */
  if (text && (text.title || text.lines.length > 0)) {
    return (
      <div className="mx-3 my-3 rounded-[14px] border border-[#2b3a5c] bg-[#121c2f] px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.08em] text-[#5c80e0]">
          <span className="rounded-sm bg-[#5c80e0] px-1.5 py-0.5 text-[10px] text-[#0c1526]">공지</span>
          SACLOUD
        </div>
        {text.title ? <div className="mt-1.5 text-[14.5px] font-bold text-[#f2f4f8]">{text.title}</div> : null}
        {text.lines.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] leading-relaxed text-[#a4b0c8]">
            {text.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        ) : null}
      </div>
    )
  }
  if (!notice) return null
  return (
    <Link prefetch={false} href={`/board/notice/${notice.id}`} className="mx-3 my-3 block rounded-[14px] border border-[#2b3a5c] bg-[#121c2f] px-4 py-3 transition-colors hover:border-[#5c80e0]">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.08em] text-[#5c80e0]">
        <span className="rounded-sm bg-[#5c80e0] px-1.5 py-0.5 text-[10px] text-[#0c1526]">공지</span>
        SACLOUD
      </div>
      <div className="mt-1.5 truncate text-[14.5px] font-bold text-[#f2f4f8]">{notice.title}</div>
      <div className="mt-1 text-[11.5px] text-[#8f95af]"><RelativeTime value={notice.created_at} /></div>
    </Link>
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

      <EtaNoticeCard notice={notices?.[0] ?? null} text={noticeText ?? null} />

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
