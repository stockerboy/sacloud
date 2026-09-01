import { prisma, type Prisma } from '@sacloud/db'

/**
 * 감사 로그에 남길 **행위자 표기**.
 *
 * `AdminAuditLog.userEmail` 은 NOT NULL 인데 `User.email` 은 선택이 됐다 (D-252 · 아이디 가입).
 * **가짜 이메일을 지어내지 않는다** — 이메일이 없으면 계정 id 를 그대로 적는다.
 * 신원을 가리키는 값이라는 점은 같고, 뒤에 이메일 규칙이 또 바뀌어도 이 줄은 옳다.
 * 빈 문자열(`?? ''`)로 때우면 감사 로그에 「누가 바꿨는지 모르겠다」가 남는다.
 */
export function auditActor(user: { id: string; email: string | null }): string {
  return user.email ?? user.id
}

/**
 * 운영자 변경 이력 (Phase 10 · 정책 23).
 *
 * 누가·언제·무엇을·이전 값·바뀐 값을 남긴다.
 * 되돌릴 수 있어야 하고, "누가 바꿨는지 모르겠다"가 나오면 안 되기 때문이다.
 */
export async function writeAudit(input: {
  user: { id: string; email: string | null }
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
      userEmail: auditActor(input.user),
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
