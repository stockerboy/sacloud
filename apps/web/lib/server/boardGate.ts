import { BOARD_CLOSED_MESSAGE, BOARD_OPEN } from '@sacloud/contract'
import { forbidden } from './respond'

/**
 * **게시판 쓰기 문** — 닫혀 있으면 여기서 막는다 (O-011 · 2026-09-02).
 *
 * ══ 왜 필요했나 ══
 *
 * 게시판을 「화면 6개 밖」이라 닫아 뒀다고 알고 있었는데 **쓰기 API 에는 개폐 검사가
 * 아예 없었다.** 화면에서 링크만 감췄을 뿐이라 주소를 아는 사람은 계속 쓸 수 있었다.
 * 게다가 **로그인도 필요 없다** — 비밀번호만 있으면 써진다(`queries/boards.ts` 633행).
 * 캡차는 TODO 다(622행). 관리자는 자리에 없다.
 *
 * ══ 어디에 다나 ══
 *
 * 쓰기 일곱 곳 전부다. **한 곳이라도 빠지면 문이 열려 있는 것과 같다.**
 * ```
 * POST   /api/boards                     글 작성
 * PUT    /api/boards/{id}                글 수정
 * DELETE /api/boards/{id}                글 삭제
 * POST   /api/boards/{id}/votes          글 추천
 * POST   /api/comments                   댓글 작성
 * PUT    /api/comments/{id}              댓글 수정
 * DELETE /api/comments/{id}              댓글 삭제
 * POST   /api/comments/{id}/votes        댓글 추천
 * ```
 *
 * **읽기(GET)에는 안 단다.** 막으려는 위험은 도배이고 그건 쓰기다.
 * 판단의 근거는 `packages/contract/src/boardOpen.ts` 주석에 적었다.
 *
 * ══ 왜 403 인가 ══
 *
 * 404 로 하면 「그런 주소가 없다」는 뜻이 되는데 주소는 있다. 401 은 「로그인하면 된다」는
 * 뜻인데 로그인해도 안 된다. **「지금은 안 된다」가 403 이다.**
 * 문구는 화면이 쓰는 것과 같은 곳에서 온다 — 화면과 서버가 다른 말을 하지 않게.
 */
export function boardClosed(): Response | null {
  return BOARD_OPEN ? null : forbidden(BOARD_CLOSED_MESSAGE)
}
