import { prisma } from '@sacloud/db'
import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { todayHeatedMatch } from '@/lib/server/queries/todayHeatedMatch'

export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 30, async () => {
    const slug = await routeParam(context, 'league')
    const league = await prisma.league.findFirst({ where: { slug }, select: { id: true } })
    if (league === null) return notFound('리그를 찾을 수 없습니다')
    const match = await todayHeatedMatch(league.id)
    return okPublic({ match })
  })
}
