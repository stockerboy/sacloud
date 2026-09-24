import { PAGE_SIZE } from '@sacloud/contract'
import { boardClosed } from '@/lib/server/boardGate'
import { fail, guard, guardPublic, ok, okPagePublic } from '@/lib/server/respond'
import { jsonBody, pageParams, query } from '@/lib/server/request'
import { createBoard, listBoards } from '@/lib/server/queries/boards'

/**
 * GET  /api/boards — 글 목록 (15건 단위, 원본 관측값)
 * POST /api/boards — 글 작성
 *
 * 목록 규칙
 * - `category=hot`은 저장된 카테고리가 아니라 집계 결과다
 * - `category=notice`는 공지만, 그 외 카테고리는 공지를 뺀 글만 (화면이 공지를 따로 호출해 고정한다)
 * - 검색은 `type`(board/ipname/nickname) + `q`
 */
export async function GET(request: Request) {
  return guardPublic(request, 600, async () => {
    const { cursor, size } = pageParams(request, PAGE_SIZE.BOARD)
    const page = await listBoards({
      // Mock 핸들러와 같은 기본값
      category: query(request, 'category') ?? 'free',
      cursor,
      size,
      type: query(request, 'type'),
      q: query(request, 'q'),
    })
    /*
     * 짧게 — 목록은 세션과 무관하지만 사람이 방금 쓴 글이 곧 보여야 한다 (D-240).
     *
     * ⚠ ★2026-09-25 — 30초 → 5초★ (사장님 「하나 삭제했는데 삭제가 안돼」)
     *   글을 지워도 ★같은 주소가 30초 동안 옛 목록을 그대로 돌려줬다.★ 관리자가 지우고
     *   새로고침해도 그대로 있으니 ★삭제가 안 먹은 것처럼★ 보인다 (실제로는 DB 에서 지워져 있었다).
     *   Board 는 15줄짜리 작은 표라 5초로 줄여도 원본 부담이 거의 없다.
     *   옛 값 30 (`CLAUDE.md` 1-4).
     */
    return okPagePublic(page, 5)
  })
}

export async function POST(request: Request) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const result = await createBoard(request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
