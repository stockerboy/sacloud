'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 통합검색 — 메인의 주인공.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 그렸다
 *   예전 모양(파란 셀렉터 + 흰 입력 + 둥근 모서리)은 3rd.supply 실측을 그대로 옮긴
 *   것이었다. 이제 원본을 따라갈 이유가 없다.
 *
 * ── 동작은 하나도 바뀌지 않았다
 *   검색 종류 셋(플레이어 / 클랜 / 리그), 엔터·돋보기 제출, 바깥을 누르면 닫히는
 *   드롭다운까지 전부 그대로다. **모양만** 바꿨다.
 *
 * ── 모양 규칙
 *   - 면을 칠하지 않는다. 1px 선으로 그린 한 덩어리다
 *   - 진홍은 **포커스가 닿았을 때의 테두리**와 돋보기 하나에만 쓴다
 *   - 모서리는 거의 각지게(`--radius`)
 *   - 입력 글자는 본문 서체, 크기만 키운다. 제목 서체를 쓰지 않는다
 */

export type SearchType = 'player' | 'clan' | 'league'

interface SearchOption {
  type: SearchType
  label: string
  placeholder: string
}

const OPTIONS: readonly SearchOption[] = [
  /*
   * 플레이어 placeholder 는 `닉네임 또는 병영수첩 주소` 다.
   * 주소 붙여넣기는 이미 동작한다 — 서버가 `playerRefsFromBarracksUrl`(D-162)로
   * 주소에서 식별자를 뽑는다. 되는데 안내가 없어서 아무도 안 쓰던 기능이다.
   */
  {
    type: 'player',
    label: '플레이어',
    placeholder: '닉네임 또는 병영수첩 주소',
  },
  { type: 'clan', label: '클랜', placeholder: '클랜명' },
  { type: 'league', label: '리그', placeholder: '리그명' },
]

export interface SearchBarProps {
  /** 제출(엔터 또는 돋보기 클릭) 시 호출된다. 조회·이동은 호출한 쪽이 담당한다. */
  onSubmit: (type: SearchType, query: string) => void
}

export function SearchBar({ onSubmit }: SearchBarProps) {
  const [type, setType] = useState<SearchType>('player')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
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
    <div ref={rootRef} className="mx-auto w-full max-w-[560px] text-left">
      <div
        className={`flex items-stretch rounded-[var(--radius,2px)] border transition-colors duration-100 ${
          focused || open ? 'border-accent' : 'border-line'
        }`}
      >
        {/* --- 검색 종류 --- */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-full w-[112px] cursor-pointer select-none items-center justify-between gap-2 border-r border-line px-4 text-[13px] text-meta transition-colors duration-100 hover:text-[var(--color-text-strong,#f6eded)] max-md:w-[92px] max-md:px-3"
          >
            <span className="whitespace-nowrap">{selected.label}</span>
            <CaretDownIcon />
          </button>

          {open ? (
            <div
              role="listbox"
              className="absolute left-[-1px] top-full z-10 mt-1 w-[112px] select-none border border-line bg-card py-1 text-left max-md:w-[92px]"
            >
              {OPTIONS.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  role="option"
                  aria-selected={option.type === type}
                  onClick={() => {
                    setType(option.type)
                    setOpen(false)
                  }}
                  className={`block w-full cursor-pointer border-l border-transparent px-4 py-2.5 text-left text-[13px] transition-colors duration-100 hover:border-l-accent hover:text-[var(--color-text-strong,#f6eded)] ${
                    option.type === type
                      ? 'border-l-accent text-[var(--color-text-strong,#f6eded)]'
                      : 'text-meta'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* --- 입력 --- */}
        <input
          type="text"
          value={text}
          placeholder={selected.placeholder}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          className="min-w-0 flex-1 appearance-none bg-transparent px-4 py-4 text-[15px] text-[var(--color-text-strong,#f6eded)] placeholder:text-[var(--color-faint,#6b5555)] focus:outline-none max-md:px-3 max-md:py-3"
        />

        <button
          type="button"
          aria-label="검색"
          onClick={submit}
          className="flex shrink-0 cursor-pointer items-center px-4 text-meta transition-colors duration-100 hover:text-accent max-md:px-3"
        >
          <SearchIcon />
        </button>
      </div>
    </div>
  )
}

function CaretDownIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="h-3 w-3 shrink-0"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3.5 7h13L10 15.5z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="13" cy="13" r="9.5" strokeWidth="3" />
      <path d="M19.9 19.9 29 29" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
