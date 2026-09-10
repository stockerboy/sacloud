/**
 * ★핵의심 신고★ (2026-09-10 · 사장님: "신고하기 기능 만들어 이건 로그인한 회원만 누를 수 있게")
 *
 * - 로그인한 회원만 누른다. 비로그인은 401 이다.
 * - 같은 회원이 같은 선수를 **같은 날(KST)** 두 번 누를 수 없다 — `PlayerReport(playerId, userId, day)`
 *   유니크가 자물쇠다. 두 번째 누름은 409 로 돌려보내고 카운트는 그대로다.
 * - 화면의 «123회» 는 거두지 않은(`withdrawnAt IS NULL`) 줄 수다.
 */
import { Prisma, prisma } from '@sacloud/db'
import { currentUserId } from '../session'

export interface PlayerReportResult {
  ok: boolean
  status: number
  message: string
  /** 이 선수의 현재 신고 수 — 성공이든 중복이든 화면이 바로 쓴다 */
  count: number
}

/** KST 날짜 `YYYY-MM-DD` — 하루 한 번의 기준 */
export function kstDayOf(at: Date): string {
  const shifted = new Date(at.getTime() + 9 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

export async function playerReportCount(playerId: string): Promise<number> {
  return prisma.playerReport.count({ where: { playerId, withdrawnAt: null } })
}

export async function reportPlayer(request: Request, playerId: string): Promise<PlayerReportResult> {
  const userId = await currentUserId(request)
  if (!userId) return { ok: false, status: 401, message: '로그인한 회원만 신고할 수 있습니다', count: await playerReportCount(playerId) }
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } })
  if (!player) return { ok: false, status: 404, message: '선수를 찾을 수 없습니다', count: 0 }
  const day = kstDayOf(new Date())
  try {
    await prisma.playerReport.create({ data: { playerId, userId, day } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, status: 409, message: '오늘은 이미 신고했습니다', count: await playerReportCount(playerId) }
    }
    throw error
  }
  return { ok: true, status: 200, message: '신고했습니다', count: await playerReportCount(playerId) }
}
