import { z } from 'zod'
import { Count, Percent } from '../common'
import { PLAYSTYLE_SIDE_KEYS, TRAIT_AXIS_KEYS, TRAIT_PENDING_KEYS } from '../traits'
import { LeagueClanDetail, LeaguePlayer } from './league'
import { LeagueSummary, PlayerSummary } from './summaries'
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

/**
 * 기록실 상세가 함께 내보내는 **선수 프로필 값** (D-161).
 *
 * 원본 응답도 이 자리에 담아 준다 — `data.player.{position,note}` (실측 2026-08-28).
 * 리그별 값이 아니라 **전역 선수 값**이라 어느 리그에서 조회해도 같다.
 *
 * ── `position`
 *   선수가 **직접 설정하는 값**이다. 경기 기록을 세서 만들어 내는 값이 아니다
 *   (`packages/ui/src/record/weaponCopy.ts` 의 `resolvePlayerPosition` 과 **다른 개념**이다).
 *   원본 응답은 숫자 코드로 주고 화면이 한글 표기로 바꿔 그린다 — 우리는 **표기**를 담는다.
 *   값이 없으면 `null` 이고, 그때 화면은 **줄 자체를 그리지 않는다** (D-099 · D-106).
 *   `-` 나 `알수없음` 으로 채우지 않는다.
 *
 * ── `note`
 *   선수 소개/메모. 원본이 이 값을 **어느 화면에 쓰는지 확인하지 못했다** `[미확인]`.
 *   그래서 계약에는 담되 화면에는 붙이지 않는다.
 *
 * 기본값이 있어 이 필드가 없던 응답과도 호환된다.
 */
export const LeaguePlayerProfile = PlayerSummary.extend({
  position: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
})
export type LeaguePlayerProfile = z.infer<typeof LeaguePlayerProfile>

/* -------------------------------------------------------------------------- */
/* 최근 폼 (D-167)                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 월별 킬뎃 한 칸.
 *
 * 경기가 없던 달도 **자리를 지킨다.** `games = 0` 이고 `kd_rate = null` 이다 —
 * 0% 로 채우지 않는다 (D-106). 화면은 그 달을 `알수없음` 으로 두고 선을 끊는다.
 */
export const PlayerFormMonth = z.object({
  /** `YYYY-MM` (KST 기준) */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** K/D 를 아는 경기 수. 모르는 참가 기록은 세지 않는다 (D-148) */
  games: Count,
  kill: Count,
  death: Count,
  /** 킬뎃 % — `킬/(킬+데스)×100`. 경기가 없으면 `null` */
  kd_rate: Percent.nullable(),
})
export type PlayerFormMonth = z.infer<typeof PlayerFormMonth>

export const PlayerFormTrend = z.enum(['rising', 'steady', 'falling', 'unknown'])
export type PlayerFormTrend = z.infer<typeof PlayerFormTrend>

/**
 * 선수 프로필 `최근 폼` (D-167).
 *
 * **원본에 없는 화면이다.** 사용자 요구로 추가했고, 판정 경계값은
 * `packages/contract/src/form.ts` 의 `FORM_TREND_THRESHOLD_PP` 하나에만 있다.
 *
 * 그래프(`months`)와 판정(`trend`)의 기준이 서로 다르다 —
 * 그래프는 최근 6개월, 판정은 최근 10경기다. 사용자 지시이며 통일하지 않는다.
 */
export const PlayerForm = z.object({
  /** 오래된 달 → 최신 달 순. 항상 `FORM_MONTHS` 개다 */
  months: z.array(PlayerFormMonth),
  trend: PlayerFormTrend,
  /** 판정에 실제로 쓴 최근 경기 수 (부족하면 `FORM_RECENT_GAMES` 보다 작다) */
  recent_games: Count,
  recent_kd_rate: Percent.nullable(),
  /** 비교 구간(최근 경기 바로 앞) 경기 수 */
  baseline_games: Count,
  baseline_kd_rate: Percent.nullable(),
  /** 최근 − 비교 (%p). 판정 불가면 `null` */
  delta: z.number().nullable(),
})
export type PlayerForm = z.infer<typeof PlayerForm>

