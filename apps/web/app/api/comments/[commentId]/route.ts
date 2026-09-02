import { fail, guard, ok } from '@/lib/server/respond'
import { boardClosed } from '@/lib/server/boardGate'
import { jsonBody, routeParam } from '@/lib/server/request'
import { deleteComment, updateComment } from '@/lib/server/queries/boards'

/**
 * PUT    /api/comments/{commentId} — 댓글 수정
 * DELETE /api/comments/{commentId} — 댓글 삭제 (행은 남기고 내용만 가린다)
 */
type Context = { params: Promise<Record<string, string>> }

export async function PUT(request: Request, context: Context) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const commentId = await routeParam(context, 'commentId')
    const result = await updateComment(commentId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}

export async function DELETE(request: Request, context: Context) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const commentId = await routeParam(context, 'commentId')
    const result = await deleteComment(commentId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
