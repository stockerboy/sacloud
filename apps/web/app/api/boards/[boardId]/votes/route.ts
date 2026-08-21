import { fail, guard, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { voteBoard } from '@/lib/server/queries/boards'

/**
 * POST /api/boards/{boardId}/votes — 글 추천/비추천
 *
 * 한 투표자당 1행(`Vote`의 `(targetType, targetId, voterKey)` 유니크)만 남는다.
 * 다시 누르면 갱신, `type: 0`이면 취소다. 응답은 갱신된 글 상세다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const boardId = await routeParam(context, 'boardId')
    const result = await voteBoard(boardId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