/**
 * `오늘 퍼포먼스` 한 줄 (`docs/PLAYER_TRAITS_SPEC.md` 10절 · D-182).
 *
 * 계산과 문구는 `packages/contract/src/todayPerformance.ts` 한 곳에 있다.
 * **폼 판정은 킬데스만 본다** — 승률은 문구에만 들어간다 (사용자 지시).
 *
 * 최근 폼(`PlayerForm` · D-167)과 **다른 것**이다. 그쪽은 `최근 10경기 vs 직전 30경기`,
 * 이쪽은 `오늘 vs 시즌평균` 이다.
 */
/**
 * 하루치 성적 한 줄 (D-198).
 *
 * 모르는 값은 `null` 이다. **0 으로 채우지 않는다** — 0%는 "다 졌다" 는 뜻이고
 * `null` 은 "잴 수 없다" 는 뜻이다 (D-106).
 */
export const PlayerDayRecord = z.object({
  /** `YYYY-MM-DD` (오전 7시 KST 경계) */
  date: z.string(),
  /** 화면 표기 — `오늘` 또는 `8/16` */
  label: z.string(),
  /** 그날 경기가 있었나. `false` 면 화면이 `미접속` 을 적는다 */
  played: z.boolean(),
  games: z.number().int(),
  win: z.number().int(),
  lose: z.number().int(),
  win_rate: z.number().nullable(),
  kd_rate: z.number().nullable(),
  kill_per_match: z.number().nullable(),
})
export type PlayerDayRecord = z.infer<typeof PlayerDayRecord>

export const PlayerTodayPerformance = z.object({
  /** 오늘(KST) 뛴 래더 경기 전부 */
  games: Count,
  /** 그중 K/D 를 아는 경기 — 킬데스의 분모 */
  known_games: Count,
  win: Count,
  lose: Count,
  /** 오늘 경기가 없으면 `null` */
  win_rate: Percent.nullable(),
  /** K/D 를 아는 경기가 없으면 `null` — **0이 아니라 모르는 것이다** (D-106) */
  kd_rate: Percent.nullable(),
  /** 견준 기준 = 시즌 평균 킬데스 */
  season_kd_rate: Percent.nullable(),
  /** 오늘 − 시즌평균 (%p). 판정 불가면 `null` */
  delta: z.number().nullable(),
  trend: PlayerFormTrend,
  /** 화면에 그대로 쓰는 문구. 오늘 경기가 없으면 `오늘 경기기록 없음` */
  sentence: z.string(),
})
export type PlayerTodayPerformance = z.infer<typeof PlayerTodayPerformance>

/* -------------------------------------------------------------------------- */
/* 전투력 육각형 · 플레이스타일 바 (D-185)                                        */
/* -------------------------------------------------------------------------- */

/**
 * 육각형 꼭지점 하나 (`docs/PLAYER_TRAITS_SPEC.md` 4절).
 *
 * 판정·라벨은 `packages/contract/src/traits.ts` 한 곳에 있다.
 * `percentile` 이 `null` 이면 **0이 아니라 아직 모르는 축**이고, `pending` 이 그 이유다 (D-106).
 */
export const PlayerTraitAxis = z.object({
  key: z.enum(TRAIT_AXIS_KEYS),
  /** 주무기까지 반영한 화면 표기 (`스나싸움` / `샷싸움` …) */
  label: z.string(),
  /** 같은 무기 선수들 안에서의 백분위 0~100 */
  percentile: Percent.nullable(),
  pending: z.enum(TRAIT_PENDING_KEYS).nullable(),
})
export type PlayerTraitAxis = z.infer<typeof PlayerTraitAxis>

export const PlayerTraits = z.object({
  /** `0 = 라이플` · `1 = 스나이퍼`. 반반이면 `null` (traits.ts `mainWeaponOf`) */
  weapon: z.union([z.literal(0), z.literal(1)]).nullable(),
  /** 백분위를 낸 모집단 크기(같은 주무기 선수 수) */
  cohort: Count.nullable(),
  known_games: Count,
  /** 항상 6개 · `TRAIT_AXIS_KEYS` 순서 */
  axes: z.array(PlayerTraitAxis),
  measured: Count,
  measuring: z.boolean(),
})
export type PlayerTraits = z.infer<typeof PlayerTraits>

