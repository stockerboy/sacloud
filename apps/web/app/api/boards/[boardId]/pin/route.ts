import { fail, guard, ok } from '@/lib/server/respond'
import { boardClosed } from '@/lib/server/boardGate'
import { jsonBody, routeParam } from '@/lib/server/request'
import { setBoardPinned } from '@/lib/server/queries/boards'

/**
 * POST /api/boards/{boardId}/pin — 글 상단 고정/해제 (관리자만).
 *
 * 2026-09-25 사장님 「관리자 권한으로 아무글이나 상단 고정하고 내릴 수 있게 해줘」.
 * 권한 검사는 `setBoardPinned` 안(`isAdmin`)에서 한다. 몸체는 `{ pinned: boolean }`.
 */
type Context = { params: Promise<Record<string, string>> }

export async function POST(request: Request, context: Context) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 길 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const boardId = await routeParam(context, 'boardId')
    const result = await setBoardPinned(boardId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
