'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 통합검색.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="inline-block mt-10 text-center mx-auto">        위 여백 2.5rem
 *   <div class="flex justify-center items-stretch">
 *     <div class="relative">                                  ← 셀렉터
 *       <div class="flex justify-between items-center w-44 px-5 py-4
 *                   rounded-l-lg text-lg bg-blueGray-700 text-gray-100
 *                   select-none cursor-pointer">
 *         <div class="text-left">플레이어 검색</div>
 *         <div class="w-3 text-right mb-2"><아래 화살표 아이콘></div>
 *       [열림] <div class="absolute w-44 top-20 left-0 rounded-lg bg-blueGray-700
 *                          text-gray-100 select-none text-left py-1.5 z-10">
 *                <div class="px-4 py-4 border-l-4 border-transparent
 *                            hover:bg-indigo-700 hover:border-indigo-400"> … 3개
 *     <div class="relative">                                  ← 입력
 *       <input class="search-input pl-5 pr-16 py-5 rounded-r-lg text-lg text-mblack">
 *       <div class="absolute top-4 right-4 w-8 h-8"><돋보기 아이콘></div>
 * ```
 * 실측값: 셀렉터 11rem(154px) · 입력 28rem(392px) · 전체 높이 59.5px · 모서리 0.5rem
 * 셀렉터 배경 #334155 / 글자 #F3F4F6, 입력 글자 #4A4A4A / placeholder #9CA3AF
 *
 * 아이콘은 원본이 Font Awesome을 쓰지만 자산을 가져오지 않고 같은 크기로 새로 그렸다.
 */

export type SearchType = 'player' | 'clan' | 'league'

interface SearchOption {
  type: SearchType
  label: string
  placeholder: string
}

const OPTIONS: readonly SearchOption[] = [
  { type: 'player', label: '플레이어 검색', placeholder: '닉네임을 입력하세요.' },
  { type: 'clan', label: '클랜 검색', placeholder: '클랜명을 입력하세요.' },
  // 리그 검색의 placeholder는 원본에서 확인하지 못했다 [미확인] — 위 두 개의 표기 규칙을 따랐다
  { type: 'league', label: '리그 검색', placeholder: '리그명을 입력하세요.' },
]

export interface SearchBarProps {
  /** 제출(엔터 또는 돋보기 클릭) 시 호출된다. 조회·이동은 호출한 쪽이 담당한다. */
  onSubmit: (type: SearchType, query: string) => void
}

export function SearchBar({ onSubmit }: SearchBarProps) {
  const [type, setType] = useState<SearchType>('player')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = OPTIONS.find((option) => option.type === type) ?? OPTIONS[0]!

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const submit = () => {
    const query = text.trim()
    if (!query) return
    onSubmit(type, query)
  }

  return (
    <div ref={rootRef} className="mx-auto mt-10 inline-block text-center">
      <div className="flex items-stretch justify-center">
        <div className="relative">
          <div
            role="button"
            tabIndex={0}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setOpen((value) => !value)
              }
            }}
            className="flex w-selector cursor-pointer select-none items-center justify-between rounded-l-lg bg-selector px-5 py-4 text-lg text-selector-fg"
          >
            <div className="text-left">{selected.label}</div>
            {/* 실측: 아이콘 칸 11×24.5px + 아래 여백 7px. 이 24.5+7+상하패딩 28이 셀렉터 높이 59.5px를 만든다 */}
            <div className="mb-2 flex h-7 w-3 items-center justify-end">
              <CaretDownIcon />
            </div>
          </div>

          {open ? (
            <div
              role="listbox"
              className="absolute left-0 top-20 z-10 w-selector select-none rounded-lg bg-selector py-1.5 text-left text-selector-fg"
            >
              {OPTIONS.map((option) => (
                <div
                  key={option.type}
                  role="option"
                  aria-selected={option.type === type}
                  onClick={() => {
                    setType(option.type)
                    setOpen(false)
                  }}
                  className="cursor-pointer border-l-4 border-transparent px-4 py-4 hover:border-selector-hover-edge hover:bg-selector-hover"
                >
                  {option.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative">
          <input
            type="text"
            value={text}
            placeholder={selected.placeholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            className="w-search appearance-none rounded-r-lg bg-card py-5 pl-5 pr-16 text-lg text-input-fg placeholder:text-input-placeholder focus:outline-none"
          />
          <div
            role="button"
            tabIndex={0}
            aria-label="검색"
            onClick={submit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            className="absolute right-4 top-4 h-8 w-8 cursor-pointer text-input-fg"
          >
            <SearchIcon />
          </div>
        </div>
      </div>
    </div>
  )
}

/** 실측: 20×21px 아래 방향 삼각형 */
function CaretDownIcon() {
  return (
    <svg
      viewBox="0 0 20 21"
      aria-hidden
      className="h-[21px] w-5 shrink-0"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3.5 7.5h13L10 15.5z" />
    </svg>
  )
}

/** 실측: 입력 오른쪽 안쪽 28×28px 돋보기 */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="13" cy="13" r="9.5" strokeWidth="3.5" />
      <path d="M19.9 19.9 29 29" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
