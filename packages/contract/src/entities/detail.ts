import { z } from 'zod'
import { LeagueClanDetail, LeaguePlayer } from './league'
import { LeagueSummary } from './summaries'
import { MatchSummary, TeammateStat } from './match'

/**
 * 기록실 상단 요약 + 사이드 패널까지 포함한 상세 응답.
 * (league.ts ↔ match.ts 순환 참조를 피하려고 합성 스키마는 이 모듈에 모은다)
 */

/** GET /leagues/{leagueSlug}/players/{playerId} */
/**
 * 무기별 누적 (D-115).
 *
 * **판정된 경기만** 들어간다. `unknown`은 통합 기록에만 남고 여기 오지 않는다 —
 * 억지로 라플/스나 중 하나에 넣지 않는다.
 */
export const PlayerWeaponStat = z.object({
  /** `0 = 라이플`, `1 = 스나이퍼` */
  weapon: z.union([z.literal(0), z.literal(1)]),
  games: z.number().int().min(0),
  win: z.number().int().min(0),
  lose: z.number().int().min(0),
  kill: z.number().int().min(0),
  death: z.number().int().min(0),
  /** 킬뎃 % — 통합 기록과 같은 규칙 */
  kd_rate: z.number(),
  /** 판당 평균킬 */
  kill_per_match: z.number(),
})
export type PlayerWeaponStat = z.infer<typeof PlayerWeaponStat>

export const LeaguePlayerDetail = LeaguePlayer.extend({
  league: LeagueSummary,
  /** 무기별 기록. 판정된 경기가 없으면 빈 배열이다 */
  weapon_stats: z.array(PlayerWeaponStat),
  /** 최근 20전 요약 + 상대 클랜별 전적 */
  match_summary: MatchSummary,
  /** 최근 같이한 플레이어 승률 */
  teammates: z.array(TeammateStat),
})
export type LeaguePlayerDetail = z.infer<typeof LeaguePlayerDetail>

/** GET /leagues/{leagueSlug}/clans/{clanSlug}/show */
export const LeagueClanShow = LeagueClanDetail.extend({
  match_summary: MatchSummary,
  /** 최근 클랜전에 참여한 플레이어 승률 */
  teammates: z.array(TeammateStat),
})
export type LeagueClanShow = z.infer<typeof LeagueClanShow>
