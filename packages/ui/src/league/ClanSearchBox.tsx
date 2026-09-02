'use client'

/**
 * 「고용가능 클랜」 검색창 (2026-09-02 사용자 지시 · D-260).
 *
 * > "클랜순위는 없애고 고용가능 클랜 이라는 항목으로 소속된 클랜 전부 보여주기
 * >  검색기능 만들기(얘만 , 클랜수가 많기 때문에 검색기능 만들어주기)"
 *
 * ── **이 화면에만** 붙인다
 *   사용자가 «얘만» 이라고 못 박았다. 개인순위에는 붙이지 않는다.
 *
 * ── 누르는 검색이 아니라 **치는 대로 걸러지는** 검색이다
 *   목록이 이미 브라우저에 전부 들어와 있어서(`ClanDirectory`) 서버에 다시 묻지 않는다.
 *   그래서 제출 버튼이 없다 — 한 글자 칠 때마다 표가 줄어든다.
 *   게시판 검색(`BoardSearch`)은 서버로 가는 검색이라 버튼이 있다. 여기는 다르다.
 *
 * ── 색
 *   새 색을 만들지 않는다. 테두리 `--color-line`, 포커스에서만 진홍(`focus:border-accent`).
 *   면을 칠하지 않는다 (D-204).
 */

export interface ClanSearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** 지금 표에 걸린 클랜 수 */
  shown: number
  /**
   * 리그에 소속된 클랜 수. 아직 다 못 받았으면 `undefined` —
   * **0 이나 지금까지 받은 수를 «전부» 라고 쓰지 않는다.**
   */
  total?: number
}

export function ClanSearchBox({ value, onChange, shown, total }: ClanSearchBoxProps) {
  const searching = value.trim().length > 0

  return (
    <div className="mb-6 flex items-center gap-3 max-md:mb-4 max-md:flex-col max-md:items-stretch max-md:gap-2">
      <div className="relative w-80 max-md:w-full">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          <SearchIcon />
        </span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="클랜 이름으로 찾기"
          aria-label="클랜 이름으로 찾기"
          className="h-10 w-full rounded-[var(--radius)] border border-line bg-card pl-9 pr-9 text-sm text-text outline-none transition-colors duration-100 placeholder:text-faint focus:border-accent"
        />
        {searching ? (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-faint transition-colors duration-100 hover:text-text"
          >
            <ClearIcon />
          </button>
        ) : null}
      </div>

      {/* 몇 곳인지 늘 보이게 둔다. 검색 중이면 «걸린 수 / 전체» 로 바뀐다 */}
      <div className="text-sm text-meta">
        {searching ? (
          <>
            <span className="num text-text-strong">{shown.toLocaleString('ko-KR')}</span>곳
            {total === undefined ? null : (
              <span className="text-faint">
                {' '}
                / <span className="num">{total.toLocaleString('ko-KR')}</span>곳
              </span>
            )}
          </>
        ) : total === undefined ? (
          '불러오는 중'
        ) : (
          <>
            <span className="num text-text-strong">{total.toLocaleString('ko-KR')}</span>곳
          </>
        )}
      </div>
    </div>
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

/** 지우기 (×) */
function ClearIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" strokeLinecap="round" />
    </svg>
  )
}
