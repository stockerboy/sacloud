import { fail, guard, ok } from '@/lib/server/respond'
import { boardClosed } from '@/lib/server/boardGate'
import { jsonBody, routeParam } from '@/lib/server/request'
import { voteComment } from '@/lib/server/queries/boards'

/**
 * POST /api/comments/{commentId}/votes — 댓글 추천/비추천
 * 규칙은 글 추천과 같다. 응답은 갱신된 댓글이다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const commentId = await routeParam(context, 'commentId')
    const result = await voteComment(commentId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