/**
 * 플레이스타일 바 한 줄 (8절 · D-182).
 *
 * `value` 는 `-100`(왼쪽) ~ `+100`(오른쪽)이고 `0` 이 `정석` 이다.
 * **`0` 과 `null` 은 다르다** — 0은 "재 봤더니 가운데", null은 "아직 못 잰다".
 */
export const PlayerPlaystyleBar = z.object({
  key: z.enum(PLAYSTYLE_SIDE_KEYS),
  side_label: z.string(),
  left_label: z.string(),
  center_label: z.string(),
  right_label: z.string(),
  value: z.number().min(-100).max(100).nullable(),
  pending: z.enum(TRAIT_PENDING_KEYS).nullable(),
})
export type PlayerPlaystyleBar = z.infer<typeof PlayerPlaystyleBar>

export const PlayerPlaystyle = z.object({
  /** 항상 2줄 — 블루(수비) · 레드(공격) */
  bars: z.array(PlayerPlaystyleBar),
  measuring: z.boolean(),
})
export type PlayerPlaystyle = z.infer<typeof PlayerPlaystyle>

export const LeaguePlayerDetail = LeaguePlayer.extend({
  league: LeagueSummary,
  /** 선수 프로필 — `PlayerSummary` + `position` · `note` (D-161) */
  player: LeaguePlayerProfile,
  /** 무기별 기록. 판정된 경기가 없으면 빈 배열이다 */
  weapon_stats: z.array(PlayerWeaponStat),
  /** 최근 20전 요약 + 상대 클랜별 전적 */
  match_summary: MatchSummary,
  /**
   * 최근 폼 — 6개월 월별 킬뎃 + 최근 10경기 판정 (D-167).
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 폼 블록을 **그리지 않는다** — 빈 그래프를 그리지 않는다.
   */
  form: PlayerForm.nullable().default(null),
  /**
   * 오늘 퍼포먼스 한 줄 (10절 · D-182).
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 이 줄을 **그리지 않는다**.
   * 오늘 경기가 없는 것과 **다르다** — 그때는 값이 있고 문구가 `오늘 경기기록 없음` 이다.
   */
  today: PlayerTodayPerformance.nullable().default(null),
  /**
   * **최근 3일치 일별 기록** (D-198 · 사용자 지시).
   *
   * 첫 줄은 **언제나 오늘**이다 — 경기가 없으면 `played: false` 이고 화면이 `미접속`을 적는다.
   * 그 아래는 **가장 최근에 경기한 날** 두 개다. 달력상 어제·그제가 아니라
   * **실제로 뛴 날**이라 날짜가 건너뛴다 (예: 오늘 · 8/16 · 8/8).
   *
   * 하루의 경계는 **오전 7시 KST** 다 (D-186).
   */
  recent_days: z.array(PlayerDayRecord).default([]),
  /**
   * 화면에 적을 **포지션 한 줄** (D-199). `스나수` · `2F` · `B리베` · `숏포지` 중 하나.
   *
   * 사람이 정한 값 > 주무기가 스나 > 좌표 판정 순으로 이긴다.
   * 아무것도 없으면 `null` 이고 화면은 그 줄을 그리지 않는다 — 지어내지 않는다.
   *
   * **그 판에 스나를 들었는지와 다른 값이다.** 그건 참가 기록의 무기 칸이다.
   */
  position_label: z.string().nullable().default(null),
  /** 그 값이 어디서 왔나 — `user` · `weapon` · `coords` */
  position_source: z.enum(['user', 'weapon', 'coords']).nullable().default(null),
  /**
   * 전투력 육각형 (4절 · D-185).
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 카드를 **그리지 않는다**. 축이 전부 `측정중` 인 것과 **다르다** —
   * 그때는 값이 있고 `measuring` 이 참이다.
   */
  traits: PlayerTraits.nullable().default(null),
  /** 플레이스타일 바 2줄 (8절 · D-185). 위와 같은 규칙이다 */
  playstyle: PlayerPlaystyle.nullable().default(null),
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
