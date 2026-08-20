import { z } from 'zod'
import { Count, Id, IsoDateTime, Percent, Rating } from '../common'
import { ClanSummary, LeagueSummary, PlayerSummary } from './summaries'

/** GET /players/{playerId} */
export const Player = z.object({
  id: Id,
  name: z.string(),
  clan: ClanSummary.nullable(),
  /** 클랜 내 포지션 메모 (예: "2층") */
  position: z.string().nullable(),
  /** 플레이어 소개/메모. 원본 `note` */
  note: z.string().nullable(),
  /** 마지막 `정보갱신` 시각 */
  renewed_at: IsoDateTime.nullable(),
})
export type Player = z.infer<typeof Player>

/** GET /players/{playerId}/leagues — 참여중인 리그별 요약 */
export const PlayerLeagueEntry = z.object({
  league: LeagueSummary,
  league_player_id: Id,
  clan: ClanSummary.nullable(),
  rating: Rating,
  win: Count,
  lose: Count,
  win_rate: Percent,
  kd_rate: z.number().min(0),
  /** 배치고사 진행중이면 true (랭킹·래더 대신 `배치고사` 표기) */
  placement: z.boolean(),
  rank: Count.nullable(),
  rank_count: Count.nullable(),
})
export type PlayerLeagueEntry = z.infer<typeof PlayerLeagueEntry>

/** GET /players/search/{q} — 자동완성 결과 */
export const PlayerSearchItem = PlayerSummary.extend({
  clan: ClanSummary.nullable(),
})
export type PlayerSearchItem = z.infer<typeof PlayerSearchItem>
