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

/**
 * **공개 읽기 응답 — CDN 이 대신 답하게 한다** (2026-09-01 · D-223).
 *
 * ── 왜
 *   이 응답들은 **로그인과 무관하다.** 같은 주소면 누구에게나 같은 값이다.
 *   그런데 지금은 방문자마다 함수를 깨우고 DB 를 때린다. 클랜 상세가 운영에서
 *   1.2~1.7초였고, 함수가 식어 있으면 **첫 요청이 10초**였다.
 *   엣지가 대신 답하면 둘 다 사라진다 — 함수를 아예 안 깨우기 때문이다.
 *
 * ── 무엇을 붙이나
 *   `s-maxage` 는 **공유 캐시(엣지)만** 본다. `max-age=0` 이라 **사용자 브라우저는
 *   캐시하지 않는다** — 방금 뭔가 한 사람이 옛 화면을 보는 일이 없어야 한다.
 *   `stale-while-revalidate` 는 만료된 값을 일단 내주고 뒤에서 새로 받아 온다.
 *   그래서 만료 직후 한 명이 느린 응답을 뒤집어쓰는 일이 없다.
 *
 * ── ⚠ **세션을 읽는 응답에는 절대 쓰지 않는다**
 *   엣지 캐시는 쿠키를 구분하지 않는다. 남의 로그인 상태가 섞여 나간다.
 *   `/api/infos`(로그인 사용자를 담는다) · `/api/me/*` · `/api/admin/*` 는 대상이 아니다.
 *   그리고 **알 목록(`/api/eggs/broken`)도 아니다** — 방금 깬 알이 안 보이면
 *   사용자는 「안 깨졌다」 로 읽는다 (D-222 ⑤).
 */
/**
 * ⚠ **30 → 300 (2026-09-01 · D-240).** 위 서술은 그대로 두고 여기에 이유를 단다.
 *
 * ── 왜 열 배로 늘렸나
 *   사이트와 **수집 잡이 같은 DB 한 대**를 쓴다. 수집 체인이 거의 쉬지 않아서
 *   그동안 사이트가 DB 를 못 쓰고 500 이 났다 (D-239 · D-240).
 *   접속 통로를 늘리는 길은 막혔다 — 늘렸더니 Supabase 풀러가 먼저 무너졌다.
 *
 *   **그러면 DB 를 덜 때리는 수밖에 없다.** 이 응답들은 로그인과 무관하고 같은 주소면
 *   누구에게나 같다. 엣지가 5분 동안 대신 답하면 그 5분간 DB 를 **한 번만** 때린다.
 *   30초일 때보다 DB 접근이 열 배 준다.
 *
 * ── 무엇을 잃나 — **최대 5분의 지연**
 *   방금 끝난 경기가 랭킹에 5분 늦게 반영될 수 있다. 전적 사이트에서 이건
 *   견딜 만한 값이라고 판단했다. **실시간이 필요한 것에는 이 헬퍼를 쓰지 않는다** —
 *   알 목록(`/api/eggs/broken`)이 이미 그렇게 빠져 있다.
 *
 * ── `stale-while-revalidate` 도 300 → 600
 *   만료 뒤에도 10분까지는 **옛 값을 즉시 내주고** 뒤에서 새로 받는다.
 *   DB 가 수집에 눌려 느린 순간에도 사용자는 빈 화면 대신 조금 낡은 값을 본다.
 *   **이게 「흔들리지 않는다」의 실체다.**
 *
 * ⚠ 이 값은 실측으로 다시 정해야 한다. 지금은 「30초는 너무 짧다」까지만 안다.
 */
const PUBLIC_CACHE_SECONDS = 300

/** 만료된 값을 그대로 내주면서 뒤에서 갱신하는 창 */
const PUBLIC_STALE_SECONDS = 86400

function withPublicCache(response: NextResponse, seconds: number): NextResponse {
  response.headers.set(
    'Cache-Control',
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`,
  )
  return response
}

/** 공개 단건 응답 (`ok` 과 같고 캐시 머리말만 붙는다) */
export function okPublic<T>(
  data: T,
  metadata?: { cursor: CursorMetadata },
  seconds = PUBLIC_CACHE_SECONDS,
) {
  return withPublicCache(ok(data, metadata), seconds)
}

/** 공개 목록 응답 (`okPage` 과 같고 캐시 머리말만 붙는다) */
export function okPagePublic<T>(
  page: { items: T[]; cursor: CursorMetadata },
  seconds = PUBLIC_CACHE_SECONDS,
) {
  return withPublicCache(okPage(page), seconds)
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
/**
 * 429 — 시도 제한.
 *
 * `Retry-After`(초)를 함께 내려 준다. 클라이언트가 언제 다시 시도할지 알 수 있어야
 * 무작정 반복하지 않는다. **얼마나 남았는지 외에는 아무것도 알려주지 않는다** —
 * 어떤 계정이 존재하는지, 몇 번 틀렸는지는 응답에 담지 않는다.
 */
export function tooManyRequests(message = '잠시 후 다시 시도해주세요', retryAfterSeconds?: number) {
  const response = fail(429, message)
  if (retryAfterSeconds !== undefined) {
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterSeconds))))
  }
  return response
}

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
