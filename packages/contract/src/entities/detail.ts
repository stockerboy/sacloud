import { z } from 'zod'
import { Count, Percent } from '../common'
import { PLAYSTYLE_SIDE_KEYS, TRAIT_AXIS_KEYS, TRAIT_PENDING_KEYS } from '../traits'
import { WeeklyTrend } from '../weekly'
import { ClanMetrics } from '../clanMetrics'
import { ClanRoundMetrics } from '../clanRoundMetrics'
import { ClanHexagon } from '../clanTraits'
import { ClanHexagonV2 } from '../clanTraitsV2'
import { ClanRoster } from '../clanRoster'
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
/* 티어별 게임빈도 + 천적 (`docs/SITE_SPEC_V2.md` 4절)                            */
/* -------------------------------------------------------------------------- */

/**
 * 한 티어의 **천적** 한 곳.
 *
 * 조건(50판 · 승률 70%)과 개수 상한은 `packages/contract/src/tierBreakdown.ts`
 * 한 곳에만 있다. 여기 다시 적지 않는다.
 *
 * `slug` 를 함께 내리는 것은 화면이 클랜 기록실로 보내 주기 때문이다 —
 * 사이트의 다른 클랜명이 전부 그렇게 동작한다(최근매치의 `vs 상대클랜`).
 */
export const PlayerTierNemesis = z.object({
  name: z.string(),
  slug: z.string(),
  games: Count,
  win: Count,
  lose: Count,
  /** 천적은 항상 50판 이상이라 승률이 `null` 일 수 없다 */
  win_rate: Percent,
})
export type PlayerTierNemesis = z.infer<typeof PlayerTierNemesis>

/**
 * 티어 한 줄 — `vs 1티어 381판 승률 52.3% · vuvuzela 의 천적`.
 *
 * 티어는 **경기 당시** 상대 클랜의 division 이다 (`opponentDivisionAtMatch`).
 * 지금의 division 을 쓰면 상대가 승격·강등하는 순간 과거 경기가 오염된다
 * (`CLAUDE.md` 3-B 4번).
 *
 * **판수가 0인 티어도 줄이 온다.** 사양 원문이 `vs4티어 0판` 을 적었다 —
 * "한 번도 안 붙었다" 는 것도 정보라서 줄을 지우지 않는다.
 */
export const PlayerTierRecord = z.object({
  /** 1부터. 리그의 `division_count` 만큼 온다 */
  tier: z.number().int().min(1),
  games: Count,
  win: Count,
  lose: Count,
  /**
   * 10판 미만이면 `null` 이고 화면은 `—` 를 적는다 (D-106).
   * **0 이 아니다** — 0%는 "다 졌다", `null` 은 "아직 말하지 않는다" 는 뜻이다.
   */
  win_rate: Percent.nullable(),
  /** 조건을 넘은 클랜만. 없으면 빈 배열이다 */
  nemeses: z.array(PlayerTierNemesis),
})
export type PlayerTierRecord = z.infer<typeof PlayerTierRecord>

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
   * **티어별 게임빈도 + 천적** (`docs/SITE_SPEC_V2.md` 4절).
   *
   * 항상 리그의 `division_count` 개다 — 판수가 0인 티어도 줄이 온다.
   * 이 필드가 없던 응답과도 맞도록 기본값을 빈 배열로 둔다.
   * 빈 배열이면 화면은 카드를 **그리지 않는다**.
   */
  tier_breakdown: z.array(PlayerTierRecord).default([]),
  /**
   * 화면에 적을 **포지션 한 줄** (D-199). `스나수` · `2F` · `B리베` · `숏` 중 하나.
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
  /**
   * **주간 추이 그래프** (2026-09-02 사용자 지시).
   *
   * 규칙(누적 · 월요일 07:00 KST 경계 · 안 뛴 주는 수평선 · 순위)은 전부
   * `packages/contract/src/weekly.ts` 에 있다. 여기는 담기만 한다.
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 그래프 카드를 **그리지 않는다** — 빈 그래프를 그리지 않는다.
   */
  weekly: WeeklyTrend.nullable().default(null),
  /** 최근 같이한 플레이어 승률 */
  teammates: z.array(TeammateStat),
})
export type LeaguePlayerDetail = z.infer<typeof LeaguePlayerDetail>

