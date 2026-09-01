import { prisma } from '@sacloud/db'
import { currentUserId } from '../session'

/**
 * 리그 관리 권한.
 *
 * 원본에서 관측된 것은 "리그 관리자만 관리 화면에 들어갈 수 있다"는 동작이다.
 * 관리자가 리그 소유자 한 명인지, 위임이 가능한지는 `[미확인]`이다.
 * 여기서는 **리그 소유자(`League.ownerUserId`)** 만 관리자로 본다.
 * 운영자(`role === 2`)도 통과시킨다 — 관리자 시스템은 V1 범위로 승격됐다(CLAUDE.md 3-A).
 */

export type AdminCheck =
  | { ok: true; leagueId: string; userId: string }
  | { ok: false; reason: 'unauthorized' | 'forbidden' | 'notFound' }

export async function requireLeagueAdmin(
  request: Request,
  leagueSlug: string,
): Promise<AdminCheck> {
  const userId = await currentUserId(request)
  if (!userId) return { ok: false, reason: 'unauthorized' }

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, ownerUserId: true },
  })
  if (!league) return { ok: false, reason: 'notFound' }

  if (league.ownerUserId === userId) return { ok: true, leagueId: league.id, userId }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role === 2) return { ok: true, leagueId: league.id, userId }

  return { ok: false, reason: 'forbidden' }
}

/**
 * 되돌릴 수 없는 조치를 감사 로그에 남긴다.
 * 추방·삭제·승계처럼 취소가 안 되는 동작은 "누가 언제 했는지"가 남아야 한다.
 */
export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  detail?: Record<string, string | number | boolean | null>,
) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, ...(detail ? { detail } : {}) },
  })
}

/**
 * 넥슨 병영수첩 클랜 주소에서 슬러그를 뽑는다.
 * 예: `https://barracks.sa.nexon.com/clan/{clanSlug}/clanMatch`
 *
 * ── 2026-09-01 (D-254): **규칙 자체는 `@sacloud/contract` 로 옮겼다.**
 *   통합검색(`search.ts`)도 같은 주소를 받아야 하는데, 규칙이 이 파일 안에만 있어서
 *   리그 관리 화면에서는 되고 검색창에서는 안 되는 상태였다.
 *   여기서는 **이름만 다시 내보낸다** — 이 파일을 부르던 곳(`clan_lookup`)은 그대로다.
 */
export { clanSlugFromBarracksUrl } from '@sacloud/contract'
