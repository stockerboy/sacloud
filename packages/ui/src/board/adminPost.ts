/**
 * **관리자 글** 판정과 고정 규칙 — 순수 함수 (`boardCopy` · `preparingText` 와 같은 이유).
 *
 * 사용자 지시 (2026-09-02):
 * ```
 * Hot게시판
 * 자유게시판open
 * 관리자가 쓴글은 자유게시판 상단고정 및 Hot게시판 자동등록
 * ```
 *
 * 서버(`apps/web/lib/server/queries/boards.ts`)와 Mock(`packages/mock/src/store.ts`)이
 * **같은 상수·같은 판정**을 쓰도록 여기 한 곳에 둔다. 두 벌로 적으면 반드시 어긋난다.
 *
 * > **원본(3rd.supply)과 동일함이 검증되지 않았다.** 원본에 관리자 글 고정이 있었는지는
 * > [미확인]이고, 아래 규칙은 이 지시를 받아 우리가 정한 것이다 (`CLAUDE.md` 3장 7번 · D-261).
 */
import { ROLE } from '@sacloud/contract'
import type { BoardListItem, BoardWriter } from '@sacloud/contract'

/**
 * 상단에 고정할 관리자 글의 **개수 상한**.
 *
 * 한 페이지가 15건인데 고정이 그보다 많으면 게시판이 아니라 공지판이 된다.
 * 3건이면 첫 화면에서 고정 줄이 목록의 1/5을 넘지 않는다.
 * 상한을 넘긴 관리자 글은 **사라지지 않는다** — 고정 줄에서 빠질 뿐, 평소 목록에 그대로 남는다.
 */
export const ADMIN_PIN_LIMIT = 3

/** 고정 줄에 붙는 표식 */
export const ADMIN_BADGE_LABEL = '운영자'

/**
 * 이 글을 **관리자가 썼는가**.
 *
 * 판정은 `writer.role` 하나뿐이다 — 운영자 판정을 새로 만들지 않고
 * 이미 있는 것(`ROLE.ADMIN = 2`, `lib/server/ownership.ts` · `queries/boards.ts`)을 그대로 쓴다.
 *
 * **익명 글은 관리자 글이 아니다.** 서버는 익명 글의 `role` 을 0으로 지워 내보내므로
 * (`toBoardWriter` — "익명의 마지막 방어선") 여기까지 오지 않지만, 화면 코드가 실수해도
 * 신원이 새지 않도록 `anonymous` 도 함께 본다.
 * 익명으로 쓴 관리자 글을 위로 올리면 **고정 자체가 신원 표시**가 된다 —
 * 운영자가 익명을 골랐다는 것은 이름을 감추겠다는 뜻이므로 고정하지 않는다.
 */
export function isAdminWriter(writer: Pick<BoardWriter, 'role' | 'anonymous'>): boolean {
  return !writer.anonymous && writer.role === ROLE.ADMIN
}

/** 목록 행이 관리자 글인가 */
export function isAdminPost(item: Pick<BoardListItem, 'writer'>): boolean {
  return isAdminWriter(item.writer)
}
