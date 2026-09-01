/**
 * 클랜 **마스터 인증** — 인게임 스크린샷 1장을 사람이 심사한다 (2026-09-01 · D-253).
 *
 * ── 무엇을 푸는가
 *   `lib/server/ownership.ts` 의 `requireClanOwner` 가 **운영자만** 통과시키고 있었다.
 *   「클랜 설정을 누가 고쳐야 하는가」가 `[미확인]` 이라 가장 안전한 쪽으로 잠가 둔 것이다.
 *   사용자가 답했다 — **마스터다.** 그리고 마스터임을 증명하는 방법도 정했다:
 *   *"마스터 계정으로 접속한 인게임 사진 하나 첨부하라고 하면 끝이다."*
 *
 * ── ⚠ 왜 자동 판정을 만들지 않았나
 *   넥슨 Open API 는 「이 계정이 그 클랜의 마스터인가」를 알려 주지 않는다.
 *   `user/basic` 이 주는 것은 클랜 **이름**뿐이고, 그것도 마스터인지 클랜원인지 구분하지 않는다.
 *   **확인할 수 없는 것을 확인했다고 하지 않는다** — `PlayerLinkClaim`(D-121)과 같은 태도로
 *   사람이 근거를 보고 판정한다.
 *
 * ── 사진을 어디에 두는가
 *   **DB 에 바이트로 넣는다** (`ClanMasterClaimImage`). 오브젝트 스토리지가 아직 없고,
 *   기존 `/api/uploads` 는 운영에서 스스로를 막기 때문이다(D-147). 상한은 계약이 3MB 로 건다.
 *   저장소가 붙으면 그 표를 비우고 URL 만 남기면 된다.
 *
 * ── 어떤 경우에도 관문을 500 으로 만들지 않는다
 *   `isClanMaster` 는 예외를 던지지 않는다. 표가 아직 없으면 `false` — **모르면 못 하게 한다.**
 */
import { prisma } from '@sacloud/db'
import {
  canSubmitClanMasterClaim,
  clanMasterImageErrorMessage,
  grantsClanMaster,
  parseImageDataUrl,
  ClanMasterClaimStatus,
  type ClanMasterClaimState,
} from '@sacloud/contract'
import { toKstIsoOrNull } from '../format'
import { auditActor } from '../admin/audit'

/* -------------------------------------------------------------------------- */
/* 소유 관문이 묻는 질문                                                          */
/* -------------------------------------------------------------------------- */

/**
 * **이 회원이 이 클랜의 마스터로 승인됐나.**
 *
 * `lib/server/ownership.ts` 의 `requireClanOwner` 가 이 함수를 부른다.
 * 관문이 500 나면 안 되므로 **어떤 경우에도 예외를 던지지 않는다.**
 * 판단이 서지 않으면 `false` 다.
 */
