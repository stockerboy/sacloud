import { z } from 'zod'
import { Count, Id, IsoDateTime, Percent, Rating, Slug } from '../common'
import { Division, LeagueClanStatus, LeagueStatus, PlayerLimit, SeasonType } from '../codes'
import { ClanSummary, LeagueSummary, PlayerSummary, UserSummary } from './summaries'

/** 리그맵. 실제 맵 목록은 원본 조사 범위 밖이라 [미확인] — Mock은 자리표시자 이름을 쓴다. */
export const GameMap = z.object({
  id: Id,
  name: z.string(),
})
export type GameMap = z.infer<typeof GameMap>

/** GET /leagues — 리그 목록 행 (대표 클랜 마크 3개 포함) */
export const LeagueListItem = LeagueSummary.extend({
  user: UserSummary.nullable(),
  clan_count: Count,
  created_at: IsoDateTime,
  /** 목록에 노출되는 대표 클랜 (관측: 3개) */
  clans: z.array(ClanSummary),
})
export type LeagueListItem = z.infer<typeof LeagueListItem>

/** GET /leagues/{leagueSlug} — 리그 상세 */
export const League = LeagueSummary.extend({
  /** 리그소개 HTML. 렌더 전 반드시 새니타이즈한다. */
  description: z.string().nullable(),
  user: UserSummary.nullable(),
  /** 선택한 맵의 경기만 기록된다 */
  maps: z.array(GameMap),
  /** 선택한 대전 인원의 경기만 기록된다 */
  player_limits: z.array(PlayerLimit),
  clan_count: Count,
  status: LeagueStatus,
  created_at: IsoDateTime,
  /** 현재 시즌 번호. **베타는 0이다** — 화면에 숫자로 쓰지 않는다 (D-098) */
  season: Count,
  /**
   * 현재 시즌 종류 — `legacy` | `beta` | `official`.
   * 활성 시즌이 없으면 `official`로 둔다(표시할 배지가 없다는 뜻).
   */
  season_type: SeasonType,
  /** 화면에 그대로 쓰는 시즌 이름. 베타는 `Beta Season`이다 */
  season_label: z.string(),
})
export type League = z.infer<typeof League>

/** GET /leagues/{leagueSlug}/clans — 리그 참여 클랜 (커서) */
export const LeagueClan = z.object({
  id: Id,
  league_id: Id,
  clan: ClanSummary,
  rating: Rating,
  division: Division,
  win: Count,
  lose: Count,
  win_rate: Percent,
  placement: z.boolean(),
  status: LeagueClanStatus,
  joined_at: IsoDateTime,
})
export type LeagueClan = z.infer<typeof LeagueClan>

/** GET /leagues/{leagueSlug}/clans/{clanSlug}/show — 리그 내 클랜 상세 */
export const LeagueClanDetail = LeagueClan.extend({
  league: LeagueSummary,
  rank: Count.nullable(),
  rank_count: Count.nullable(),
  member_count: Count,
})
export type LeagueClanDetail = z.infer<typeof LeagueClanDetail>

/** GET /leagues/{leagueSlug}/players/{playerId} 의 기본 정보부 */
export const LeaguePlayer = z.object({
  id: Id,
  league_id: Id,
  player: PlayerSummary,
  clan: ClanSummary.nullable(),
  rating: Rating,
  win: Count,
  lose: Count,
  win_rate: Percent,
  kill: Count,
  death: Count,
  assist: Count,
  headshot: Count,
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent,
  kill_per_match: z.number().min(0),
  mvp_count: Count,
  placement: z.boolean(),
  rank: Count.nullable(),
  rank_count: Count.nullable(),
})
export type LeaguePlayer = z.infer<typeof LeaguePlayer>

/**
 * GET /leagueplayers/{leaguePlayerId}/seasons — 지난시즌.
 *
 * 아래 `nullable` 필드는 **원본에 있을 때만** 채운다.
 * 과거 3rd.supply 지난시즌 응답에는 rating·평균킬·MVP·소속이 없다 (D-099).
 * 없으면 `null`이고, 화면은 그 줄을 **생략**한다. 0이나 `-`로 채우지 않는다.
 */
