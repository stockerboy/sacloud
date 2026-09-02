'use client'

import { useEffect, useRef, useState } from 'react'
import { CLAN_SEARCH_HINT } from '@sacloud/contract'
import {
  SEARCH_SUGGEST_ENABLED,
  SUGGEST_MAX_ITEMS,
  type SearchSuggestion,
} from './searchSuggest'

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
  /**
   * 못 찾았을 때 입력창 밑에 띄울 한 줄 (D-254).
   *
   * **문구를 여기서 만들지 않는다.** 어떤 실패인지 아는 것은 조회한 쪽이라
   * 호출한 쪽이 `@sacloud/contract` 의 문구를 골라 넘긴다.
   * 비어 있으면 아무것도 그리지 않는다 — 자리를 비워 두지도 않는다.
   */
  notice?: string | null
  /**
   * 자동완성 후보 (O-002 · 2026-09-02). **넘기지 않으면 지금까지와 똑같이 동작한다.**
   *
   * 부르고 고르는 것은 화면 쪽이다 — `onSubmit` 을 그렇게 나눠 둔 것과 같은 규칙이다.
   * 여기는 받은 것을 그리기만 한다.
   */
  suggestions?: readonly SearchSuggestion[]
  /** 입력이 바뀔 때마다 알린다. 디바운스·취소·캐시는 **받는 쪽**이 한다 */
  onQueryChange?: (type: SearchType, query: string) => void
  /** 후보를 골랐을 때. `key` 는 선수면 id, 클랜·리그면 slug */
  onPick?: (type: SearchType, suggestion: SearchSuggestion) => void
}