export async function isClanMaster(userId: string, clanSlug: string): Promise<boolean> {
  try {
    const claim = await prisma.clanMasterClaim.findFirst({
      where: { userId, status: 'approved', clan: { slug: clanSlug } },
      select: { status: true },
    })
    return claim !== null && grantsClanMaster(claim.status)
  } catch (error) {
    console.error('[clan-master] isClanMaster', error)
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* 상태 조회                                                                     */
/* -------------------------------------------------------------------------- */

/** 아직 아무것도 내지 않은 상태. 표가 없을 때도 이 모양으로 답한다 */
function emptyState(available: boolean, takenByOther = false): ClanMasterClaimState {
  return {
    status: 'none',
    is_master: false,
    can_submit: available && !takenByOther,
    note: null,
    image_url: null,
    submitted_at: null,
    decided_at: null,
    decision_note: null,
    available,
    taken_by_other: takenByOther,
  }
}

/** 저장된 문자열을 계약의 상태로. 모르는 값은 `none` 으로 떨어뜨린다 */
function toStatus(value: string): ClanMasterClaimStatus {
  const parsed = ClanMasterClaimStatus.safeParse(value)
  return parsed.success ? parsed.data : 'none'
}

/**
 * 지금 이 회원의, 이 클랜에 대한 상태.
 *
 * 클랜을 못 찾으면 `null` — 라우트가 404 로 답한다.
 */
export async function clanMasterClaimState(
  userId: string,
  clanSlug: string,
): Promise<ClanMasterClaimState | null> {
  const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
  if (!clan) return null

  try {
    const [mine, approvedByAnyone] = await Promise.all([
      prisma.clanMasterClaim.findUnique({
        where: { userId_clanId: { userId, clanId: clan.id } },
        select: {
          status: true,
          note: true,
          createdAt: true,
          decidedAt: true,
          decisionNote: true,
          /* 바이트는 절대 끌어오지 않는다. **있는지만** 본다 */
          image: { select: { claimId: true } },
        },
      }),
      prisma.clanMasterClaim.findFirst({
        where: { clanId: clan.id, status: 'approved' },
        select: { userId: true },
      }),
    ])

    const takenByOther = approvedByAnyone !== null && approvedByAnyone.userId !== userId
    if (!mine) return emptyState(true, takenByOther)

    const status = toStatus(mine.status)
    return {
      status,
      is_master: grantsClanMaster(mine.status),
      can_submit: canSubmitClanMasterClaim(status) && !takenByOther,
      note: mine.note,
      image_url: mine.image ? `/api/clans/${encodeURIComponent(clanSlug)}/master-claim/image` : null,
      submitted_at: toKstIsoOrNull(mine.createdAt),
      decided_at: toKstIsoOrNull(mine.decidedAt),
      decision_note: mine.decisionNote,
      available: true,
      taken_by_other: takenByOther,
    }
  } catch (error) {
    /* 표가 아직 없다(마이그레이션 미적용). **있는 척하지 않는다** — 화면이 「준비 중」으로 막는다 */
    console.error('[clan-master] clanMasterClaimState', error)
    return emptyState(false)
  }
}

/* -------------------------------------------------------------------------- */
/* 제출 · 취소                                                                   */
/* -------------------------------------------------------------------------- */

export interface ClaimSubmitResult {
  ok: boolean
  /** 화면에 그대로 보여 줄 문구 */
  message: string
}

/**
 * 스크린샷 1장을 내고 심사를 기다린다.
 *
 * **여기서 권한이 생기지 않는다.** 관리자가 승인해야 생긴다.
 * 같은 사람이 같은 클랜을 다시 내면 기존 행을 되살린다 (유니크 제약이 있다).
 */
export async function submitClanMasterClaim(input: {
  userId: string
  clanSlug: string
  image: string
  note?: string | null
}): Promise<ClaimSubmitResult> {
  const clan = await prisma.clan.findUnique({
    where: { slug: input.clanSlug },
    select: { id: true },
  })
  if (!clan) return { ok: false, message: '클랜을 찾을 수 없습니다' }

  const parsedImage = parseImageDataUrl(input.image)
  if (!parsedImage.ok) return { ok: false, message: clanMasterImageErrorMessage(parsedImage.error) }

  /* 클랜당 마스터는 하나다. 이미 남이 승인돼 있으면 받지 않는다 —
     받아 두고 나중에 거부하면 사용자는 기다린 만큼 헛수고한다 */
  const approved = await prisma.clanMasterClaim.findFirst({
    where: { clanId: clan.id, status: 'approved' },
    select: { userId: true },
  })
  if (approved && approved.userId !== input.userId) {
    return { ok: false, message: '이 클랜은 이미 다른 회원이 마스터로 인증했습니다' }
  }
  if (approved && approved.userId === input.userId) {
    return { ok: false, message: '이미 마스터로 인증된 클랜입니다' }
  }

  const existing = await prisma.clanMasterClaim.findUnique({
    where: { userId_clanId: { userId: input.userId, clanId: clan.id } },
    select: { status: true },
  })
  if (existing && !canSubmitClanMasterClaim(toStatus(existing.status))) {
    return { ok: false, message: '이미 심사 중인 신청이 있습니다' }
  }

  const note = (input.note ?? '').trim().slice(0, 300) || null
  const bytes = Buffer.from(parsedImage.base64, 'base64')

  await prisma.$transaction(async (tx) => {
    const claim = await tx.clanMasterClaim.upsert({
      where: { userId_clanId: { userId: input.userId, clanId: clan.id } },
      create: { userId: input.userId, clanId: clan.id, note, status: 'pending' },
      update: {
        status: 'pending',
        note,
        createdAt: new Date(),
        decidedAt: null,
        decidedByUserId: null,
        decidedByEmail: null,
        decisionNote: null,
      },
      select: { id: true },
    })

    /* 다시 냈으면 **옛 사진을 새 사진으로 갈아 끼운다.** 심사 대상은 마지막 한 장이다 */
    await tx.clanMasterClaimImage.upsert({
      where: { claimId: claim.id },
      create: {
        claimId: claim.id,
        mimeType: parsedImage.mimeType,
        byteSize: parsedImage.byteSize,
        data: bytes,
      },
      update: {
        mimeType: parsedImage.mimeType,
        byteSize: parsedImage.byteSize,
        data: bytes,
        createdAt: new Date(),
      },
    })
  })

  return { ok: true, message: '신청이 접수됐습니다. 운영자 확인 후 권한이 열립니다' }
}

/** 심사중인 내 신청을 접는다. 승인된 것은 여기서 되돌리지 않는다 — 그건 관리자의 몫이다 */
export async function cancelClanMasterClaim(userId: string, clanSlug: string): Promise<number> {
  const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
  if (!clan) return 0

  const result = await prisma.clanMasterClaim.updateMany({
    where: { userId, clanId: clan.id, status: 'pending' },
    data: { status: 'cancelled', decidedAt: new Date() },
  })
  return result.count
}

/* -------------------------------------------------------------------------- */
/* 사진                                                                          */
/* -------------------------------------------------------------------------- */

export interface ClaimImage {
  mimeType: string
  byteSize: number
  data: Uint8Array
}

/** 내가 낸 사진. **다른 사람 것은 나오지 않는다** */
export async function myClanMasterClaimImage(
  userId: string,
  clanSlug: string,
): Promise<ClaimImage | null> {
  const row = await prisma.clanMasterClaimImage.findFirst({
    where: { claim: { userId, clan: { slug: clanSlug } } },
    select: { mimeType: true, byteSize: true, data: true },
  })
  return row ?? null
}

/** 관리자가 심사할 사진. `claimId` 로 곧장 찾는다 */
export async function clanMasterClaimImage(claimId: string): Promise<ClaimImage | null> {
  const row = await prisma.clanMasterClaimImage.findUnique({
    where: { claimId },
    select: { mimeType: true, byteSize: true, data: true },
  })
  return row ?? null
}

/* -------------------------------------------------------------------------- */
/* 관리자 — 목록 · 승인 · 거부 · 되돌리기                                          */
/* -------------------------------------------------------------------------- */

export type ClanMasterClaimAdminStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'revoked'

export interface ClanMasterClaimRow {
  id: string
  status: string
  created_at: string
  note: string | null
  decided_at: string | null
  decision_note: string | null
  decided_by_email: string | null
  user: { id: string; username: string | null; email: string | null; nickname: string }
  clan: { id: string; slug: string; name: string }
  /** 사진을 여는 경로. 없으면 `null` — 사진 없는 신청은 승인하지 않는다 */
  image_url: string | null
  image_byte_size: number | null
}

/**
 * 관리자 목록 — 심사 대기부터.
 *
 * ⚠ **바이트를 절대 select 하지 않는다.** 200건 × 3MB 를 끌어오면 화면이 아니라 서버가 죽는다.
 * 사진은 행마다 별도 경로(`image_url`)로 하나씩 연다.
 */
export async function listClanMasterClaims(
  status?: ClanMasterClaimAdminStatus,
): Promise<ClanMasterClaimRow[]> {
  const rows = await prisma.clanMasterClaim.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      createdAt: true,
      note: true,
      decidedAt: true,
      decisionNote: true,
      decidedByEmail: true,
      user: { select: { id: true, username: true, email: true, nickname: true } },
      clan: { select: { id: true, slug: true, name: true } },
      image: { select: { byteSize: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    note: row.note,
    decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
    decision_note: row.decisionNote,
    decided_by_email: row.decidedByEmail,
    user: row.user,
    clan: row.clan,
    image_url: row.image ? `/api/admin/clan-master-claims/${row.id}/image` : null,
    image_byte_size: row.image?.byteSize ?? null,
  }))
}

export interface DecisionResult {
  ok: boolean
  message: string
}

/**
 * 승인 — 여기서 **처음으로** 클랜 설정 권한이 생긴다.
 *
 * ── 사진이 없으면 승인하지 않는다
 *   근거를 보지 않고 누르는 사고를 막는다. 사용자 지시가 *"사진 하나 첨부"* 였다.
 *
 * ── 클랜당 하나
 *   두 관리자가 동시에 서로 다른 신청을 승인하면 애플리케이션 검사는 샌다.
 *   최종 보증은 부분 유니크 인덱스(`ClanMasterClaim_approved_clan_key`)다.
 *   그 실패를 삼키지 않고 그대로 사유로 돌려준다.
 *
 * ── 클랜 알도 함께 깬다
 *   `EggBreak(reason='master')` — 클랜 알은 「클랜마스터 인증」으로 깨진다(알 사양 3장).
 *   **이미 깨져 있으면 건드리지 않는다** — `reason='admin'`(시험) 흔적을 덮으면
 *   나중에 «이건 왜 깨져 있지» 를 알 수 없게 된다 (D-222).
 */
export async function approveClanMasterClaim(input: {
  claimId: string
  adminUserId: string
  adminEmail: string | null
  note?: string | null
}): Promise<DecisionResult> {
  const claim = await prisma.clanMasterClaim.findUnique({
    where: { id: input.claimId },
    select: {
      id: true,
      userId: true,
      clanId: true,
      status: true,
      clan: { select: { slug: true } },
      image: { select: { claimId: true } },
    },
  })
  if (!claim) return { ok: false, message: '신청을 찾을 수 없습니다' }
  if (claim.status !== 'pending') return { ok: false, message: '이미 처리된 신청입니다' }
  if (!claim.image) return { ok: false, message: '사진이 없는 신청은 승인할 수 없습니다' }

  const decisionNote = (input.note ?? '').trim() || null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.clanMasterClaim.update({
        where: { id: claim.id },
        data: {
          status: 'approved',
          decidedAt: new Date(),
          decidedByUserId: input.adminUserId,
          decidedByEmail: input.adminEmail,
          decisionNote,
        },
      })

      /* 클랜 알 — 이미 깨져 있으면 그대로 둔다 (D-222). `targetId` 는 slug 다 */
      const existing = await tx.eggBreak.findUnique({
        where: { targetKind_targetId: { targetKind: 'clan', targetId: claim.clan.slug } },
        select: { id: true },
      })
      if (!existing) {
        await tx.eggBreak.create({
          data: {
            targetKind: 'clan',
            targetId: claim.clan.slug,
            reason: 'master',
            brokenByUserId: claim.userId,
            note: '클랜 마스터 인증 승인',
          },
        })
      }

      await tx.adminAuditLog.create({
        data: {
          userId: input.adminUserId,
          userEmail: auditActor({ id: input.adminUserId, email: input.adminEmail }),
          action: 'clan_master.approve',
          targetType: 'ClanMasterClaim',
          targetId: claim.id,
          after: { userId: claim.userId, clanId: claim.clanId, clanSlug: claim.clan.slug },
          note: decisionNote,
        },
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unique constraint') || message.includes('P2002')) {
      return { ok: false, message: '그 사이 다른 회원이 이 클랜의 마스터로 승인됐습니다' }
    }
    return { ok: false, message }
  }

  return { ok: true, message: '마스터 인증을 승인했습니다' }
}

/** 거부. **사유를 남긴다** — 신청자 화면이 그대로 보여 준다 */
export async function rejectClanMasterClaim(input: {
  claimId: string
  adminUserId: string
  adminEmail: string | null
  note?: string | null
}): Promise<DecisionResult> {
  const claim = await prisma.clanMasterClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, status: true, userId: true, clanId: true },
  })
  if (!claim) return { ok: false, message: '신청을 찾을 수 없습니다' }
  if (claim.status !== 'pending') return { ok: false, message: '이미 처리된 신청입니다' }

  const decisionNote = (input.note ?? '').trim() || null

  await prisma.$transaction(async (tx) => {
    await tx.clanMasterClaim.update({
      where: { id: claim.id },
      data: {
        status: 'rejected',
        decidedAt: new Date(),
        decidedByUserId: input.adminUserId,
        decidedByEmail: input.adminEmail,
        decisionNote,
      },
    })
    await tx.adminAuditLog.create({
      data: {
        userId: input.adminUserId,
        /* 이메일이 없으면 계정 id 를 적는다 — 위 `approve` 의 같은 이유다 (D-252) */
        userEmail: auditActor({ id: input.adminUserId, email: input.adminEmail }),
        action: 'clan_master.reject',
        targetType: 'ClanMasterClaim',
        targetId: claim.id,
        after: { userId: claim.userId, clanId: claim.clanId },
        note: decisionNote,
      },
    })
  })

  return { ok: true, message: '마스터 인증을 거부했습니다' }
}

