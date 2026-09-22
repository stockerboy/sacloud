import { prisma } from '@sacloud/db'
import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { todayStreaks } from '@/lib/server/queries/todayStreaks'

/**
 * GET /api/leagues/{league}/today-streaks — ★오늘의 최다연승·최다연패★ (2026-09-22 사장님).
 *
 * 창은 「오늘의 상대전적」과 ★같은 것★ 이고, 캐시도 ★같은 30초★ 다 —
 * 두 카드가 한 화면에 있는데 갱신 간격이 다르면 ★서로 다른 「오늘」★ 을 말하게 된다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 30, async () => {
    const slug = await routeParam(context, 'league')
    const league = await prisma.league.findFirst({ where: { slug }, select: { id: true } })
    if (league === null) return notFound('리그를 찾을 수 없습니다')
    return okPublic(await todayStreaks(league.id))
  })
}
