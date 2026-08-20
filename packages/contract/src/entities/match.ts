import { z } from 'zod'
import { Count, Id, IsoDateTime, Percent, Rating, RatingUpdate } from '../common'
import { Division, TeamSide, Weapon } from '../codes'
import { ClanSummary, PlayerSummary } from './summaries'
import { GameMap } from './league'

/**
 * 매치 ID 규칙 (관측): `YYMMDDHHmmss` + 6자리 코드 (총 18자리).
 * 예) 260605000624124001 = 2026-06-05 00:06:24
 * 뒤 6자리 코드의 의미는 [미확인].
 */
export const MatchId = z.string().regex(/^\d{18}$/, '매치 ID는 18자리 숫자입니다')

/**
 * 매치 상세의 플레이어 스탯.
 * 상대 클랜 소속 플레이어는 딜량·헤드샷이 결측되어 `null`로 내려온다(UI에서 `알수없음`).
 */
export const MatchPlayerStat = z.object({
  player_id: Id,
  name: z.string(),
  side: TeamSide,
  kill: Count,
  death: Count,
  assist: Count,
  headshot: Count.nullable(),
  damage: Count.nullable(),
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent,
  damage_percent: Percent.nullable(),
  headshot_percent: Percent.nullable(),
  weapon: Weapon,
  /** 배치고사 진행중이면 래더 대신 `배치고사`를 표기하므로 null일 수 있다 */
  rating: Rating.nullable(),
  rating_update: RatingUpdate.nullable(),
  placement: z.boolean(),
  /** 탈주 */
  dropout: z.boolean(),
  win: z.boolean(),
  mvp: z.boolean(),
})
export type MatchPlayerStat = z.infer<typeof MatchPlayerStat>

/** 매치 카드에 표시되는 라인업 항목 (스나이퍼는 `[S]` 표기) */
export const MatchLineupEntry = z.object({
  player_id: Id,
  name: z.string(),
  weapon: Weapon,
  dropout: z.boolean(),
})
export type MatchLineupEntry = z.infer<typeof MatchLineupEntry>

/** 매치 시점의 클랜 스냅샷 (당시 래더·부리그) */
export const MatchClanSnapshot = z.object({
  league_clan_id: Id,
  clan: ClanSummary,
  rating: Rating.nullable(),
  division: Division,
  placement: z.boolean(),
})
export type MatchClanSnapshot = z.infer<typeof MatchClanSnapshot>

/**
 * 기록실 목록의 매치 카드.
 * 개인 기록실에서는 `player_stat`에 본인 스탯이 담기고, 클랜 기록실에서는 null이다.
 */
export const MatchListItem = z.object({
  id: MatchId,
  league_id: Id,
  map: GameMap,
  player_count: Count,
  start_at: IsoDateTime,
  end_at: IsoDateTime,
  /** 플레이 시간(초) */
  play_time: Count,
  win: z.boolean(),
  /** 선공 진영이 블루면 true (원본 표기: 선레드 / 선블루). 정확한 의미는 [미확인] */
  blue_team: z.boolean(),
  placement: z.boolean(),
  rating_update: RatingUpdate.nullable(),
  mvp_player_id: Id.nullable(),
  league_clan: MatchClanSnapshot,
  opponent: MatchClanSnapshot,
  red: z.array(MatchLineupEntry),
  blue: z.array(MatchLineupEntry),
  player_stat: MatchPlayerStat.nullable(),
})
export type MatchListItem = z.infer<typeof MatchListItem>

/** GET /leagues/{leagueId}/matches/{matchId} — 아코디언 펼침 시 지연 로드 */
export const MatchDetail = MatchListItem.extend({
  red_stats: z.array(MatchPlayerStat),
  blue_stats: z.array(MatchPlayerStat),
})
export type MatchDetail = z.infer<typeof MatchDetail>

/** 최근 N전 요약의 상대 클랜별 전적 */
export const OpponentSummaryEntry = z.object({
  clan: ClanSummary,
  win: Count,
  lose: Count,
  win_rate: Percent,
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent,
})
export type OpponentSummaryEntry = z.infer<typeof OpponentSummaryEntry>

/** 연승/연패 */
export const Streak = z.object({
  type: z.enum(['win', 'lose', 'none']),
  count: Count,
})
export type Streak = z.infer<typeof Streak>

/** 개인/클랜 기록실 상단 요약 (관측: 최근 20전 기준) */
export const MatchSummary = z.object({
  recent_count: Count,
  win: Count,
  lose: Count,
  win_rate: Percent,
  streak: Streak,
  opponents: z.array(OpponentSummaryEntry),
})
export type MatchSummary = z.infer<typeof MatchSummary>

/** 최근 같이한 플레이어 / 최근 클랜전 플레이어 승률 */
export const TeammateStat = z.object({
  player: PlayerSummary,
  win: Count,
  lose: Count,
  win_rate: Percent,
})
export type TeammateStat = z.infer<typeof TeammateStat>
