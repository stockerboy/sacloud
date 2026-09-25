'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

const FIELD =
  'rounded-[var(--radius)] border border-line bg-card px-3 py-2 text-text placeholder:text-faint outline-none transition-colors duration-100 focus:border-accent'

/**
 * ★관리자 대리 클랜 고르기★ (2026-09-25) — 이미 있는 통로(`clansSearch`)로 찾아 고른다.
 * 고르면 그 클랜 소속 익명 글/댓글처럼 나가고, 안 고르면 평소처럼(관리자 본인 이름) 나간다.
 * `/apply` 의 `ClanSearch` 와 같은 패턴 — 새 검색 API 를 만들지 않는다.
 *
 * 글쓰기(`PostForm`)에서 처음 만들었고, 댓글(`CommentForm`)도 같은 통로를 쓰게
 * 2026-09-25 에 여기로 뽑았다 (사장님 「댓글 달때도 다른 클랜인척하면서 클랜 바꿔서 달 수 있게」).
 */
export function AdminAsClanPicker({
  picked,
  onPick,
  placeholder = '관리자 대리 클랜 — 이 클랜 소속 익명으로 쓰기 (두 글자부터 검색)',
}: {
  picked: { slug: string; name: string } | null
  onPick: (c: { slug: string; name: string } | null) => void
  placeholder?: string
}) {
  const ready = useApiReady()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const term = q.trim()
  const hits = useQuery({
    queryKey: ['clans', 'search', term],
    queryFn: () => apiGet('clansSearch', { params: { q: term } }),
    enabled: ready && term.length >= 2 && picked === null,
  })

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (picked !== null) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-accent bg-card-2 px-3 py-2 text-sm">
        <span className="text-faint">대리 클랜</span>
        <span className="font-bold text-accent">{picked.name}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            onPick(null)
            setQ('')
          }}
          className="text-xs text-meta underline"
        >
          해제
        </button>
      </div>
    )
  }

  const rows = hits.data?.data ?? []

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(event) => {
          setQ(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`h-10 w-full ${FIELD}`}
      />
      {!open || term.length < 2 ? null : (
        <div className="absolute left-0 right-0 top-11 z-10 max-h-64 overflow-y-auto rounded-[var(--radius)] border border-line bg-card">
          {hits.isLoading ? (
            <div className="px-3 py-2 text-sm text-faint">찾는 중…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-sm text-faint">일치하는 클랜이 없습니다.</div>
          ) : (
            rows.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  onPick({ slug: c.slug, name: c.name })
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-card-2"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
