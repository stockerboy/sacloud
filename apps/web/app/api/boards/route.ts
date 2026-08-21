import { PAGE_SIZE } from '@sacloud/contract'
import { fail, guard, ok, okPage } from '@/lib/server/respond'
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
  return guard(async () => {
    const { cursor, size } = pageParams(request, PAGE_SIZE.BOARD)
    const page = await listBoards({
      // Mock 핸들러와 같은 기본값
      category: query(request, 'category') ?? 'free',
      cursor,
      size,
      type: query(request, 'type'),
      q: query(request, 'q'),
    })
    return okPage(page)
  })
}

export async function POST(request: Request) {
  return guard(async () => {
    const result = await createBoard(request, await jsonBody(request))
    return result.ok ? ok(result.value) : fail(result.status, result.message)
  })
}
