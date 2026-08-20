import { z } from 'zod'
import { LeagueClanDetail, LeaguePlayer } from './league'
import { LeagueSummary } from './summaries'
import { MatchSummary, TeammateStat } from './match'

/**
 * 기록실 상단 요약 + 사이드 패널까지 포함한 상세 응답.
 * (league.ts ↔ match.ts 순환 참조를 피하려고 합성 스키마는 이 모듈에 모은다)
 */

/** GET /leagues/{leagueSlug}/players/{playerId} */
export const LeaguePlayerDetail = LeaguePlayer.extend({
  league: LeagueSummary,
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