/**
 * 승인을 되돌린다 (`revoked`).
 *
 * **행을 지우지 않는다.** 승인됐던 사실 자체가 이력이고, 지우면 왜 권한이 있었는지를
 * 나중에 설명할 수 없다. 클랜 알은 건드리지 않는다 — 깬 것을 다시 씌우는 것은 별개 판단이다.
 */
export async function revokeClanMasterClaim(input: {
  claimId: string
  adminUserId: string
  adminEmail: string | null
  note?: string | null
}): Promise<DecisionResult> {
  const claim = await prisma.clanMasterClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, status: true, userId: true, clanId: true },
  })
  if (!claim) return { ok: false, message: '신청을 찾을 수 없습니다' }
  if (claim.status !== 'approved') return { ok: false, message: '승인된 신청이 아닙니다' }

  const decisionNote = (input.note ?? '').trim() || null

  await prisma.$transaction(async (tx) => {
    await tx.clanMasterClaim.update({
      where: { id: claim.id },
      data: {
        status: 'revoked',
        decidedAt: new Date(),
        decidedByUserId: input.adminUserId,
        decidedByEmail: input.adminEmail,
        decisionNote,
      },
    })
    await tx.adminAuditLog.create({
      data: {
        userId: input.adminUserId,
        /* 이메일이 없으면 계정 id 를 적는다 — 위 `approve` 의 같은 이유다 (D-252) */
        userEmail: auditActor({ id: input.adminUserId, email: input.adminEmail }),
        action: 'clan_master.revoke',
        targetType: 'ClanMasterClaim',
        targetId: claim.id,
        after: { userId: claim.userId, clanId: claim.clanId },
        note: decisionNote,
      },
    })
  })

  return { ok: true, message: '마스터 권한을 되돌렸습니다' }
}
