import { prisma } from '@sacloud/db'
import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { todayTopMatchup } from '@/lib/server/queries/todayTopMatchup'

/**
 * GET /api/leagues/{league}/today-matchup — ★오늘의 상대전적★ (2026-09-22 사장님).
 *
 *   «매일 특정 시간 구간 동안 등록된 클랜끼리 서로 가장 많은 경기를 치른 매치업 1개를
 *     자동으로 찾아 클랜랭킹 상단에 실시간 상대전적으로 보여준다»
 *
 * ── ★고정하지 않는다★
 *   부를 때마다 다시 센다. 「오후 3시에 한 번 선정하고 고정하는 방식이 아니다」.
 *
 * ── ★엣지 캐시는 30초★
 *   사장님이 「새로고침 없이 가능하면 실시간으로」 라고 하셨다. 화면이 60초마다 다시
 *   묻는데, 엣지가 10분씩 붙들면 그 사이 들어온 경기가 안 보인다. 30초면
 *   ★화면이 두 번 물을 때 한 번은 새 값★ 이다. 그렇다고 0 으로 두면 경기가 없는
 *   새벽에도 모든 방문이 DB 까지 간다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 30, async () => {
    const slug = await routeParam(context, 'league')
    const league = await prisma.league.findFirst({ where: { slug }, select: { id: true } })
    if (league === null) return notFound('리그를 찾을 수 없습니다')
    const matchup = await todayTopMatchup(league.id)
    return okPublic({ matchup })
  })
}
