import { fail, guard, ok } from '@/lib/server/respond'
import { boardClosed } from '@/lib/server/boardGate'
import { jsonBody, query } from '@/lib/server/request'
import { createComment, listComments } from '@/lib/server/queries/boards'

/**
 * GET  /api/comments?board_id={id} — 댓글 목록 (대댓글 1단계 중첩)
 * POST /api/comments — 댓글/대댓글 작성
 *
 * 삭제된 댓글도 행은 남고 `content`만 빈 문자열로 내려간다 (`deleted: true`).
 */
export async function GET(request: Request) {
  return guard(async () => ok(await listComments(query(request, 'board_id') ?? '', request)))
}

export async function POST(request: Request) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const result = await createComment(request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
