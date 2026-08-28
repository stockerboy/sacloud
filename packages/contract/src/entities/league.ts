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
  /* 누적 킬·데스·킬뎃은 **무소속리그에서 `null`** 이다 (D-107).
     값이 없다는 뜻이 아니라 공개하지 않는다는 뜻이다 — `league.hides_cumulative_kd` 참조.
     경기 한 판의 K/D/A는 이것과 무관하게 그대로 나온다. */
  kill: Count.nullable(),
  death: Count.nullable(),
  assist: Count,
  headshot: Count,
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent.nullable(),
  kill_per_match: z.number().min(0),
  mvp_count: Count,
  placement: z.boolean(),
  rank: Count.nullable(),
  rank_count: Count.nullable(),
  /**
   * 무기별 전적 (D-146 · D-149).
   *
   * 넥슨 Open API 는 무기를 주지 않는다 (D-034). 무기는 3rd.supply 라인업에서,
   * K/D/A 는 넥슨 상세에서 온다. 둘을 합쳐 무기별로 나눠 담은 값이다.
   *
   * ── `games` 와 `known_games` 를 나누는 이유
   *   무기는 아는데 K/D/A 를 모르는 경기가 있다. 그 경기를 0킬로 세면 평균이 거짓이 된다.
   *   `games` 는 그 무기로 뛴 경기 전부, `known_games` 는 그중 기록을 아는 경기다.
   *   킬·데스·킬뎃의 분모는 **`known_games`** 다.
   *
   * ── `kd_rate`
   *   통합 킬뎃과 **같은 정의**다 — `킬 / (킬 + 데스) × 100`.
   *   아는 경기가 없으면 `null` 이다 (0%가 아니라 모르는 것이다).
   *
   * ── 순위
   *   그 무기로 얻은 래더 증감 합으로 매긴다. **무기별 공식은 없다** (3-B 1번).
   *   기록을 아는 경기가 한 판도 없으면 순위를 만들지 않는다 — 화면은 `집계 없음`.
   */
  sniper_rank: Count.nullable().default(null),
  sniper_rank_count: Count.nullable().default(null),
  sniper_games: Count.default(0),
  sniper_known_games: Count.default(0),
  sniper_kill: Count.default(0),
  sniper_death: Count.default(0),
  sniper_assist: Count.default(0),
  sniper_kd_rate: Percent.nullable().default(null),
  rifle_rank: Count.nullable().default(null),
  rifle_rank_count: Count.nullable().default(null),
  rifle_games: Count.default(0),
  rifle_known_games: Count.default(0),
  rifle_kill: Count.default(0),
  rifle_death: Count.default(0),
  rifle_assist: Count.default(0),
  rifle_kd_rate: Percent.nullable().default(null),
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
  /* SACLOUD가 계산한 카드는 아래가 **항상 있다**.
     과거(3rd.supply) 카드는 시즌마다 제공 필드가 달라 **없을 수 있다** —
     시즌 4는 승률·킬뎃만 준다. 없는 값을 0으로 채우지 않는다 (D-106). */
  rating: Rating.nullable(),
  win: Count.nullable(),
  lose: Count.nullable(),
  win_rate: Percent.nullable(),
  kill: Count.nullable(),
  death: Count.nullable(),
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent.nullable(),
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
  /** 화면에 쓰는 이름. 베타는 `Beta Season` — 내부 번호 0을 노출하지 않는다 (D-098) */
  season_label: z.string(),
  season_type: SeasonType,
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

/**
 * 개인랭킹 무기 축 (D-169) — **원본에 없는 우리 신규 기능**이다.
 *
 * 사용자 지시로 개인랭킹을 셋으로 나눈다. 화면 표기는 `통합 / 스나 / 라플`.
 *
 *   `all`     통합 — 스나·라플 구분 없이 모든 기록을 합친 기존 개인 래더 (`LeaguePlayer.rating`)
 *   `sniper`  스나 — `MatchPlayerStat.weapon = 1` 경기만
 *   `rifle`   라플 — `MatchPlayerStat.weapon = 0` 경기만
 *
 * **무기별 공식은 없다** (`CLAUDE.md` 3-B 1번). 통합 공식이 계산한 증감을
 * 무기에 따라 **기록만** 나눠 담은 `LeaguePlayerWeaponStat.ratingDelta` 를 읽을 뿐이다.
 * 무기 축을 도입해도 통합 래더 값은 한 점도 바뀌지 않는다.
 */
