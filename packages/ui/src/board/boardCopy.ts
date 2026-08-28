/**
 * 게시판 화면의 표시 분기 — 순수 함수 (`officialCopy` · `weaponCopy` 와 같은 이유).
 *
 * 여기가 틀리면 **읽기 전용 게시판에 글쓰기 버튼이 뜬다.** 실제로 그랬다 —
 * 인기게시판에 `글쓰기`(`/board/hot/write`)와 검색 폼이 그대로 나갔다
 * (UI_PARITY_AUDIT 9-1 · 9-2). 눈으로는 다른 게시판과 구분되지 않으므로 테스트로 고정한다.
 */

/**
 * 게시판 소제목 — 탭 아래에 현재 게시판 이름을 한 번 더 적는다.
 *
 * 2026-08-27 원본 실측: `자유` → `자유게시판`, `인기` → `인기게시판`, `3부` → `3부게시판`.
 * 카테고리 이름 뒤에 `게시판` 을 붙이는 규칙이다. 우리 화면에는 이 줄이 아예 없었다
 * (UI_PARITY_AUDIT 9-3).
 */
export function boardHeading(categoryName: string): string {
  return `${categoryName}게시판`
}

/**
 * 인기게시판 slug.
 *
 * 인기게시판은 다른 게시판의 글을 모아 보여 주는 **집계 화면**이라 글을 쓸 곳이 아니다.
 * 계약(`Category`)에 "읽기 전용" 플래그가 없어서 slug 로 판정한다 —
 * 계약을 바꾸는 일은 이 작업의 범위 밖이라 UI 쪽에 한정해 두고 여기 한 곳에만 적는다.
 * 서버가 플래그를 주게 되면 이 함수의 구현만 바꾸면 된다.
 */
const AGGREGATE_BOARD = 'hot'

/** 이 게시판에 `글쓰기`·검색 폼을 보여 주는가 (원본: 인기게시판만 둘 다 없다) */
export function boardAllowsWriteAndSearch(categorySlug: string): boolean {
  return categorySlug !== AGGREGATE_BOARD
}

/** `/board` 로 들어왔을 때의 기본 게시판 (원본은 `/board/free` 로 랜딩한다) */
export const DEFAULT_BOARD_SLUG = 'free'
