import { prisma } from '@sacloud/db'
import { ok, guard } from '@/lib/server/respond'
import { buildConfigs } from '@/lib/server/configs'
import { currentUser } from '@/lib/server/session'
import { toUser } from '@/lib/server/mappers'
import { hidesSeedData } from '@/lib/server/queries/publicScope'

/**
 * 시드 픽스처가 만든 리그 게시판 카테고리.
 * 그 리그들이 공개 목록에서 빠지면 게시판 탭만 남아 죽은 링크가 된다.
 */
const SEED_BOARD_CATEGORIES = ['officialmain', 'secondline', 'friendly01'] as const

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
      // 시드가 만든 리그 카테고리(존재하지 않는 리그의 게시판 탭)는 내보내지 않는다 (D-116)
      prisma.boardCategory.findMany({
        where: hidesSeedData()
          ? { NOT: { slug: { in: [...SEED_BOARD_CATEGORIES] } } }
          : undefined,
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
