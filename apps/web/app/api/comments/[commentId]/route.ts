import { fail, guard, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { deleteComment, updateComment } from '@/lib/server/queries/boards'

/**
 * PUT    /api/comments/{commentId} — 댓글 수정
 * DELETE /api/comments/{commentId} — 댓글 삭제 (행은 남기고 내용만 가린다)
 */
type Context = { params: Promise<Record<string, string>> }

export async function PUT(request: Request, context: Context) {
  return guard(async () => {
    const commentId = await routeParam(context, 'commentId')
    const result = await updateComment(commentId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}

export async function DELETE(request: Request, context: Context) {
  return guard(async () => {
    const commentId = await routeParam(context, 'commentId')
    const result = await deleteComment(commentId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
