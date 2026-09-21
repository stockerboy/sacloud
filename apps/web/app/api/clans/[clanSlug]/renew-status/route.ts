import { revalidatePath } from 'next/cache'
import { prisma } from '@sacloud/db'

import { guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { renewStatus } from '@/lib/server/queries/renewStatus'

/**
 * GET /api/clans/{clanSlug}/renew-status — ★그 클랜 갱신이 끝났나★
 *
 * 사장님: 「★클랜페이지에도 정보갱신 탭을 만들고 작동하게 해★」
 *
 * 선수 쪽과 같은 규칙이다 — 화면이 1초마다 물어보다가 끝나면
 * ★그 한 쪽 캐시만 털고★ 다시 그린다.
 *
 * ⚠ 큐의 열쇠는 ★클랜 주소(slug)가 아니라 우리 id★ 다 (`nexon:renew:clan:<id>`).
 *   여기서 한 번 바꿔 준다.
 */
export const dynamic = 'force-dynamic'

function safePath(path: string | null): string | null {
  if (path === null) return null
  if (!path.startsWith('/league/') && !path.startsWith('/clan/')) return null
  if (path.includes('://') || path.includes('..')) return null
  return path.split('?')[0] ?? null
}

export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
    /* 클랜을 모르면 ★기다리게 두지 않는다★ — 끝난 것으로 답한다 */
    if (clan === null) return ok({ phase: 'done' as const, attempts: 0, why: null })

    const status = await renewStatus({ kind: 'clan', id: clan.id })
    if (status.phase === 'done' || status.phase === 'failed') {
      const path = safePath(new URL(request.url).searchParams.get('path'))
      if (path !== null) revalidatePath(path, 'layout')
    }
    return ok(status)
  })
}
