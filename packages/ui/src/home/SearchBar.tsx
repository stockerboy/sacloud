'use client'

import { useEffect, useRef, useState } from 'react'
import { CLAN_SEARCH_HINT } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
/* 터미널 껍데기 둘째 줄이 리그 이름을 적을 때 쓴다 — ★이름은 한 곳에서만 온다★ */
import { FEATURED_LEAGUES } from '../site-config'
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
  /**
   * ★터미널 껍데기에서 프롬프트로 쓰는 이름★ (2026-09-17 · 시안 `> findPlayer(`).
   * `terminal` 을 안 켜면 아무 데서도 안 쓰인다.
   */
  fn: string
  /**
   * 터미널 껍데기 둘째 줄(`02`)에 적는 안내.
   *
   * ★새 문구를 지어내지 않는다★ — 이미 화면·계약에 있던 말을 그대로 옮긴다.
   *   클랜   `CLAN_SEARCH_HINT` (계약 · 지금도 검색창 밑에 뜨는 그 문장)
   *   플레이어 `HomeGuide` 1번 줄의 문장
   *   리그   `FEATURED_LEAGUES` 의 이름들 — 여기 적지 않고 아래에서 붙인다
   */
  hint: string
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
    fn: 'findPlayer',
    /* `HomeGuide` 1번 줄 그대로 — 실제로 되는 동작이다 (D-162) */
    hint: '병영수첩 주소나 계정 번호를 붙여 넣어도 됩니다',
  },
  {
    type: 'clan',
    label: '클랜',
    placeholder: '클랜명',
    fn: 'findClan',
    /* 계약의 문장 그대로. 터미널 껍데기에서는 이 줄이 아래 안내를 대신한다 */
    hint: CLAN_SEARCH_HINT,
  },
  {
    type: 'league',
    label: '리그',
    placeholder: '리그명',
    fn: 'findLeague',
    /* ★리그 이름을 여기 적지 않는다★ — `FEATURED_LEAGUES` 가 정한다 */
    hint: FEATURED_LEAGUES.map((league) => league.label).join(' · '),
  },
]

export interface SearchBarProps {
  /** 제출(엔터 또는 돋보기 클릭) 시 호출된다. 조회·이동은 호출한 쪽이 담당한다. */
  /**
   * 제출. ★약속(Promise)을 돌려주면★ 그동안 「찾는 중입니다…」 를 띄운다
   * (2026-09-19). 안 돌려줘도 그대로 동작한다 — 표시만 안 뜬다.
   */
  onSubmit: (type: SearchType, query: string) => void | Promise<unknown>
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
  /**
   * 검색창 최대 폭.
   *
   * ★기본값은 옛 값(560px) 그대로다★ — 안 넘기면 지금까지와 똑같이 그려진다
   * (`CLAUDE.md` 1-4). 시안 홈은 ★720★ 이라 홈만 그 값을 넘긴다.
   */
  maxWidth?: number
  /**
   * 검색창 위를 지나가는 빛 (시안 홈의 `sacSweep`).
   *
   * ★기본은 끄기다★ — 안 넘기면 지금까지와 똑같다. 움직임을 싫어하는 사람의
   * 설정(`prefers-reduced-motion`)은 `.v2-sweep` 이 이미 존중한다.
   */
  sweep?: boolean
  /**
   * ★터미널 껍데기★ (2026-09-17 · 사장님 시안).
   *
   * ```
   *   01 | > findPlayer(  닉네임 또는 병영수첩 주소            🔍
   *   02 | > // 병영수첩 주소나 계정 번호를 붙여 넣어도 됩니다
   * ```
   *
   * ★기본은 끄기다★ — 안 넘기면 지금까지와 한 픽셀도 안 다르다 (`CLAUDE.md` 1-4).
   * ★동작은 한 줄도 안 바뀐다★ — 종류 셋 · 제출 · 자동완성 · 디바운스 전부 그대로다.
   * 「검색 종류」 드롭다운은 ★사라지지 않았다★ — `> findPlayer(` 가 그 단추다.
   */
  terminal?: boolean
  /**
   * ★구름 껍데기★ (2026-09-18 사장님: 「검색창을 다르게 다시 만들고」).
   *
   * 새 로고가 «구름 위의 고양이» 라 검색창도 ★구름 한 조각★ 처럼 둥글게 만든다.
   * 모서리를 크게 굴리고 유리처럼 비치는 바탕을 쓴다. 동작은 ★한 줄도 안 바뀐다★ —
   * 껍데기만 갈아끼운다 (`terminal` 이 그랬던 것처럼).
   */
  cloud?: boolean
}

