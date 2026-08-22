import { prisma, type Prisma } from '@sacloud/db'

/**
 * 운영자 변경 이력 (Phase 10 · 정책 23).
 *
 * 누가·언제·무엇을·이전 값·바뀐 값을 남긴다.
 * 되돌릴 수 있어야 하고, "누가 바꿨는지 모르겠다"가 나오면 안 되기 때문이다.
 */
export async function writeAudit(input: {
  user: { id: string; email: string }
  action: string
  targetType: string
  targetId: string
  before?: unknown
  after?: unknown
  note?: string
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      userId: input.user.id,
      userEmail: input.user.email,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      note: input.note,
    },
  })
}

/** 최근 변경 이력 (관리자 대시보드용) */
export async function recentAudit(limit = 20) {
  return prisma.adminAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      userEmail: true,
      action: true,
      targetType: true,
      targetId: true,
      note: true,
      createdAt: true,
    },
  })
}
