/**
 * 서든어택 계정 연동 — **신청과 승인** (D-121).
 *
 * ── 무엇이 문제였나
 *   예전에는 닉네임만 넣으면 그 선수가 곧바로 내 계정에 붙었다.
 *   닉네임은 누구나 볼 수 있으므로, **먼저 입력한 사람이 임자**인 구조였다.
 *   랭킹 상위 선수의 신원을 아무나 선점할 수 있었다.
 *
 * ── 왜 자동 검증을 만들지 않았나
 *   넥슨 Open API에는 사용자가 계정 소유를 증명할 수단이 **없다.**
 *   엔드포인트(`id` `user/basic` `user/rank` `user/tier` `user/recent-info` `match`
 *   `match-detail`)가 전부 닉네임으로 조회하는 **공개 정보**이고, OAuth도 동의 흐름도 없다.
 *   "게임 안에서 무언가를 바꾸고 우리가 읽는다"는 방식도 성립하지 않는다 —
 *   닉네임 변경은 유료·파괴적이고, 클랜 이동은 남에게 영향을 준다.
 *   기다렸다가 남의 활동을 자기 것이라 주장하는 것도 막을 수 없다.
 *
 *   **확인할 수 없는 것을 확인했다고 하지 않는다.** 그럴듯한 절차를 만들어
 *   "인증됨"이라고 표시하면, 없는 보증을 있는 것처럼 파는 셈이다.
 *   그래서 자동 연결을 폐기하고 **운영자가 근거를 보고 승인**하게 했다.
 *
 * ── 안전장치
 *   1. 이미 다른 계정에 연결된 선수는 신청조차 받지 않는다
 *   2. 한 사람에게 열린 신청은 하나뿐이다
 *   3. 승인은 트랜잭션 안에서 하고, 최종 보증은 `UserPlayerLink.playerId` 유니크 제약이다
 *      — 동시에 두 신청이 승인돼도 **DB가 한쪽만 통과시킨다**
 *   4. 승인·거부는 전부 `AdminAuditLog`에 남는다
 */
import { prisma } from '@sacloud/db'

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface ClaimResult {
  ok: boolean
  /** 화면에 그대로 보여 줄 문구. 계정 존재 여부를 흘리지 않는다 */
  message: string
  claimId?: string
}

/** 이미 연결됐는지 — 신청 전에 먼저 막는다 */
async function playerTaken(playerId: string): Promise<boolean> {
  const link = await prisma.userPlayerLink.findUnique({
    where: { playerId },
    select: { userId: true },
  })
  return link !== null
}

/**
 * 연동 신청.
 *
 * **여기서 연결되지 않는다.** 운영자가 승인해야 연결된다.
 */
export async function requestPlayerLink(input: {
  userId: string
  playerName: string
  evidence?: string | null
}): Promise<ClaimResult> {
  const name = input.playerName.trim()
  if (!name) return { ok: false, message: '닉네임을 입력해주세요' }

  // 이미 내 계정에 연결돼 있으면 신청할 것이 없다
  const mine = await prisma.userPlayerLink.findUnique({
    where: { userId: input.userId },
    select: { playerId: true },
  })
  if (mine) return { ok: false, message: '이미 연동된 계정입니다' }

  /* 닉네임은 **정확히 일치**할 때만 찾는다. 유사 검색을 하지 않는다 (D-036).
     시드 선수는 공개 대상이 아니므로 후보에서 제외한다 (D-116). */
  const players = await prisma.player.findMany({
    where: { name, origin: { not: 'mock' } },
    select: { id: true },
    take: 2,
  })
  if (players.length === 0) {
    return { ok: false, message: '해당 닉네임의 플레이어를 찾을 수 없습니다' }
  }
  if (players.length > 1) {
    // 동명이인이 있으면 사람이 봐야 한다. 임의로 고르지 않는다
    return { ok: false, message: '같은 닉네임이 여러 명입니다. 운영자에게 문의해주세요' }
  }
  const playerId = players[0]!.id

  if (await playerTaken(playerId)) {
    return { ok: false, message: '이미 다른 계정에 연동된 플레이어입니다' }
  }

  const openClaim = await prisma.playerLinkClaim.findFirst({
    where: { userId: input.userId, status: 'pending' },
    select: { id: true },
  })
  if (openClaim) {
    return { ok: false, message: '이미 처리 대기 중인 신청이 있습니다' }
  }

  const evidence = (input.evidence ?? '').trim().slice(0, 500) || null

  /* 같은 사람이 같은 선수를 다시 신청하면 기존 행을 되살린다 (유니크 제약이 있다). */
  const claim = await prisma.playerLinkClaim.upsert({
    where: { userId_playerId: { userId: input.userId, playerId } },
    create: { userId: input.userId, playerId, evidence, status: 'pending' },
    update: {
      status: 'pending',
      evidence,
      decidedAt: null,
      decidedByUserId: null,
      decidedByEmail: null,
      decisionNote: null,
    },
    select: { id: true },
  })

  return {
    ok: true,
    claimId: claim.id,
    message: '연동 신청이 접수됐습니다. 운영자 확인 후 연결됩니다',
  }
}