export const LeaguePlayerSeason = z.object({
  season: Count,
  /** 화면에 쓰는 이름. 베타는 `Beta Season` */
  season_label: z.string(),
  season_type: SeasonType,
  rank: Count.nullable(),
  rank_count: Count.nullable(),
  rating: Rating,
  win: Count,
  lose: Count,
  win_rate: Percent,
  kill: Count,
  death: Count,
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent,
  /* --- 원본에 있을 때만 --- */
  assist: Count.nullable(),
  headshot: Count.nullable(),
  kill_per_match: z.number().nullable(),
  mvp_count: Count.nullable(),
  /** 그 시즌 시점의 값이다. 지금 값이 아니다 */
  nickname_at_season: z.string().nullable(),
  clan_name_at_season: z.string().nullable(),
  division_at_season: Division.nullable(),
  /** 이 카드가 이전된 기록인가 (`3rd.supply` 등). SACLOUD가 계산한 것이면 null */
  source: z.string().nullable(),
})
export type LeaguePlayerSeason = z.infer<typeof LeaguePlayerSeason>

/** 클랜 지난시즌. 개인과 컬럼 구성이 다른지는 [미확인] — 계약상 동일 형태로 둔다. */
export const LeagueClanSeason = z.object({
  season: Count,
  rank: Count.nullable(),
  rank_count: Count.nullable(),
  rating: Rating,
  division: Division,
  win: Count,
  lose: Count,
  win_rate: Percent,
})
export type LeagueClanSeason = z.infer<typeof LeagueClanSeason>

/** GET /leagues/{leagueId}/ranks/clans?division=N */
export const ClanRankRow = z.object({
  rank: Count,
  league_clan_id: Id,
  clan: ClanSummary,
  division: Division,
  win: Count,
  lose: Count,
  win_rate: Percent,
  rating: Rating,
  /**
   * 클랜 구분 — `official` | `independent`.
   *
   * **통합 래더에서만 의미가 있다.** 무소속 클랜도 같은 Team Elo로 계산되고
   * 통합 순위에 그대로 들어간다. 화면에서 구분해 보여 주기 위한 값이다 (D-102).
   */
  category: z.string(),
})
export type ClanRankRow = z.infer<typeof ClanRankRow>

/** GET /leagues/{leagueId}/ranks/players */
export const PlayerRankRow = z.object({
  rank: Count,
  league_player_id: Id,
  player: PlayerSummary,
  clan: ClanSummary.nullable(),
  win: Count,
  lose: Count,
  win_rate: Percent,
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent,
  kill_per_match: z.number().min(0),
  rating: Rating,
})
export type PlayerRankRow = z.infer<typeof PlayerRankRow>

/** POST /leagues — 리그 만들기 입력 (관측된 폼 제약을 그대로 강제) */
export const LeagueCreateInput = z.object({
  /** 한글/영어/숫자 2~8자, "리그"로 끝날 수 없음 */
  name: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[가-힣a-zA-Z0-9]+$/, '한글, 영어, 숫자만 사용할 수 있습니다')
    .refine((value) => !value.endsWith('리그'), '리그 이름은 "리그"로 끝날 수 없습니다'),
  /** 영숫자 4~16자, URL slug로 사용, 중복 불가 */
  slug: z
    .string()
    .min(4)
    .max(16)
    .regex(/^[a-zA-Z0-9]+$/, '영문과 숫자만 사용할 수 있습니다'),
  /** 1 = 단일리그, 2 이상 = N부리그 */
  division_count: Count.min(1),
  /** 최소 1개 */
  map_ids: z.array(Id).min(1, '리그맵을 1개 이상 선택해야 합니다'),
  /** 최소 1개 */
  player_limits: z.array(PlayerLimit).min(1, '대전인원을 1개 이상 선택해야 합니다'),
  /** 필수 동의 3항목 */
  agreements: z.object({
    no_paid_invitation: z.literal(true),
    responsible_operation: z.literal(true),
    accept_deletion_policy: z.literal(true),
  }),
  /** reCAPTCHA 토큰 */
  captcha_token: z.string().min(1),
})
export type LeagueCreateInput = z.infer<typeof LeagueCreateInput>

/** 리그 slug 중복 확인 */
export const SlugAvailability = z.object({
  slug: Slug,
  available: z.boolean(),
})
export type SlugAvailability = z.infer<typeof SlugAvailability>
