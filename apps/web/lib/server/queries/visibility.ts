/**
 * 공개 범위 (D-107 · 2026-08-23 확정. D-102의 "무소속 개인 커리어 숨김"은 폐기).
 *
 * ── 무소속리그는 **리그다.** 숨겨진 무엇이 아니다.
 *   개인 래더 · 개인 랭킹 · 승패 · 승률 · 시즌 카드 · 최근 경기 · 경기 상세를
 *   공식리그와 **똑같이** 가진다. 만들지 않는 것도, 감추는 것도 아니다.
 *
 * ── 기록은 리그 단위로 완전히 분리된다.
 *   `LeaguePlayer(leagueId, playerId)` · `LeaguePlayerSeason(leaguePlayerId, seasonId)` ·
 *   `Match.leagueId` 가 이미 그 구조다. 그래서 무소속리그는 **별도 League 행**이고,
 *   한 리그의 경기 결과가 다른 리그의 개인 기록에 닿을 수 있는 경로가 없다.
 *   길수의 공식리그 238전과 무소속리그 100전은 서로 다른 행에 쌓인다.
 *
 * ── 딱 하나만 다르다.
 *   무소속리그에서는 **누적** kill · death · 킬뎃을 사용자 화면에 내보내지 않는다.
 *
 *   보여 준다   래더 · 랭킹 · 승 · 패 · 승률 · 평균킬 · MVP · 시즌 카드 · 최근 경기 ·
 *              **경기 한 판의 K/D/A** · 경기 상세 · 라인업 · 래더 증감
 *   숨긴다      누적 킬 · 누적 데스 · 누적 킬뎃(%)
 *
 *   `23 / 7 / 3` 같은 그 경기의 성적은 숨기지 않는다. 숨기는 것은
 *   `시즌 누적 13,123킬 / 12,837데스 / 50.6%` 뿐이다.
 *
 * ── 저장은 그대로 한다.
 *   DB에는 누적 킬·데스가 계속 쌓인다. 계산에도 쓴다. 여기서 정하는 것은 **응답에 넣는가**다.
 */
import { prisma } from '@sacloud/db'

/** 무소속리그의 `League.category` 값 */
export const INDEPENDENT_LEAGUE = 'independent'

/** 무소속 클랜의 `Clan.category` 값 (클랜 Tier 구조용 — D-104. 개인 기록과 무관하다) */
export const INDEPENDENT_CATEGORY = 'independent'

/**
 * 이 리그에서 **누적** kill/death/킬뎃을 감추는가.
 *
 * 판단 기준은 리그다. 선수의 소속 클랜이 아니다 —
 * 무소속 클랜 선수가 공식리그에 용병으로 뛰면 그 경기는 **공식리그 기록**이고,
 * 공식리그 카드에는 누적 킬뎃이 정상으로 나온다 (D-107 11장).
 */
export function hidesCumulativeKd(league: { category: string } | null | undefined): boolean {
  return league?.category === INDEPENDENT_LEAGUE
}

/**
 * 응답에 넣을 누적 킬/데스/킬뎃.
 *
 * 감추는 리그면 셋 다 `null`이다. **0으로 만들지 않는다** — 0킬은 사실이 아니다.
 * 화면은 `null`을 보고 그 항목을 아예 그리지 않는다 (D-107 8장 "항목만 제거").
 */
export interface CumulativeKd {
  kill: number | null
  death: number | null
  kd_rate: number | null
}

/**
 * 들어오는 값 자체가 `null` 일 수 있다 — 감추는 것과는 다른 이유다.
 * K/D 를 아는 경기가 한 판도 없으면 누적 킬·데스는 **모르는 값**이다 (D-034 · D-106 · D-176).
 * 0으로 바꾸지 않고 그대로 통과시킨다.
 */
export function cumulativeKd(
  league: { category: string } | null | undefined,
  values: { kill: number | null; death: number | null; kdRate: number | null },
): CumulativeKd {
  if (hidesCumulativeKd(league)) return { kill: null, death: null, kd_rate: null }
  return { kill: values.kill, death: values.death, kd_rate: values.kdRate }
}

/** 킬뎃만 필요한 자리 (개인랭킹 행) */
export function cumulativeKdRate(
  league: { category: string } | null | undefined,
  kdRateValue: number,
): number | null {
  return hidesCumulativeKd(league) ? null : kdRateValue
}

/** 이 리그 참가 기록이 누적 킬뎃을 감추는가 (`LeaguePlayer.id` 기준) */
export async function leagueHidesCumulativeKd(leaguePlayerId: string): Promise<boolean> {
  const entry = await prisma.leaguePlayer.findUnique({
    where: { id: leaguePlayerId },
    select: { league: { select: { category: true } } },
  })
  return hidesCumulativeKd(entry?.league)
}
