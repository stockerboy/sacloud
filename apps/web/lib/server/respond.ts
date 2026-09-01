import { NextResponse } from 'next/server'
import { SUCCESS_MESSAGE, type CursorMetadata } from '@sacloud/contract'
import { lastKnownGood } from './lastKnownGood'

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

/**
 * **기억해 둔 값이 있으면 오래 기다리지 않는다** (2026-09-01 · D-249).
 *
 * ── 왜
 *   DB 가 눌려 있을 때 요청은 `pool_timeout` 을 다 쓰고 죽는다. 실측 **20초**다.
 *   그동안 사용자는 빈 화면에 동그라미만 본다. 20초를 기다린 끝에 오류를 보는 것은
 *   **6초 만에 조금 낡은 값을 보는 것보다 훨씬 나쁘다.**
 *
 * ── ⚠ 기억이 없으면 **끝까지 기다린다**
 *   짧게 끊는 것이 항상 옳지는 않다. 실측에서 30~38초 걸려 **결국 성공한** 요청들이 있었다.
 *   내줄 것이 없는데 일찍 끊으면 그 성공을 실패로 바꾸는 셈이고, **엣지 캐시도 못 채운다**
 *   (그러면 다음 사람도 똑같이 당한다 — D-249 ②의 악순환).
 *   그래서 «내줄 것이 있을 때만» 빨리 포기한다.
 *
 * ── ⚠ 이것은 질의를 취소하지 않는다
 *   먼저 응답할 뿐, 뒤에서 도는 질의는 계속 커넥션을 쥐고 있다.
 *   즉 **DB 부하를 줄이지는 못한다.** 줄이는 것은 엣지 캐시의 몫이고, 이것은
 *   **사용자가 기다리는 시간**만 줄인다. 둘을 섞어서 판단하지 마라.
 */
const STALE_RACE_SECONDS = 6

type Raced = { response: Response; stale: boolean }

async function raceAgainstStale(
  cacheKey: string,
  maxStaleSeconds: number,
  handler: () => Promise<Response>,
): Promise<Raced> {
  const remembered = lastKnownGood.recall(cacheKey, maxStaleSeconds)
  const live = handler()

  /* 내줄 것이 없으면 경주하지 않는다 — 끝까지 기다리는 편이 낫다 (위 주석) */
  if (!remembered) return { response: await live, stale: false }

  let timer: ReturnType<typeof setTimeout> | undefined
  const giveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), STALE_RACE_SECONDS * 1000)
  })

  try {
    const won = await Promise.race([live, giveUp])
    if (won) return { response: won, stale: false }
  } finally {
    if (timer) clearTimeout(timer)
  }

  /*
   * ── 진 뒤에도 **결과는 주워 담는다** (2026-09-01)
   *
   *   처음에는 `live.catch(() => {})` 로 실패만 삼키고 끝냈다. 그런데 그러면
   *   **늦게 성공한 값을 기억하지 않는다.** DB 가 계속 6초보다 느리면 기억값이
   *   한 번도 갱신되지 않은 채 낡아 가고, `maxStaleSeconds` 를 넘는 순간부터
   *   **다시 500 이 난다.** 보험이 스스로 만료되는 셈이다.
   *
   *   이 요청의 응답은 이미 정해졌지만, 그 결과를 버릴 이유는 없다.
   *   늦게라도 성공하면 기억을 갱신해 **다음 사람**이 그 값을 받게 한다.
   *
   *   실패는 계속 삼킨다 — 삼키지 않으면 unhandled rejection 이 되고,
   *   실패 자체는 아래 로그와 `guard` 가 이미 남긴다.
   */
  void live
    .then(async (late) => {
      if (late.ok) lastKnownGood.remember(cacheKey, await late.clone().text())
    })
    .catch(() => {})

  console.error(
    `[api] slow-db ${cacheKey} — ${STALE_RACE_SECONDS}초를 넘겨 ` +
      `${Math.round(remembered.ageSeconds)}초 낡은 값을 대신 내준다`,
  )

  return { response: staleResponse(remembered), stale: true }
}

/** 기억해 둔 본문으로 200 을 만든다. 위 경주와 아래 `catch` 가 같은 모양을 쓰게 한다 */
function staleResponse(remembered: { body: string; ageSeconds: number }): Response {
  return new NextResponse(remembered.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      /* **짧게 캐시한다.** 낡은 값을 엣지가 오래 붙들면 회복이 늦어진다.
         다음 요청이 곧 DB 를 다시 두드려 보게 한다 */
      'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=300',
      /* 운영에서 「지금 보험으로 버티는 중인가」를 밖에서 볼 수 있어야 한다 */
      'X-Sacloud-Stale': String(Math.round(remembered.ageSeconds)),
    },
  })
}

/**
 * **공개 읽기 전용 `guard`** — DB 가 안 되면 마지막으로 성공한 응답을 대신 내준다
 * (2026-09-01 · D-249).
 *
 * ── 왜 `guard` 를 따로 두나
 *   `guard` 는 실패를 **500 으로 정직하게** 바꾼다. 그건 쓰기·로그인 경로에서 옳다 —
 *   저장이 안 됐는데 됐다고 하면 안 된다. 그런데 **공개 읽기**는 사정이 다르다.
 *   화면이 통째로 비는 것보다 **몇 분 낡은 값**이 사용자에게 훨씬 낫다.
 *
 * ── 언제 쓰나
 *   `okPublic` / `okPagePublic` 을 내보내는 경로에만 쓴다.
 *   `/api/me/*` · `/api/admin/*` · 쓰기 경로에는 **쓰지 않는다** — 남의 값이 섞여 나간다.
 *
 * ── 실패했는데 기억도 없으면
 *   원래대로 **500** 이다. 없는 값을 지어내지 않는다 (CLAUDE.md 3장 7번).
 *
 * @param key             기억 칸 이름. **요청마다 달라지는 것을 전부 담아야 한다**
 *                        (리그 slug · 커서 · 정렬). 안 담으면 다른 요청의 답이 나간다.
 *                        `Request` 를 그대로 주면 **경로+질의문자열**을 키로 쓴다 —
 *                        그게 「이 요청이 무엇을 물었나」의 완전한 표현이라 가장 안전하다.
 *                        `request` 를 안 받는 경로만 문자열을 직접 준다
 * @param maxStaleSeconds 이 초를 넘게 낡았으면 내주지 않고 500 으로 간다
 */
export async function guardPublic(
  key: string | Request,
  maxStaleSeconds: number,
  handler: () => Promise<Response>,
): Promise<Response> {
  const cacheKey = typeof key === 'string' ? key : new URL(key.url).pathname + new URL(key.url).search
  try {
    const raced = await raceAgainstStale(cacheKey, maxStaleSeconds, handler)
    if (raced.stale) return raced.response
    // 2xx 만 기억한다. 404 를 기억하면 새로 생긴 클랜이 계속 «없음» 이 된다
    if (raced.response.ok) lastKnownGood.remember(cacheKey, await raced.response.clone().text())
    return raced.response
  } catch (error) {
    const remembered = lastKnownGood.recall(cacheKey, maxStaleSeconds)
    if (!remembered) {
      console.error('[api]', error)
      return fail(500, '서버 오류가 발생했습니다')
    }

    // 삼키면 「조용히 낡은 값을 내주는」 상태가 눈에 안 띈다. 반드시 남긴다
    console.error(`[api] last-known-good ${cacheKey} (${Math.round(remembered.ageSeconds)}초 낡음)`, error)

    return staleResponse(remembered)
  }
}
