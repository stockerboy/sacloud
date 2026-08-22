import { badRequest, forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { addRosterMember, endRosterMember, setRosterVerified } from '@sacloud/db/ops'

/**
 * POST /api/admin/roster — 로스터에 선수 추가.
 *
 * 로스터는 "이 선수가 출전했다"는 증거가 **아니다**. 확인해야 할 후보 목록이다 (D-068).
 * 실제 출전은 넥슨 관측·상세로만 확인한다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const body = (await jsonBody(request)) as {
      leagueSlug?: string
      clanSlug?: string
      playerId?: string
      joinedAt?: string
      verified?: boolean
    }
    if (!body.leagueSlug || !body.clanSlug || !body.playerId) {
      return badRequest('leagueSlug · clanSlug · playerId가 필요합니다')
    }
    const joinedAt = body.joinedAt ? new Date(body.joinedAt) : new Date()
    if (Number.isNaN(joinedAt.getTime())) return badRequest('joinedAt 날짜를 해석할 수 없습니다')

    try {
      const created = await addRosterMember({
        leagueSlug: body.leagueSlug,
        clanSlug: body.clanSlug,
        playerId: body.playerId,
        joinedAt,
        verified: body.verified,
      })
      if (!created) return notFound('리그 또는 클랜을 찾을 수 없습니다')
      await writeAudit({
        user: admin,
        action: 'roster.add',
        targetType: 'roster',
        targetId: created.id,
        after: created,
        note: `${body.clanSlug} / ${body.leagueSlug}`,
      })
      return ok(created)
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : '추가할 수 없습니다')
    }
  })
}

/**
 * PATCH /api/admin/roster — 확인 상태 변경 또는 로스터 종료.
 *
 * 로스터에서 뺄 때 **행을 지우지 않고 `leftAt`을 찍는다.**
 * 과거 경기의 소속 판정은 그 시점 기록으로 해야 하므로, 지우면 과거가 바뀐다.
 */
export async function PATCH(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const body = (await jsonBody(request)) as {
      membershipId?: string
      verified?: boolean
      leftAt?: string | null
    }
    if (!body.membershipId) return badRequest('membershipId가 필요합니다')

    if (body.verified !== undefined) {
      const result = await setRosterVerified({
        membershipId: body.membershipId,
        verified: body.verified,
      })
      if (!result) return notFound('로스터 항목을 찾을 수 없습니다')
      await writeAudit({
        user: admin,
        action: 'roster.verify',
        targetType: 'roster',
        targetId: body.membershipId,
        before: result.before,
        after: result.after,
      })
      return ok(result.after)
    }

    if (body.leftAt !== undefined) {
      const leftAt = body.leftAt ? new Date(body.leftAt) : new Date()
      if (Number.isNaN(leftAt.getTime())) return badRequest('leftAt 날짜를 해석할 수 없습니다')
      const result = await endRosterMember({ membershipId: body.membershipId, leftAt })
      if (!result) return notFound('로스터 항목을 찾을 수 없습니다')
      await writeAudit({
        user: admin,
        action: 'roster.end',
        targetType: 'roster',
        targetId: body.membershipId,
        before: result.before,
        after: result.after,
      })
      return ok(result.after)
    }

    return badRequest('verified 또는 leftAt 중 하나가 필요합니다')
  })
}
