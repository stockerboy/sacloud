import { NextResponse } from 'next/server'
import { SUCCESS_MESSAGE, type CursorMetadata } from '@sacloud/contract'

/**
 * 실제 API의 공통 응답 래퍼.
 *
 * Mock(MSW)과 **완전히 같은 형태**여야 한다. 계약(`packages/contract`)이 두 구현의
 * 공통 상위이고, 클라이언트는 응답을 계약 스키마로 파싱하므로 형태가 어긋나면
 * 화면이 아니라 파싱 단계에서 먼저 터진다.
 *
 *   { "message": "success", "data": ..., "metadata": { "cursor": {...} } }
 */

export function ok<T>(data: T, metadata?: { cursor: CursorMetadata }) {
  return NextResponse.json({ message: SUCCESS_MESSAGE, data, ...(metadata ? { metadata } : {}) })
}

export function okPage<T>(page: { items: T[]; cursor: CursorMetadata }) {
  return NextResponse.json({
    message: SUCCESS_MESSAGE,
    data: page.items,
    metadata: { cursor: page.cursor },
  })
}

/** 에러 응답. 원본 에러 포맷은 [미확인] — 계약의 `ErrorResponse` 형태로 확정했다. */
export function fail(status: number, message: string, errors?: Record<string, string[]>) {
  return NextResponse.json({ message, data: null, ...(errors ? { errors } : {}) }, { status })
}

export const notFound = (message = '찾을 수 없습니다') => fail(404, message)
export const badRequest = (message = '잘못된 요청입니다', errors?: Record<string, string[]>) =>
  fail(400, message, errors)
export const unauthorized = (message = '로그인이 필요합니다') => fail(401, message)
export const forbidden = (message = '권한이 없습니다') => fail(403, message)
export const tooManyRequests = (message = '잠시 후 다시 시도해주세요') => fail(429, message)

/**
 * Route Handler 공통 예외 처리.
 *
 * 처리하지 못한 예외를 그대로 흘리면 Next가 HTML 오류 페이지를 반환하고,
 * 클라이언트의 `response.json()`이 엉뚱한 곳에서 깨진다. 항상 계약 형태로 답한다.
 */
export async function guard(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler()
  } catch (error) {
    console.error('[api]', error)
    return fail(500, '서버 오류가 발생했습니다')
  }
}
