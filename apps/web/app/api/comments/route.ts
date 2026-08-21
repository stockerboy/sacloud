import { fail, guard, ok } from '@/lib/server/respond'
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
    const result = await createComment(request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
