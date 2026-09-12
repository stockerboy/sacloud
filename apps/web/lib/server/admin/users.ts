import { prisma } from '@sacloud/db'
import { ADMIN_ROLE } from '@/lib/server/session'
import { writeAudit } from './audit'

/**
 * ★회원 관리★ (2026-09-13 사장님: «관리자 페이지도 알잘딱갈센으로 만들고»).
 *
 * 회원가입과 서든 계정연동을 연 날 만들었다. 그 전까지 관리자 화면에는
 * **회원을 볼 자리가 아예 없었다** — 클랜·시즌·경기·마스터인증 넷뿐이었다.
 * 가입을 열어 놓고 누가 들어왔는지 볼 수 없으면 운영이 안 된다.
 *
 * ── 여기서 ★하지 않는★ 것
 *   - **정지·탈퇴를 만들지 않았다.** `User` 표에 그런 칸이 없다. 칸을 새로 만드는 일은
 *     운영 DB 마이그레이션이라 밤에 혼자 밀 일이 아니다 (`CLAUDE.md` 안정성 우선).
 *     필요해지면 `bannedAt` 을 더하고 이 파일에 함수 하나를 더한다.
 *   - **비밀번호를 보여 주거나 바꾸지 않는다.** 해시조차 조회 대상에서 뺐다.
 *
 * ── 여기서 ★하는★ 것
 *   - 목록 (검색 · 최신 가입순)
 *   - 연동 상태 (선수 · 클랜 · 칭호 도전)
 *   - 글·댓글 수 (누가 게시판을 쓰고 있나)
 *   - 권한 올리기·내리기 (0 ↔ 2). **자기 자신은 못 내린다** — 관리자가 0명이 되면
 *     아무도 이 화면에 못 들어온다
 */

/** 한 번에 보여 줄 회원 수. 관리자 화면이므로 게시판(15)보다 넉넉하다 */
export const ADMIN_USER_PAGE_SIZE = 30

export interface AdminUserRow {
  id: string
  /** 로그인 아이디. 옛 이메일 가입 계정은 없다 */
  username: string | null
  nickname: string
  email: string | null
  role: number
  createdAt: string
  /** 연동된 선수 (없으면 null) */
  player: { id: string; name: string } | null
  /** 그 선수의 소속 클랜 (없으면 null) */
  clan: { slug: string; name: string } | null
  /** 가장 최근 칭호 도전 — 연동이 어디까지 갔는지 */
  titleChallenge: { status: string; expectedTitle: string; lastSeenTitle: string | null } | null
  postCount: number
  commentCount: number
}

export interface AdminUserList {
  rows: AdminUserRow[]
  total: number
  /** 운영자가 몇 명인가 — 마지막 한 명을 내리지 않게 화면이 보고 판단한다 */
  adminCount: number
}

const USER_SELECT = {
  id: true,
  username: true,
  nickname: true,
  email: true,
  role: true,
  createdAt: true,
  playerLink: {
    select: {
      player: {
        select: {
          id: true,
          name: true,
          clan: { select: { slug: true, name: true } },
        },
      },
    },
  },
  /* 가장 최근 도전 하나면 된다 — 이력 전체는 이 화면의 일이 아니다 */
  titleChallenges: {
    orderBy: { issuedAt: 'desc' },
    take: 1,
    select: { status: true, expectedTitle: true, lastSeenTitle: true },
  },
  _count: { select: { boards: true, comments: true } },
} as const

/**
 * 회원 목록.
 *
 * 검색어는 **아이디·닉네임·이메일** 셋을 훑는다. 대소문자를 가리지 않는다 —
 * 아이디는 소문자로 저장되지만 관리자가 대문자로 칠 수 있다.
 */
export async function adminUserList(input: {
  q?: string | null
  offset?: number
  limit?: number
}): Promise<AdminUserList> {
  const q = input.q?.trim() ?? ''
  const limit = Math.min(Math.max(input.limit ?? ADMIN_USER_PAGE_SIZE, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)

  const where = q
    ? {
        OR: [
          { username: { contains: q, mode: 'insensitive' as const } },
          { nickname: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [rows, total, adminCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: USER_SELECT,
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { role: ADMIN_ROLE } }),
  ])

  return {
    total,
    adminCount,
    rows: rows.map((row) => {
      const player = row.playerLink?.player ?? null
      const challenge = row.titleChallenges[0] ?? null
      return {
        id: row.id,
        username: row.username,
        nickname: row.nickname,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
        player: player ? { id: player.id, name: player.name } : null,
        clan: player?.clan ? { slug: player.clan.slug, name: player.clan.name } : null,
        titleChallenge: challenge
          ? {
              status: challenge.status,
              expectedTitle: challenge.expectedTitle,
              lastSeenTitle: challenge.lastSeenTitle,
            }
          : null,
        postCount: row._count.boards,
        commentCount: row._count.comments,
      }
    }),
  }
}

/** 권한 바꾸기 결과 — 막힌 이유를 화면이 그대로 보여 줄 수 있게 말로 돌려준다 */
export type SetRoleResult = { ok: true; role: number } | { ok: false; message: string }

/**
 * 권한 올리기·내리기.
 *
 * ★막는 것 두 가지★
 * 1. **자기 자신은 못 내린다.** 실수로 스스로를 내리면 그 순간 관리자 화면에서 튕긴다
 * 2. **마지막 운영자는 못 내린다.** 0명이 되면 아무도 다시 올릴 수 없다 (DB 를 손으로 고쳐야 한다)
 *
 * 아는 값(`0` · `2`) 외의 role 은 받지 않는다 — `codes.ts` 에 그 외 값의 뜻이 [미확인]이다.
 */
export async function adminSetUserRole(input: {
  actor: { id: string; email: string | null }
  userId: string
  role: number
}): Promise<SetRoleResult> {
  if (input.role !== 0 && input.role !== ADMIN_ROLE) {
    return { ok: false, message: '알 수 없는 권한 값입니다' }
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, nickname: true, username: true },
  })
  if (!target) return { ok: false, message: '없는 회원입니다' }
  if (target.role === input.role) return { ok: true, role: target.role }

  if (input.role === 0) {
    if (target.id === input.actor.id) {
      return { ok: false, message: '자기 자신의 운영자 권한은 내릴 수 없습니다' }
    }
    const admins = await prisma.user.count({ where: { role: ADMIN_ROLE } })
    if (admins <= 1) return { ok: false, message: '마지막 운영자는 내릴 수 없습니다' }
  }

  await prisma.user.update({ where: { id: target.id }, data: { role: input.role } })
  await writeAudit({
    user: input.actor,
    action: input.role === ADMIN_ROLE ? 'user.grant_admin' : 'user.revoke_admin',
    targetType: 'user',
    targetId: target.id,
    before: { role: target.role },
    after: { role: input.role },
    note: target.username ?? target.nickname,
  })
  return { ok: true, role: input.role }
}
