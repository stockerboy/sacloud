import { prisma } from '@sacloud/db'
import { LeagueCreateInput } from '@sacloud/contract'
import { badRequest, forbidden, guard, ok, okPage, unauthorized } from '@/lib/server/respond'
import { jsonBody, pageParams } from '@/lib/server/request'
import { getLeague, listLeagues } from '@/lib/server/queries/leagues'
import { currentUserId } from '@/lib/server/session'
import { currentSeasonNumber } from '@/lib/server/configs'
import { audit } from '@/lib/server/queries/leagueAdmin'

/** GET /api/leagues — 리그 목록 (커서) */
export async function GET(request: Request) {
  return guard(async () => {
    const { cursor, size } = pageParams(request)
    return okPage(await listLeagues(cursor, size))
  })
}

/**
 * POST /api/leagues — 리그 만들기
 *
 * 관측된 제약을 서버에서도 다시 강제한다 (계약 `LeagueCreateInput`이 그대로 담고 있다).
 * - 리그 이름 한글/영어/숫자 2~8자, `리그`로 끝날 수 없음
 * - 영문이름(슬러그) 영숫자 4~16자, 중복 불가
 * - 리그맵·대전인원 각각 1개 이상
 * - 동의 3항목 필수
 *
 * **서든어택 계정 연동이 되어 있어야 만들 수 있다**(관측).
 * 화면(`AuthGuard requireLinked`)에서도 막지만, API를 직접 호출하면 우회되므로 여기서도 본다.
 *
 * 캡차(`captcha_token`)는 계약대로 받지만 아직 실연동하지 않았다 (Phase 7 뒷부분).
 */
export async function POST(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const link = await prisma.userPlayerLink.findUnique({
      where: { userId },
      select: { playerId: true },
    })
    if (!link) return forbidden('서든어택 계정을 연동해야 리그를 만들 수 있습니다')

    const parsed = LeagueCreateInput.safeParse(await jsonBody(request))
    if (!parsed.success) {
      return badRequest('입력값을 확인해주세요', parsed.error.flatten().fieldErrors as Record<string, string[]>)
    }
    const input = parsed.data

    const taken = await prisma.league.findUnique({ where: { slug: input.slug }, select: { id: true } })
    if (taken) return badRequest('이미 사용 중인 영문이름입니다', { slug: ['이미 사용 중인 영문이름입니다'] })

    const maps = await prisma.gameMap.findMany({
      where: { id: { in: input.map_ids } },
      select: { id: true },
    })
    if (maps.length !== input.map_ids.length) return badRequest('존재하지 않는 리그맵이 있습니다')

    /**
     * 새 리그의 시작 시즌.
     *
     * 시즌 번호는 서비스 전체가 공유하는 하나의 선으로 보인다
     * (`/infos`가 전역 `CURRENT_SEASON` 하나만 내려주고, 픽스처의 모든 리그가 같은 값을 쓴다).
     * 그래서 새 리그도 **현재 시즌 번호**로 시작한다.
     * 원본이 새 리그를 시즌 1부터 시작시키는지는 `[미확인]`이다.
     */
    const season = await currentSeasonNumber()

    const league = await prisma.$transaction(async (tx) => {
      const created = await tx.league.create({
        data: {
          slug: input.slug,
          name: input.name,
          ownerUserId: userId,
          divisionCount: input.division_count,
          // 공식 리그 배지는 운영자만 붙인다. 사용자가 만든 리그는 항상 false.
          official: false,
          maps: { create: input.map_ids.map((mapId) => ({ mapId })) },
          playerLimits: {
            create: input.player_limits.map((playerCount) => ({ playerCount })),
          },
        },
      })
      await tx.season.create({
        data: {
          leagueId: created.id,
          number: season,
          startedAt: new Date(),
          status: 'active',
        },
      })
      return created
    })

    await audit(userId, 'league.create', 'league', league.id, { slug: league.slug })

    const detail = await getLeague(league.slug)
    return detail ? ok(detail) : badRequest('리그를 만들지 못했습니다')
  })
}
