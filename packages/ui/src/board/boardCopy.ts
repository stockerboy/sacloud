/**
 * 게시판 화면의 표시 분기 — 순수 함수 (`officialCopy` · `weaponCopy` 와 같은 이유).
 *
 * 여기가 틀리면 **읽기 전용 게시판에 글쓰기 버튼이 뜬다.** 실제로 그랬다 —
 * Hot게시판에 `글쓰기`(`/board/hot/write`)와 검색 폼이 그대로 나갔다
 * (UI_PARITY_AUDIT 9-1 · 9-2). 눈으로는 다른 게시판과 구분되지 않으므로 테스트로 고정한다.
 */

/**
 * Hot게시판 slug.
 *
 * Hot게시판은 다른 게시판의 글을 모아 보여 주는 **집계 화면**이라 글을 쓸 곳이 아니다.
 * 계약(`Category`)에 "읽기 전용" 플래그가 없어서 slug 로 판정한다 —
 * 계약을 바꾸는 일은 이 작업의 범위 밖이라 UI 쪽에 한정해 두고 여기 한 곳에만 적는다.
 * 서버가 플래그를 주게 되면 이 함수의 구현만 바꾸면 된다.
 */
const AGGREGATE_BOARD = 'hot'

/**
 * 화면에 보이는 게시판 이름 — 서버가 준 이름을 덮어쓰는 **표시 전용** 표.
 *
 * 사용자 지시(2026-08-30): `인기게시판` → `Hot게시판`.
 * **slug · 라우트 · API 경로 · DB 값은 그대로다.** 서버는 여전히 `hot` / `인기` 를 준다.
 * 서버 쪽 이름이 바뀌면 이 표에서 항목만 지우면 원래대로 돌아온다.
 */
const DISPLAY_NAME: Readonly<Record<string, string>> = {
  [AGGREGATE_BOARD]: 'Hot',
}

/**
 * 카테고리 이름을 화면 표기로 바꾼다.
 *
 * 표에 없는 slug 는 서버가 준 이름을 **그대로** 돌려준다 — 여기서 이름을 지어내지 않는다.
 */
export function boardDisplayName(categorySlug: string, categoryName: string): string {
  return DISPLAY_NAME[categorySlug] ?? categoryName
}

/**
 * 게시판 소제목 — 탭 아래에 현재 게시판 이름을 한 번 더 적는다.
 *
 * 카테고리 이름 뒤에 `게시판` 을 붙이는 규칙이다 (`자유` → `자유게시판`).
 * 넘겨받는 이름은 이미 `boardDisplayName` 을 거친 표시 이름이어야 한다
 * (`hot` → `Hot` → `Hot게시판`).
 */
export function boardHeading(categoryName: string): string {
  return `${categoryName}게시판`
}

/** 이 게시판에 `글쓰기`·검색 폼을 보여 주는가 (Hot게시판만 둘 다 없다) */
export function boardAllowsWriteAndSearch(categorySlug: string): boolean {
  return categorySlug !== AGGREGATE_BOARD
}

/** `/board` 로 들어왔을 때의 기본 게시판 */
export const DEFAULT_BOARD_SLUG = 'free'

/**
 * 작성자 소속 표기 — `veritas 소속` (SITE_SPEC_V2 2절).
 *
 * 에브리타임에서 글쓴이 옆에 학교 이름이 붙는 자리다. **익명이어도 붙는다.**
 * 소속이 없으면(계정 연동이 없거나 무소속) 아예 적지 않는다 —
 * `무소속 소속` 같은 말을 만들지 않는다.
 */
export function affiliationLabel(clanName: string | null | undefined): string | null {
  const name = clanName?.trim()
  return name ? `${name} 소속` : null
}
