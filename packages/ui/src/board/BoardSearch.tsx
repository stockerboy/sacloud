'use client'

import { useState } from 'react'

/**
 * 게시판 검색 — `적진`.
 *
 * 검색 종류(제목+내용 / 작성자[별칭] / 작성자[닉네임])와 제출 동작은 그대로다.
 * 겉만 바꿨다 — 채운 색 버튼 대신 테두리, 각진 모서리(`--radius`), 얇은 선 하나.
 * 진홍은 **포커스와 hover 에서만** 나타난다.
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
    <form onSubmit={submit} className="flex items-center gap-2 py-4">
      <select
        value={type}
        onChange={(event) => setType(event.target.value as BoardSearchType)}
        className="h-9 rounded-[var(--radius)] border border-line bg-card px-2 text-sm text-text outline-none transition-colors duration-100 focus:border-accent"
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
        className="h-9 w-64 rounded-[var(--radius)] border border-line bg-card px-3 text-sm text-text placeholder:text-faint outline-none transition-colors duration-100 focus:border-accent max-md:w-full max-md:min-w-0"
      />
      <button type="submit" aria-label="검색" className="btn-line h-9 w-9 shrink-0">
        <SearchIcon />
      </button>
    </form>
  )
}

/** 돋보기 — 자산을 가져오지 않고 새로 그렸다 */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <circle cx="6.8" cy="6.8" r="4.8" />
      <path d="M10.4 10.4 14.5 14.5" strokeLinecap="round" />
    </svg>
  )
}
