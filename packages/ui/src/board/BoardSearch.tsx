'use client'

import { useState } from 'react'

/**
 * 게시판 검색.
 *
 * 2026-08-27 원본 실측 (`/board/free`)
 * ```
 * <form>
 *   <select>
 *     <option value="board">제목+내용</option>
 *     <option value="ipname">작성자[별칭]</option>
 *     <option value="nickname">작성자[닉네임]</option>
 *   <input type="text" placeholder="검색어">
 *   <button type="submit"><아이콘></button>     ← 버튼에 글자가 없다
 * ```
 * 위치는 **소제목·글쓰기 줄 바로 아래, 목록 위**다. 우리는 목록 아래에 두고 있었고
 * 셀렉트 라벨의 대괄호·placeholder·버튼 글자가 전부 달랐다
 * (UI_PARITY_AUDIT 9-5 · 9-9 · 9-10 · 9-11).
 */

export type BoardSearchType = 'board' | 'ipname' | 'nickname'

const TYPES: readonly { value: BoardSearchType; label: string }[] = [
  { value: 'board', label: '제목+내용' },
  { value: 'ipname', label: '작성자[별칭]' },
  { value: 'nickname', label: '작성자[닉네임]' },
]

export function BoardSearch({
  defaultType = 'board',
  defaultQuery = '',
  onSearch,
}: {
  defaultType?: BoardSearchType
  defaultQuery?: string
  onSearch: (type: BoardSearchType, query: string) => void
}) {
  const [type, setType] = useState<BoardSearchType>(defaultType)
  const [query, setQuery] = useState(defaultQuery)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    onSearch(type, trimmed)
  }

  return (
    <form onSubmit={submit} className="flex items-center justify-center py-4">
      <select
        value={type}
        onChange={(event) => setType(event.target.value as BoardSearchType)}
        className="h-10 rounded-l border border-line bg-card px-3"
      >
        {TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="검색어"
        className="h-10 w-72 border-y border-line px-3"
      />
      <button
        type="submit"
        aria-label="검색"
        className="flex h-10 w-10 items-center justify-center rounded-r border border-more bg-more text-white"
      >
        <SearchIcon />
      </button>
    </form>
  )
}

/** 돋보기 — 원본은 Font Awesome 을 쓰지만 자산을 가져오지 않고 새로 그렸다 */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="6.8" cy="6.8" r="4.8" />
      <path d="M10.4 10.4 14.5 14.5" strokeLinecap="round" />
    </svg>
  )
}