export function SearchBar({
  onSubmit,
  notice = null,
  suggestions,
  onQueryChange,
  onPick,
  /* 560 — 2026-08-30 「적진」부터의 값. 시안 홈만 720 을 넘긴다 */
  maxWidth = 560,
  sweep = false,
  terminal = false,
  cloud = false,
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

  /*
   * ★찾는 중이라고 말한다★ (2026-09-19 검수에서 잡았다).
   *
   *   여태 엔터를 누르면 ★결과가 올 때까지 화면이 한 픽셀도 안 바뀌었다.★
   *   실측으로 응답이 120초 걸린 적이 있는데, 그 2분 동안 사용자는
   *   「멈춘 건가」 와 「찾는 중인가」 를 구별할 수 없었다.
   *   D-254 가 고쳤다던 바로 그 상태로 ★느려지면 되돌아갔다.★
   */
  const [busy, setBusy] = useState(false)
  /* 빈 값으로 엔터를 쳤을 때 한 줄 — 이것도 «아무 일도 안 일어남» 이었다 */
  const [selfNotice, setSelfNotice] = useState<string | null>(null)

  const submit = () => {
    const query = text.trim()
    if (!query) {
      setSelfNotice('닉네임이나 클랜명을 먼저 적어 주세요.')
      return
    }
    setSelfNotice(null)
    setDismissed(true)
    setBusy(true)
    /* `onSubmit` 이 약속을 돌려주면 끝날 때 풀고, 아니면 곧바로 푼다 */
    const done = onSubmit(type, query) as unknown
    if (done && typeof (done as Promise<unknown>).finally === 'function') {
      void (done as Promise<unknown>).finally(() => setBusy(false))
    } else {
      setBusy(false)
    }
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
    <div ref={rootRef} className="mx-auto w-full text-left" style={{ maxWidth }}>
      <div
        /*
         * `bg-page` — ★사진 위에서도 검색창 안이 페이지와 같은 색이다★ (O-041 ① · 2026-09-03).
         *
         * 홈에 밤하늘 사진을 깔면서 나온 것이다. 이 상자는 **테두리만 있고 바탕이 없었다.**
         * 사진 위에 놓이면 ★상자 안이 달빛 구름★ 이 된다.
         *
         * ★막(`--hero-scrim`)으로는 못 고친다.★ 막은 진하기가 한 값인데
         * **사진은 픽셀마다 밝기가 다르다** — 어떤 값을 골라도 자리마다 결과가 갈린다.
         * 상자 안에서는 글자가 어디에 놓일지도 모른다 (친 글자 길이에 따라 움직인다).
         *
         * ⚠ 처음엔 여기 「안내 글자 `--color-faint` 가 **어두운 색**이라」고 적었었다.
         *   **틀렸다.** `#6b5555` 는 이 파일 폴백과 `styles.css` 주석에 남은 D-204 옛 값이고,
         *   정의부(107행)의 실제 값은 **`#8f95af`** 다. 어두운 색이 아니다.
         *   ★색을 잴 때는 정의부 줄만 본다.★
         *
         * 그래서 상자에 **불투명한 판**을 깐다 — 윤서의 규칙 그대로다:
         * *「글자와 사진 사이에 값을 아는 층을 한 겹 깐다」*.
         * 색은 페이지와 같은 `--color-page` 라 **사진이 없는 화면에서는 아무 변화가 없다.**
         */
        /*
         * ★터미널 껍데기는 두 줄짜리 상자다★ (2026-09-17). 그래서 세로로 쌓는다.
         * 옛 껍데기는 한 줄이라 `items-stretch` 그대로다 — 아래 `contents` 참고.
         */
        /*
         * ⚠ ★구름 껍데기는 `bg-page` 를 안 쓴다★ — 유리처럼 살짝 비쳐야 구름 같다.
         *   대신 ★불투명에 가까운 어두운 판★ 을 깔아 글자 대비를 지킨다 (위 O-041 규칙과 같은 뜻).
         */
        className={
          cloud
            ? `sb-cloud relative flex items-stretch ${focused || open ? 'sb-cloud--on' : ''}`
            : `relative rounded-[var(--radius,2px)] border bg-page transition-colors duration-100 ${
                terminal ? 'flex flex-col' : 'flex items-stretch'
              } ${focused || open ? 'border-accent' : 'border-line'}`
        }
      >
        {/* 시안의 빛 — 없으면 ★요소 자체를 안 만든다★ */}
        {/*
         * ⚠ ★2026-09-17 — 자르는 자리를 옮겼다★ (버그 수정).
         *
         *   여기 있던 `overflow-hidden` 은 ★상자 자체★ 에 걸려 있었다. 빛이 상자 밖으로
         *   새는 것을 막으려던 것인데, ★「검색 종류」 드롭다운까지 같이 잘렸다.★
         *   드롭다운은 상자 ★아래★ 로 펼쳐지므로 눌러도 아무것도 안 보였다 —
         *   헤드리스로 눌러 보고 찾았다 (`[role=option]` 셋은 DOM 에 있는데 화면에 없다).
         *   ★터미널 껍데기 이전부터 있던 문제다★ (`sweep` 은 2026-09-07 부터 켜져 있었다).
         *
         *   이제 ★빛만★ 제 칸 안에서 잘린다. 상자는 안 자른다.
         */}
        {sweep ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span
              className="v2-sweep"
              style={{
                background:
                  'linear-gradient(90deg,rgba(255,255,255,0),rgba(91,141,255,.10),rgba(255,255,255,0))',
              }}
            />
          </span>
        ) : null}
        {/*
          ★첫 줄★ — 터미널이면 `01 |` 줄번호가 앞에 붙고 세 조각이 한 줄로 선다.
          터미널이 아니면 `display:contents` 라 ★이 div 자체가 없는 것처럼★ 동작한다 —
          옛 껍데기의 배치가 한 픽셀도 안 바뀐다 (`CLAUDE.md` 1-4).
        */}
        <div className={terminal ? 'flex items-stretch' : 'contents'}>
          {terminal ? <LineNo n="01" /> : null}
        {/* --- 검색 종류 --- */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            /*
             * ★터미널 껍데기에서는 읽는 기계에 이름을 따로 준다★ (2026-09-17).
             *   화면에 보이는 글자가 `> findPlayer(` 라서, 그대로 읽으면
             *   ★「findPlayer 여는괄호」★ 가 된다. 무슨 단추인지 알 수 없다.
             *
             * ⚠ 처음엔 `sr-only` 한 칸을 안에 숨겨 뒀는데, 그 방법은
             *   ★1px 칸에 52px 글자를 담는 것★ 이라 QA 도구가 「글자 짤림」으로 잡는다.
             *   `aria-label` 이면 칸 자체가 없다. 옛 껍데기는 라벨이 그대로 보이므로 안 준다.
             */
            aria-label={terminal ? `검색 종류: ${selected.label}` : undefined}
            onClick={() => setOpen((value) => !value)}
            className={
              terminal
                ? /* ★시안의 `> findPlayer(`★ — 이 글자가 곧 옛 「검색 종류」 단추다 */
                  'flex h-full cursor-pointer select-none items-center gap-[4px] py-[11px] pl-[2px] pr-[8px] font-[var(--font-num)] text-[14px] text-[var(--v2-blue,#5b8dff)] transition-opacity duration-100 hover:opacity-80 max-md:text-[12px] max-md:pr-[6px]'
                : 'flex h-full w-[112px] cursor-pointer select-none items-center justify-between gap-2 px-4 text-[13px] text-white/90 transition-colors duration-100 hover:text-white max-md:w-[92px] max-md:px-3'
            }
            /*
             * ⚠ ★2026-09-22 — 서플라이 실측: 이 조각만 남색 칩, 나머지(입력창)는 흰색★.
             *   옛 값은 조각 전체가 흰 알약 안에서 투명(구분선만)이었다. 지우지 않는다
             *   (`CLAUDE.md` 1-4) — 옛 클래스: `border-r border-line text-meta
             *   hover:text-[var(--color-text-strong,#f6eded)]`.
             */
            style={terminal ? undefined : { background: '#0c1526', borderRadius: '999px 0 0 999px' }}
          >
            {terminal ? (
              <>
                <span aria-hidden className="text-[var(--v2-text-ghost2,#3d4869)]">
                  {'>'}
                </span>
                <span className="whitespace-nowrap">
                  {selected.fn}
                  <span className="text-[var(--v2-text-ghost,#5c6580)]">(</span>
                </span>
                {/* 종류를 바꿀 수 있다는 표시 — 시안에는 없지만 없애면 드롭다운이 숨는다 */}
                <span className="text-[var(--v2-text-ghost,#5c6580)]">
                  <CaretDownIcon />
                </span>
              </>
            ) : (
              <>
                <span className="whitespace-nowrap">{selected.label}</span>
                <CaretDownIcon />
              </>
            )}
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
          className={
            terminal
              ? 'min-w-0 flex-1 appearance-none bg-transparent px-0 py-[11px] font-[var(--font-num)] text-[14px] text-[var(--color-text-strong,#f6eded)] placeholder:text-[var(--color-faint,#6b5555)] focus:outline-none max-md:text-[12px] max-md:py-[10px]'
              : 'min-w-0 flex-1 appearance-none bg-transparent px-4 py-4 text-[15px] text-[var(--color-text-strong,#f6eded)] placeholder:text-[var(--color-faint,#6b5555)] focus:outline-none max-md:px-3 max-md:py-3'
          }
        />

        <button
          type="button"
          aria-label="검색"
          onClick={submit}
          className={`flex shrink-0 cursor-pointer items-center text-meta transition-colors duration-100 hover:text-accent ${
            terminal ? 'pl-[10px] pr-[12px]' : 'px-4 max-md:px-3'
          }`}
        >
          <SearchIcon />
        </button>
        </div>

        {/* --- ★둘째 줄 `02`★ — 터미널 껍데기에서만 ------------------
               ★새 문구를 지어내지 않는다★ (`OPTIONS[].hint` 주석 참고).
               클랜일 때는 이 줄이 아래 「클랜 검색 안내」를 대신하므로
               같은 문장이 두 번 나오지 않는다. */}
        {terminal ? (
          <div className="flex items-start border-t border-[var(--v2-head-divider,#1b2542)]">
            <LineNo n="02" />
            <span
              aria-hidden
              className="shrink-0 py-[9px] pl-[2px] pr-[6px] font-[var(--font-num)] text-[12px] text-[var(--v2-text-ghost2,#3d4869)] max-md:text-[10px]"
            >
              {'>'}
            </span>
            <span className="min-w-0 flex-1 truncate py-[9px] pr-[12px] font-[var(--font-num)] text-[12px] text-[var(--v2-text-ghost,#5c6580)] max-md:text-[10px]">
              {`// ${selected.hint}`}
            </span>
          </div>
        ) : null}
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
                  {/*
                    ★이름 앞에 클랜마크★ (2026-09-10 · 사장님 상시 지시).
                    선수면 소속 클랜, 클랜이면 그 클랜 자신이다.
                    ★무소속이어도 자리를 비우지 않는다★ — 구름을 그린다 (D-146).
                    리그 줄은 `clan` 을 아예 안 넘겨서 마크 칸이 생기지 않는다.
                  */}
                  <span className="flex items-center gap-2">
                    {item.clan === undefined ? null : (
                      <ClanMark clan={item.clan} size="xs" alt={item.clan?.name ?? ''} />
                    )}
                    <span className="min-w-0 flex-1">
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
                    </span>
                  </span>
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
      {/* ★터미널 껍데기에서는 이 문장이 이미 둘째 줄(`02`)에 있다★ — 두 번 적지 않는다 */}
      {type === 'clan' && !terminal ? (
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-[var(--color-faint,#6b5555)]">
          {CLAN_SEARCH_HINT}
        </p>
      ) : null}

      {/* --- 못 찾았을 때 (2026-09-01 · D-254) ---
             예전에는 **아무 일도 일어나지 않았다.** 엔터를 쳐도 화면이 그대로라
             사용자는 사이트가 멈춘 것인지 없는 것인지 구별할 수 없었다.
             진홍은 쓰지 않는다 — 「없음」은 오류가 아니다. 흐린 글자 한 줄이면 된다. */}
      {busy ? (
        <p
          role="status"
          className="mt-2 bg-page px-1 py-1 text-[12px] leading-relaxed text-[var(--color-meta,#9a8080)]"
        >
          찾는 중입니다…
        </p>
      ) : null}
      {(notice ?? selfNotice) ? (
        <p
          role="status"
          /*
           * `bg-page` — 이 줄도 사진 위에 놓인다 (O-041 · 2026-09-03).
           * 검색이 실패했을 때만 나오지만 **그때가 제일 읽혀야 하는 순간**이다.
           * `--color-meta` 는 막 위에서 2.50:1 인데 **불투명 판 위에서는 5.92:1** 이다.
           */
          className="mt-2 bg-page px-1 py-1 text-[12px] leading-relaxed text-[var(--color-meta,#9a8080)]"
        >
          {notice ?? selfNotice}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 터미널 껍데기 왼쪽의 줄번호 칸 (`01` · `02`).
 * 읽는 기계에는 아무 뜻도 없는 장식이라 `aria-hidden` 이다.
 */
function LineNo({ n }: { n: string }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center border-r border-[var(--v2-head-divider,#1b2542)] px-[10px] py-[9px] font-[var(--font-num)] text-[12px] text-[var(--v2-text-ghost2,#3d4869)] max-md:px-[8px] max-md:text-[10px]"
    >
      {n}
    </span>
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
