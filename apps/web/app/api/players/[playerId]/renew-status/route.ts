import { revalidatePath } from 'next/cache'

import { guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { renewStatus } from '@/lib/server/queries/renewStatus'

/**
 * GET /api/players/{playerId}/renew-status — ★그 갱신이 끝났나★
 *
 * 화면이 1초마다 물어보다가 `done` 이 되면 페이지를 다시 읽는다.
 *
 * ── ⚠ ★캐시를 같이 털어 준다★ (2026-09-22)
 *
 *   선수 화면은 `revalidate = 60` 이다. 그냥 다시 읽으면 ★60초 동안 옛 화면★ 이
 *   그대로 온다 — 사장님이 보신 「되는 척」 의 나머지 절반이 이것이다.
 *   그래서 ★끝난 그 순간 그 한 쪽만★ 털어 준다.
 *
 *   ⚠ ★그 한 쪽만★ 턴다. 라우트 전체(`type: 'page'`)를 털면 선수 화면 캐시가
 *     통째로 날아가 DB 가 한꺼번에 얻어맞는다.
 *   ⚠ ★우리 화면 주소만 받는다★ — 밖에서 아무 주소나 넣어 캐시를 털지 못하게.
 */
export const dynamic = 'force-dynamic'

/** 털어도 되는 주소인가 — 우리 화면만 */
function safePath(path: string | null): string | null {
  if (path === null) return null
  if (!path.startsWith('/league/') && !path.startsWith('/player/')) return null
  /* 바깥 주소·되돌아가기 수작을 막는다 */
  if (path.includes('://') || path.includes('..')) return null
  return path.split('?')[0] ?? null
}

export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')
    const status = await renewStatus({ kind: 'player', id: playerId })

    if (status.phase === 'done' || status.phase === 'failed') {
      const path = safePath(new URL(request.url).searchParams.get('path'))
      if (path !== null) {
        /* 그 화면 한 쪽만 — 안쪽 탭까지 같이 새로 그려지도록 layout 으로 턴다 */
        revalidatePath(path, 'layout')
      }
    }
    return ok(status)
  })
}
