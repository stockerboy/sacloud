/**
 * 랭킹 표의 치수 토큰.
 *
 * `RankTable.tsx` 가 원본 스크린샷 픽셀 실측으로 맞춰 놓은 값이다.
 * 랭킹 화면에 무엇을 덧붙이든 **새 크기를 추측하지 말고 여기 값을 그대로 쓴다**
 * (폼 TOP3 · 무기 탭도 이 리듬을 따른다).
 *
 * 실측 근거와 계산식은 `RankTable.tsx` 상단 주석에 있다. 요약하면 —
 *   루트 폰트 14px · 모바일 행 간격 36px · 클랜마크 1.4rem · 표는 화면 끝까지(`.mobile-bleed`)
 */

/** 표 머리글 줄 */
export const HEAD = 'flex items-center border-b border-b-line py-2 text-meta max-md:text-sm'

/** 표 본문 한 줄. PC 는 `py-3 text-lg`, 모바일만 실측값으로 줄인다 */
export const ROW =
  'flex items-center border-b border-b-line bg-row py-3 text-lg text-meta last:border-b-0 max-md:py-[0.55rem] max-md:text-sm'

/** 표 안의 클랜마크 — 좁은 화면에서만 줄인다 (실측 58 device px ÷ 3 ≈ 1.4rem) */
export const MARK = 'mr-2 max-md:h-[1.4rem] max-md:w-[1.4rem]'

/**
 * 모바일 컬럼 규칙 (2026-08-28 원본 관측).
 *
 * 원본 모바일은 랭킹 표를 세 칸으로 줄인다 — `순위 · 이름 · 점수`.
 * 승리·패배·승률·킬뎃·평균킬은 감춘다. 가로로 밀어 보게 하지 않는다.
 */
/** 순위 칸 */
export const COL_RANK = 'w-40 text-center max-md:w-12'
/** 이름 칸 — 좁은 화면에서는 남는 폭을 다 쓴다 */
export const COL_NAME = 'flex items-center max-md:min-w-0 max-md:flex-1'
/** 점수 칸 — 좁은 화면에서는 오른쪽에 붙인다 */
export const COL_RATING =
  'flex-grow text-center max-md:w-24 max-md:flex-none max-md:pr-1 max-md:text-right'
/** 좁은 화면에서 감추는 칸 */
export const COL_HIDDEN = 'max-md:hidden'
