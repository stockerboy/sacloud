import { prisma } from '@sacloud/db'
import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'

/**
 * 관리자가 **알을 직접 깨거나 되돌린다** (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * ```
 * POST   /api/admin/eggs/clan/<clanSlug>     깬다
 * DELETE /api/admin/eggs/clan/<clanSlug>     되돌린다 (다시 잠긴다)
 * POST   /api/admin/eggs/player/<playerId>
 * ```
 *
 * ── 왜 필요한가
 *   정상 경로는 «본인 인증 → 알이 깨진다» 인데 그 인증(칭호 인증 · 사양 4장)이 아직 없다.
 *   그리고 사용자가 게임에 못 들어가는 상황에서도 화면을 확인해야 한다.
 *
 * ── ⚠ 이건 **시험용이다. 진짜 근거가 아니다**
 *   `reason='admin'` 으로 남겨서 나중에 «인증으로 깬 것» 과 구분할 수 있게 한다.
 *   인증 체계가 들어오면 이 기록만 골라 지우면 된다.
 *
 * ── 되돌릴 수 있다
 *   `DELETE` 하면 기록이 지워지고 알이 다시 잠긴다. 시험 삼아 깨 보고 되돌릴 수 있어야 한다.
 */

const KINDS = ['clan', 'player'] as const
type Kind = (typeof KINDS)[number]

function parseKind(value: string): Kind | null {
  return (KINDS as readonly string[]).includes(value) ? (value as Kind) : null
}

/** 대상이 실제로 있는지 본다 — 없는 것을 깨 두면 조용한 쓰레기가 된다 */
async function targetExists(kind: Kind, targetId: string): Promise<boolean> {
  if (kind === 'clan') {
    return (await prisma.clan.count({ where: { slug: targetId } })) > 0
  }
  return (await prisma.player.count({ where: { id: targetId } })) > 0
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string; targetId: string }> },
) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const { kind: rawKind, targetId } = await params
    const kind = parseKind(rawKind)
    if (!kind) return badRequest('kind 는 clan 또는 player 여야 합니다')
    if (!targetId?.trim()) return badRequest('대상이 없습니다')

    if (!(await targetExists(kind, targetId))) {
      return badRequest(`그런 ${kind === 'clan' ? '클랜' : '선수'}이 없습니다`)
    }

    const body = ((await jsonBody(request).catch(() => ({}))) ?? {}) as { note?: string }

    const row = await prisma.eggBreak.upsert({
      where: { targetKind_targetId: { targetKind: kind, targetId } },
      create: {
        targetKind: kind,
        targetId,
        reason: 'admin',
        brokenByUserId: admin.id,
        note: body.note?.trim() || null,
      },
      /* 이미 깨져 있으면 사유를 덮지 않는다 — 인증으로 깬 것을 관리자 기록으로 바꾸면 안 된다 */
      update: {},
      select: { targetKind: true, targetId: true, reason: true, brokenAt: true, note: true },
    })

    await writeAudit({
      user: admin,
      action: 'egg.break',
      targetType: kind,
      targetId,
      after: row,
      note: body.note?.trim(),
    })

    return ok({ broken: true, ...row, brokenAt: row.brokenAt.toISOString() })
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ kind: string; targetId: string }> },
) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const { kind: rawKind, targetId } = await params
    const kind = parseKind(rawKind)
    if (!kind) return badRequest('kind 는 clan 또는 player 여야 합니다')

    const before = await prisma.eggBreak.findUnique({
      where: { targetKind_targetId: { targetKind: kind, targetId } },
      select: { reason: true, brokenAt: true },
    })
    if (!before) return ok({ broken: false, alreadySealed: true })

    await prisma.eggBreak.delete({
      where: { targetKind_targetId: { targetKind: kind, targetId } },
    })
    await writeAudit({ user: admin, action: 'egg.seal', targetType: kind, targetId, before })

    return ok({ broken: false })
  })
}
