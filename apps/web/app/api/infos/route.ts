import { prisma } from '@sacloud/db'
import { ok, guard } from '@/lib/server/respond'
import { buildConfigs } from '@/lib/server/configs'
import { currentUser } from '@/lib/server/session'
import { toUser } from '@/lib/server/mappers'

/**
 * GET /api/infos — 부트스트랩 응답.
 *
 * 앱이 처음 뜰 때 한 번 호출해 설정·게시판 카테고리·로그인 사용자를 받아온다.
 * Mock에서는 개발용 세션 스위치가 사용자를 정했지만, 여기서는 **실제 세션**을 본다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const [configs, categories, user] = await Promise.all([
      buildConfigs(),
      prisma.boardCategory.findMany({
        orderBy: { order: 'asc' },
        select: { slug: true, name: true, notice: true, order: true },
      }),
      currentUser(request),
    ])

    return ok({
      configs,
      categories,
      user: user ? toUser(user) : null,
    })
  })
}