/** GET /leagues/{leagueSlug}/clans/{clanSlug}/show */
export const LeagueClanShow = LeagueClanDetail.extend({
  match_summary: MatchSummary,
  /** 최근 클랜전에 참여한 플레이어 승률 */
  teammates: z.array(TeammateStat),
  /**
   * 클랜 지표 — 티어별 승률 · 승률 추이 · 화력 · 최다연승
   * (`docs/SITE_SPEC_V2.md` 5절 · `../clanMetrics`).
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 카드를 **그리지 않는다** — 빈 표를 그리지 않는다 (D-106).
   */
  metrics: ClanMetrics.nullable().default(null),
  /**
   * 클랜원 정리 — 포지션별 · 1군/2군 (`docs/SITE_SPEC_V2.md` 5-2 · `../clanRoster`).
   *
   * 기존 클랜원 목록(`/league/{slug}/clan/{slug}/player`)을 **대체하지 않는다.**
   * 그쪽은 그대로 두고 이 정리를 새 섹터로 얹는다 — 방식을 바꿀 때 앞 버전도
   * 남긴다는 사용자 지시다.
   *
   * 클랜원이 없으면 `null` 이고 화면은 카드를 **그리지 않는다** (D-106).
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   */
  roster: ClanRoster.nullable().default(null),
  /**
   * 배틀로그 지표 — 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 · 클린시트
   * (`docs/SITE_SPEC_V2.md` 5-5절 · `../clanRoundMetrics`).
   *
   * `metrics` 와 나누는 이유: 저쪽은 `Match` 만으로 되고 이쪽은 **병영수첩 배틀로그**가
   * 있어야 한다. 한 클랜이 한쪽만 갖는 일이 흔해서 한 필드로 묶으면 절반이 비어 온다.
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 카드를 **그리지 않는다** — 빈 표를 그리지 않는다 (D-106).
   */
  round_metrics: ClanRoundMetrics.nullable().default(null),
  /**
   * 클랜 육각형 (`docs/SITE_SPEC_V2.md` 5-5절의 `6각형` · `../clanTraits`).
   *
   * 여섯 축은 `round_metrics` 와 **같은 재료**이고, 그 값들을 같은 리그 클랜들 안에서
   * 백분위로 다시 잰 것이다. 그림은 넓이로 정도를 보여 주므로 `round_metrics` 의
   * 숫자와 나란히 두어도 겹치지 않는다 — 하나는 값이고 하나는 상대 위치다.
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   */
  hexagon: ClanHexagon.nullable().default(null),
  /**
   * 클랜 육각형 **V2** — 스나싸움 · 소수싸움 · 세이브 · 게임템포 · B어택성공 · A어택성공
   * (`docs/CLAN_HEXAGON_V2_SPEC.md` · D-217 · **D-235** · `../clanTraitsV2`).
   *
   * ── **옛 `hexagon` 을 지우지 않는다** (D-235 Q9 · `CLAUDE.md` 10-4)
   *   축 여섯이 통째로 다르고 재료도 다르다 — 옛 판은 `ClanRoundProfile`(경기 요약 +
   *   배틀로그), 이쪽은 `MatchClanHexV2`(배틀로그만)다. 방식을 바꿀 때 앞 버전도 남긴다.
   *   ⚠ `게임템포` 는 **이름만 같고 다른 지표**다 (옛: 라운드 길이 중앙값 / 새: 레드일 때
   *   상대 3명 지우기까지 걸린 초의 하한). **한 화면에 나란히 놓지 않는다.**
   *
   * 값은 같은 리그 클랜들 안에서의 **백분위**(0~1)다 (D-235 Q8). 경기 상세의 육각형과
   * 정규화 기준이 다르다 — 그쪽은 그 경기 두 클랜의 **상대 비교**다 (Q7).
   *
   * 이 필드가 없던 응답과도 맞도록 기본값을 `null` 로 둔다.
   * `null` 이면 화면은 카드를 **그리지 않는다** — 배틀로그를 아직 못 받은 클랜이다.
   * 여섯 축이 전부 `측정중` 인 것과 **다르다**: 그때는 값이 있고 `measured` 가 0 이다.
   */
  hexagon_v2: ClanHexagonV2.nullable().default(null),
})
export type LeagueClanShow = z.infer<typeof LeagueClanShow>
