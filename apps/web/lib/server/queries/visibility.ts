/**
 * 공개 범위 (Phase 11 · D-102 정정).
 *
 * 무소속(independent) 클랜은 **계산에서 빼지 않는다.** 공식 경기라면
 * 클랜 래더도 개인 래더도 1부/2부와 똑같이 계산하고 DB에 그대로 저장한다.
 * 클랜 경기의 전력차를 계산하려면 실제 참가 선수의 실력값이 필요하기 때문이다.
 *
 * 무소속에서 달라지는 것은 **사용자에게 무엇을 보여 주는가**뿐이다.
 *
 *   보여 준다   경기 상세(참가자·K/D/A·맵·시간·승패) · 클랜 래더 · 클랜 승패 · 상대별 전적
 *   숨긴다      그 선수의 **장기 누적 개인 기록**과 개인 랭킹 노출
 *
 * 즉 "수집 안 함 / 계산 안 함 / 저장 안 함"이 아니라 **"사용자에게 숨김"** 하나다.
 */
import { prisma } from '@sacloud/db'

/** 무소속 클랜의 `Clan.category` 값 */
export const INDEPENDENT_CATEGORY = 'independent'

/**
 * 개인 누적 기록을 공개할 수 있는 선수인가.
 *
 * 판단 기준은 **현재 소속 클랜**이다 (`LeaguePlayer.clanId` → `Clan.category`).
 * 소속이 없으면(무소속 개인) 공개하지 않는다 — 공개할 근거가 없다.
 */
export function showsCareer(clan: { category: string } | null | undefined): boolean {
  return clan !== null && clan !== undefined && clan.category !== INDEPENDENT_CATEGORY
}

/**
 * 개인 랭킹에서 제외할 조건.
 *
 * 랭킹은 "공개 개인 기록"의 목록이므로 숨김 대상은 애초에 들어가지 않는다.
 * 점수 자체는 DB에 그대로 있고, 클랜 래더 계산에도 계속 쓰인다.
 */
export const PUBLIC_CAREER_WHERE = {
  clan: { category: { not: INDEPENDENT_CATEGORY } },
} as const

/** 숨김 대상일 때 개인 누적 필드를 비운다. 0으로 채우지 않는다 — 0승 0패는 거짓이다 */
export interface HiddenCareer {
  hidden: true
}

export type CareerVisibility<T> = ({ hidden: false } & T) | HiddenCareer

export function hideCareerIfIndependent<T>(
  clan: { category: string } | null | undefined,
  career: T,
): CareerVisibility<T> {
  return showsCareer(clan) ? { hidden: false, ...career } : { hidden: true }
}

/** 이 리그 참가 기록의 개인 누적을 공개해도 되는가 (`LeaguePlayer.id` 기준) */
export async function isCareerPublic(leaguePlayerId: string): Promise<boolean> {
  const entry = await prisma.leaguePlayer.findUnique({
    where: { id: leaguePlayerId },
    select: { clan: { select: { category: true } } },
  })
  return showsCareer(entry?.clan)
}
