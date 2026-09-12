'use client'

/**
 * ★페이지 번호 줄★ (2026-09-12 사장님).
 *
 * > «개인랭킹은 페이지로 만들고싶어 한페이지에 몇명씩 들어가는게 좋을까?
 * >  약간 이런거 쟤 1페야 ㄴㄴ 쟤 2페이지로 내려감 ㅋㅋㅋ 이런거
 * >  현 1페이지 라플수 찐 평가 이런거 할 수 있게끔» → 한 쪽 20명으로 정하심
 *
 * ── 왜 「더 불러오기」가 아니라 번호인가
 *   «1페» 가 자랑거리가 되려면 ★쪽이 눈에 보여야★ 한다. 이어 붙이는 목록에는
 *   경계가 없어서 «몇 페이지» 라는 말 자체가 안 생긴다.
 *
 * ── 무엇을 그리나
 *   처음 · 이전 · 번호 몇 개 · 다음 · 마지막. 번호는 ★지금 쪽 둘레로 최대 7개★ 다.
 *   끝 쪽 가까이 가면 창이 안쪽으로 붙어 언제나 같은 개수를 보여 준다.
 *   쪽이 하나뿐이면 ★아무것도 안 그린다★ — 쓸모없는 줄을 남기지 않는다.
 *
 * ⚠ 「더 불러오기」(`LoadMoreButton`)는 ★지우지 않았다★ (`CLAUDE.md` 1-4).
 *   다른 목록은 그대로 그것을 쓴다.
 */

/** 지금 쪽 둘레로 보여 줄 번호 개수 (홀수라야 가운데가 생긴다) */
const WINDOW = 7

/** 1..last 안에서 `page` 를 가운데 두는 번호 창 */
export function pageWindow(page: number, last: number, size = WINDOW): number[] {
  if (last <= size) return Array.from({ length: last }, (_, i) => i + 1)
  const half = Math.floor(size / 2)
  const start = Math.min(Math.max(1, page - half), last - size + 1)
  return Array.from({ length: size }, (_, i) => start + i)
}

export interface PagerProps {
  /** 1부터 */
  page: number
  /** 모두 몇 쪽인가. 1 이하면 아무것도 안 그린다 */
  lastPage: number
  onSelect: (page: number) => void
  /** 오른쪽에 «876명 · 44쪽» 같은 말을 붙인다. 모르면 안 붙인다 */
  note?: string | null
}

export function Pager({ page, lastPage, onSelect, note = null }: PagerProps) {
  if (lastPage <= 1) return null
  const nums = pageWindow(page, lastPage)
  const go = (n: number) => () => {
    if (n === page || n < 1 || n > lastPage) return
    onSelect(n)
  }
  return (
    <div className="v2-pager">
      <button type="button" className="v2-pager__step" disabled={page <= 1} onClick={go(1)} aria-label="첫 쪽">
        ‹‹
      </button>
      <button type="button" className="v2-pager__step" disabled={page <= 1} onClick={go(page - 1)} aria-label="이전 쪽">
        ‹
      </button>
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          className={`v2-pager__num ${n === page ? 'is-on' : ''}`}
          aria-current={n === page ? 'page' : undefined}
          onClick={go(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" className="v2-pager__step" disabled={page >= lastPage} onClick={go(page + 1)} aria-label="다음 쪽">
        ›
      </button>
      <button type="button" className="v2-pager__step" disabled={page >= lastPage} onClick={go(lastPage)} aria-label="끝 쪽">
        ››
      </button>
      {note ? <span className="v2-pager__note">{note}</span> : null}
    </div>
  )
}