export function SearchBar({
  onSubmit,
  notice = null,
  suggestions,
  onQueryChange,
  onPick,
}: SearchBarProps) {
  const [type, setType] = useState<SearchType>('player')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  /** 화살표로 짚고 있는 후보. -1 이면 아무것도 안 짚은 상태 = 엔터는 지금까지대로 제출 */
  const [active, setActive] = useState(-1)
  /** 후보를 골라 나간 직후·`Esc` 를 누른 뒤에는 다시 칠 때까지 목록을 닫아 둔다 */
  const [dismissed, setDismissed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = OPTIONS.find((option) => option.type === type) ?? OPTIONS[0]!

  /* 그릴 후보. 서버가 더 줘도 여기서 자른다 (`SUGGEST_MAX_ITEMS`) */
  const items =
    SEARCH_SUGGEST_ENABLED && !dismissed && focused
      ? (suggestions ?? []).slice(0, SUGGEST_MAX_ITEMS)
      : []
  const suggestOpen = items.length > 0

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  /* 후보 목록이 바뀌면 짚고 있던 자리를 놓는다 — 엉뚱한 줄이 선택된 채로 남지 않게 */
  useEffect(() => {
    setActive(-1)
  }, [suggestions])

  const submit = () => {
    const query = text.trim()
    if (!query) return
    setDismissed(true)
    onSubmit(type, query)
  }

  const pick = (suggestion: SearchSuggestion) => {
    setDismissed(true)
    setActive(-1)
    onPick?.(type, suggestion)
  }

  /** 입력이 바뀌었다. 목록을 다시 열고 바깥에 알린다 */
  const changeText = (value: string) => {
    setText(value)
    setDismissed(false)
    setActive(-1)
    onQueryChange?.(type, value.trim())
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
                    /* 종류가 바뀌면 후보도 바뀐다 — 옛 종류의 후보가 남지 않게 다시 묻는다 */
                    setActive(-1)
                    setDismissed(false)
                    onQueryChange?.(option.type, text.trim())
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
          onChange={(event) => changeText(event.target.value)}
          onFocus={() => setFocused(true)}
          /* 후보를 누르는 동안 blur 가 먼저 터져 목록이 사라지면 클릭이 안 먹는다.
             한 박자 늦춰 닫는다 (`onMouseDown` 으로 고르는 방법도 있으나 키보드와 갈린다) */
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          role="combobox"
          aria-expanded={suggestOpen}
          aria-autocomplete="list"
          aria-controls="search-suggest"
          aria-activedescendant={active >= 0 ? `search-suggest-${active}` : undefined}
          onKeyDown={(event) => {
            /* 후보가 떠 있을 때만 화살표가 목록을 짚는다. 안 떠 있으면 지금까지와 같다 */
            if (suggestOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((index) => {
                const next = index + step
                if (next < 0) return items.length - 1
                if (next >= items.length) return 0
                return next
              })
              return
            }
            if (event.key === 'Escape') {
              setDismissed(true)
              setActive(-1)
              return
            }
            if (event.key === 'Enter') {
              /* ★짚은 후보가 있으면 그리로, 없으면 지금까지대로 정확일치 제출★
                 정확일치 경로는 손대지 않는다 (O-002 · `CLAUDE.md` 1-4) */
              const chosen = active >= 0 ? items[active] : undefined
              if (chosen) {
                event.preventDefault()
                pick(chosen)
                return
              }
              submit()
            }
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

      {/* --- 후보 목록 (2026-09-02 · O-002) ---
             ★새로 만든 화면이 아니다★ — 이미 있던 `players/search` · `clans/search` ·
             `leagues/search` 를 홈이 부르게 한 것뿐이다. 지금까지 이 셋을 쓰는 곳은
             리그 설정 한 군데뿐이었다.

             모양은 위 「검색 종류」 드롭다운과 같은 규칙이다 — 면을 칠하지 않고
             1px 선과 왼쪽 강조선 하나로만 그린다. 짚은 줄에만 강조색이 닿는다.

             자리 — 검색창 바로 아래에 겹쳐 띄운다(`absolute`). 아래 문구들을
             밀어내면 누를 때마다 화면이 출렁인다. 부모(`relative`)는 바깥 div 다. */}
      {suggestOpen ? (
        <div className="relative">
          <ul
            id="search-suggest"
            role="listbox"
            className="absolute left-0 right-0 top-1 z-20 max-h-[336px] overflow-y-auto border border-line bg-card py-1"
          >
            {items.map((item, index) => (
              <li key={item.key} id={`search-suggest-${index}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  onMouseEnter={() => setActive(index)}
                  className={`block w-full cursor-pointer border-l-2 px-4 py-2.5 text-left transition-colors duration-100 max-md:px-3 ${
                    index === active ? 'border-l-accent bg-card-2' : 'border-l-transparent'
                  }`}
                >
                  <span
                    className={`block truncate text-[14px] leading-5 ${
                      index === active
                        ? 'text-[var(--color-text-strong,#f6eded)]'
                        : 'text-[var(--color-text,#d6c9c9)]'
                    }`}
                  >
                    {item.name}
                  </span>
                  {item.sub ? (
                    <span className="mt-0.5 block truncate text-[12px] leading-4 text-meta">
                      {item.sub}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* --- 클랜 검색 안내 (2026-09-01) ---
             사용자가 «문구 유저가 볼 수 있게» 라고 지시한 한 줄이다.
             **클랜을 고른 사람에게만** 보인다 — 플레이어·리그에는 해당 없는 규칙이라
             늘 띄우면 헛말이 된다. 문구 자체는 `@sacloud/contract` 의
             `CLAN_SEARCH_HINT` 하나에서 온다(화면과 계약이 갈리지 않게).
             면을 칠하지 않고 흐린 글자 한 줄로만 둔다 — 검색창이 주인공이다. */}
      {type === 'clan' ? (
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-[var(--color-faint,#6b5555)]">
          {CLAN_SEARCH_HINT}
        </p>
      ) : null}

      {/* --- 못 찾았을 때 (2026-09-01 · D-254) ---
             예전에는 **아무 일도 일어나지 않았다.** 엔터를 쳐도 화면이 그대로라
             사용자는 사이트가 멈춘 것인지 없는 것인지 구별할 수 없었다.
             진홍은 쓰지 않는다 — 「없음」은 오류가 아니다. 흐린 글자 한 줄이면 된다. */}
      {notice ? (
        <p
          role="status"
          className="mt-2 px-1 text-[12px] leading-relaxed text-[var(--color-meta,#9a8080)]"
        >
          {notice}
        </p>
      ) : null}
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
