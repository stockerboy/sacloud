import { fail, guard, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { voteComment } from '@/lib/server/queries/boards'

/**
 * POST /api/comments/{commentId}/votes — 댓글 추천/비추천
 * 규칙은 글 추천과 같다. 응답은 갱신된 댓글이다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const commentId = await routeParam(context, 'commentId')
    const result = await voteComment(commentId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