export const RankWeapon = z.enum(['all', 'sniper', 'rifle'])
export type RankWeapon = z.infer<typeof RankWeapon>

/** 무기 축 → `MatchPlayerStat.weapon` 코드 (`CLAUDE.md` 6장: 0 = 라이플, 1 = 스나이퍼) */
export const RANK_WEAPON_CODE = { sniper: 1, rifle: 0 } as const

/** 화면 표기 — 사용자가 쓴 말 그대로 (`통합 / 스나 / 라플`) */
export const RANK_WEAPON_LABEL: Record<RankWeapon, string> = {
  all: '통합',
  sniper: '스나',
  rifle: '라플',
}

/** 문자열 하나를 무기 축으로 좁힌다. 모르는 값은 `all` (기존 동작 유지) */
export function parseRankWeapon(value: string | null | undefined): RankWeapon {
  return value === 'sniper' || value === 'rifle' ? value : 'all'
}

/** GET /leagues/{leagueId}/ranks/players */
export const PlayerRankRow = z.object({
  rank: Count,
  league_player_id: Id,
  player: PlayerSummary,
  clan: ClanSummary.nullable(),
  win: Count,
  lose: Count,
  win_rate: Percent,
  /** 킬뎃 % — 무소속리그 개인랭킹에서는 `null`이다 (D-107) */
  kd_rate: Percent.nullable(),
  kill_per_match: z.number().min(0),
  /**
   * 통합 개인 래더 (`LeaguePlayer.rating`).
   *
   * **무기 탭에서도 이 값은 통합 래더 그대로다.** 무기별로 쪼갠 절대 점수를 만들지 않는다
   * (`CLAUDE.md` 3-B 2번 — 무기 분리가 통합 래더 값을 바꾸면 안 된다).
   */
  rating: Rating,
  /**
   * 이 줄이 어느 축의 랭킹인가 (D-169). 통합이면 `all`.
   *
   * 기존 소비자(클랜원 목록)를 깨지 않으려고 선택 필드로 둔다.
   */
  weapon: RankWeapon.optional(),
  /**
   * 그 무기로 뛴 경기에서 얻은 **래더 증감의 합** (`LeaguePlayerWeaponStat.ratingDelta`).
   * 무기 탭의 정렬 기준이자 표시값이다. 통합 랭킹에서는 `null`.
   */
  rating_delta: z.number().int().nullable().optional(),
})
export type PlayerRankRow = z.infer<typeof PlayerRankRow>

/**
 * 폼 TOP3 규칙 상수 (D-169, 사용자 확정).
 *
 * 기존 `FORM_RECENT_GAMES` / `FORM_BASELINE_GAMES`(선수 상세의 폼 판정)와는 **다른 기능**이다.
 * 이름을 `FORM_TOP_*` 으로 구분한다.
 */
/** 최소 이 경기 수를 채운 선수만 후보 */
export const FORM_TOP_MIN_GAMES = 3
/** 몇 명을 보여 주는가 */
export const FORM_TOP_SIZE = 3

/** 폼 TOP3 한 줄 (D-169) */
export const FormTopRow = z.object({
  rank: Count,
  league_player_id: Id,
  player: PlayerSummary,
  clan: ClanSummary.nullable(),
  /** 그날 얻은 래더 증감의 합. 음수일 수 있다 */
  rating_delta: z.number().int(),
  /** 그날 그 축으로 뛴 경기 수 */
  games: Count,
})
export type FormTopRow = z.infer<typeof FormTopRow>

/**
 * GET /leagues/{leagueId}/ranks/form — 폼 TOP3 (D-169).
 *
 * **원본에 없는 우리 신규 기능**이다. 규칙은 사용자와 확정했다 —
 * 그날 하루 동안 얻은 래더 증감의 합이 큰 순서로 3명, 최소 3경기,
 * 동점이면 경기 수가 많은 쪽이 위.
 */
export const FormTop = z.object({
  /** 집계 대상 날짜 (KST 자정 기준, `YYYY-MM-DD`). 경기가 하나도 없으면 `null` */
  date: z.string().nullable(),
  /** 그 날짜가 오늘(KST)인가. 오늘 경기가 없어 최근 경기일로 물러섰으면 `false` */
  is_today: z.boolean(),
  weapon: RankWeapon,
  rows: z.array(FormTopRow),
})
export type FormTop = z.infer<typeof FormTop>

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
