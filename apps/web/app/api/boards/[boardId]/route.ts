import { fail, guard, notFound, ok } from '@/lib/server/respond'
import { boardClosed } from '@/lib/server/boardGate'
import { jsonBody, routeParam } from '@/lib/server/request'
import { deleteBoard, getBoard, updateBoard } from '@/lib/server/queries/boards'

/**
 * GET    /api/boards/{boardId} — 글 상세 (조회수 증가)
 * PUT    /api/boards/{boardId} — 글 수정
 * DELETE /api/boards/{boardId} — 글 삭제 (soft delete)
 *
 * 수정/삭제 권한은 로그인 글이면 작성자 본인, 비로그인 글이면 작성 시 정한 비밀번호다.
 */
type Context = { params: Promise<Record<string, string>> }

export async function GET(request: Request, context: Context) {
  return guard(async () => {
    const board = await getBoard(await routeParam(context, 'boardId'), request)
    return board ? ok(board) : notFound('글을 찾을 수 없습니다')
  })
}

export async function PUT(request: Request, context: Context) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const boardId = await routeParam(context, 'boardId')
    const result = await updateBoard(boardId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}

export async function DELETE(request: Request, context: Context) {
  return guard(async () => {
    /* 게시판이 닫혀 있으면 여기서 막는다 (O-011) — 쓰기 일곱 곳 전부에 있어야 한다 */
    const closed = boardClosed()
    if (closed) return closed
    const boardId = await routeParam(context, 'boardId')
    const result = await deleteBoard(boardId, request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