/** 내 신청 취소 */
export async function cancelPlayerLinkClaim(userId: string): Promise<number> {
  const result = await prisma.playerLinkClaim.updateMany({
    where: { userId, status: 'pending' },
    data: { status: 'cancelled', decidedAt: new Date() },
  })
  return result.count
}

export interface DecisionResult {
  ok: boolean
  message: string
}

/**
 * 운영자 승인 — 여기서 **처음으로** 연결이 생긴다.
 *
 * 동시에 두 신청이 같은 선수를 승인받으려 하면 `UserPlayerLink.playerId` 유니크 제약이
 * 한쪽을 떨어뜨린다. 그 실패를 삼키지 않고 그대로 사유로 돌려준다.
 */
export async function approvePlayerLinkClaim(input: {
  claimId: string
  adminUserId: string
  adminEmail: string
  note?: string | null
}): Promise<DecisionResult> {
  const claim = await prisma.playerLinkClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, userId: true, playerId: true, status: true },
  })
  if (!claim) return { ok: false, message: '신청을 찾을 수 없습니다' }
  if (claim.status !== 'pending') return { ok: false, message: '이미 처리된 신청입니다' }

  try {
    await prisma.$transaction(async (tx) => {
      // 신청자가 그 사이 다른 선수와 연결됐을 수 있다
      const mine = await tx.userPlayerLink.findUnique({
        where: { userId: claim.userId },
        select: { playerId: true },
      })
      if (mine) throw new Error('신청자가 이미 다른 플레이어와 연동돼 있습니다')

      // 최종 보증은 이 create의 유니크 제약이다
      await tx.userPlayerLink.create({
        data: { userId: claim.userId, playerId: claim.playerId },
      })

      await tx.playerLinkClaim.update({
        where: { id: claim.id },
        data: {
          status: 'approved',
          decidedAt: new Date(),
          decidedByUserId: input.adminUserId,
          decidedByEmail: input.adminEmail,
          decisionNote: (input.note ?? '').trim() || null,
        },
      })

      await tx.adminAuditLog.create({
        data: {
          userId: input.adminUserId,
          userEmail: input.adminEmail,
          action: 'player_link.approve',
          targetType: 'PlayerLinkClaim',
          targetId: claim.id,
          after: { userId: claim.userId, playerId: claim.playerId },
          note: (input.note ?? '').trim() || null,
        },
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // 유니크 제약 위반 = 그 사이 다른 신청이 먼저 승인됐다
    if (message.includes('Unique constraint') || message.includes('P2002')) {
      return { ok: false, message: '그 사이 다른 계정에 연동됐습니다' }
    }
    return { ok: false, message }
  }

  return { ok: true, message: '연동을 승인했습니다' }
}

export async function rejectPlayerLinkClaim(input: {
  claimId: string
  adminUserId: string
  adminEmail: string
  note?: string | null
}): Promise<DecisionResult> {
  const claim = await prisma.playerLinkClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, status: true, userId: true, playerId: true },
  })
  if (!claim) return { ok: false, message: '신청을 찾을 수 없습니다' }
  if (claim.status !== 'pending') return { ok: false, message: '이미 처리된 신청입니다' }

  await prisma.$transaction(async (tx) => {
    await tx.playerLinkClaim.update({
      where: { id: claim.id },
      data: {
        status: 'rejected',
        decidedAt: new Date(),
        decidedByUserId: input.adminUserId,
        decidedByEmail: input.adminEmail,
        decisionNote: (input.note ?? '').trim() || null,
      },
    })
    await tx.adminAuditLog.create({
      data: {
        userId: input.adminUserId,
        userEmail: input.adminEmail,
        action: 'player_link.reject',
        targetType: 'PlayerLinkClaim',
        targetId: claim.id,
        after: { userId: claim.userId, playerId: claim.playerId },
        note: (input.note ?? '').trim() || null,
      },
    })
  })

  return { ok: true, message: '연동 신청을 거부했습니다' }
}

export interface PendingClaimRow {
  id: string
  status: string
  created_at: string
  evidence: string | null
  user: { id: string; email: string; nickname: string }
  player: { id: string; name: string }
}

/** 관리자 목록 — 대기 중인 신청부터 */
export async function listPlayerLinkClaims(status?: ClaimStatus): Promise<PendingClaimRow[]> {
  const rows = await prisma.playerLinkClaim.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      createdAt: true,
      evidence: true,
      user: { select: { id: true, email: true, nickname: true } },
      player: { select: { id: true, name: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    evidence: row.evidence,
    user: row.user,
    player: row.player,
  }))
}
