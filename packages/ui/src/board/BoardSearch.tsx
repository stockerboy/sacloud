'use client'

import { useState } from 'react'

/**
 * 게시판 검색.
 *
 * 원본 검색 타입 3종 (계약 `BoardSearchType`): 제목+내용 / 작성자 별칭 / 작성자 닉네임.
 * 원본의 검색 UI 위치·모양은 실측하지 못했다 `[미확인]` — 목록 아래에 배치했다.
 */

export type BoardSearchType = 'board' | 'ipname' | 'nickname'

const TYPES: readonly { value: BoardSearchType; label: string }[] = [
  { value: 'board', label: '제목+내용' },
  { value: 'ipname', label: '작성자 별칭' },
  { value: 'nickname', label: '작성자 닉네임' },
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

  const submit = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    onSearch(type, trimmed)
  }

  return (
    <div className="flex items-center justify-center py-4">
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
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        placeholder="검색어를 입력하세요."
        className="h-10 w-72 border-y border-line px-3"
      />
      <button
        type="button"
        onClick={submit}
        className="h-10 rounded-r border border-more bg-more px-4 text-white"
      >
        검색
      </button>
    </div>
  )
}
