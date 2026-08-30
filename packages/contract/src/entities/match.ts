import { z } from 'zod'
import { ClanMark, Count, Id, IsoDateTime, Percent, Rating, RatingUpdate, Slug } from '../common'
import { Division, TeamSide, Weapon } from '../codes'
import { ClanSummary, PlayerSummary } from './summaries'
import { GameMap } from './league'

/**
 * 매치 ID 규칙 (관측): `YYMMDDHHmmss` + 6자리 코드 (총 18자리).
 * 예) 260605000624124001 = 2026-06-05 00:06:24
 * 뒤 6자리 코드의 의미는 [미확인].
 *
 * **여기는 원본 그대로 18자리다 (D-155).**
 *   DB 는 같은 경기를 리그마다 다른 행으로 갖고, 그 행의 기본키에는 리그 slug 가 붙는다
 *   (`<18자리>@<리그slug>`). 그건 **우리 저장 사정**이라 밖으로 내보내지 않는다 —
 *   원본 3rd.supply 의 경기 URL 은 18자리 숫자뿐이고, 우리도 그래야 한다.
 *   응답에는 `Match.sourceMatchId`(= 원본 경기 번호)를 실어 보낸다.
 */
export const MatchId = z.string().regex(/^\d{18}$/, '매치 ID는 18자리 숫자입니다')

/**
 * **그 경기를 했을 당시** 소속 클랜 (D-131 · D-138).
 *
 * 현재 소속이 아니다. 선수가 이적해도 이 값은 변하지 않는다.
 *
 * 우리 리그 밖의 클랜일 수 있다. 그때는 **이름만 알고** `league_clan_id`·`slug`는 `null`이다 —
 * 빈 문자열로 있는 척하지 않는다 (그렇게 했다가 계약 검증이 깨져 목록이 통째로 비었다).
 */
export const MatchTimeClan = z.object({
  /** 우리 리그 클랜과 연결됐으면 그 id. 외부 클랜이면 `null` */
  league_clan_id: Id.nullable(),
  slug: Slug.nullable(),
  name: z.string(),
  mark: ClanMark,
  /**
   * 그 **경기 당시** 공식 1/2부 등록 클랜이었는가 (D-146).
   *
   * 현재 소속이 아니라 경기 당시 기준이다. 선수가 이적해도 과거 기록의 마크는 바뀌지 않는다.
   * 등록 클랜이 아니면 마크를 내보내지 않고 화면이 fallback 마크를 그린다.
   */
  is_official_clan: z.boolean().default(false),
})
export type MatchTimeClan = z.infer<typeof MatchTimeClan>

/**
 * 매치 상세의 플레이어 스탯.
 * 상대 클랜 소속 플레이어는 딜량·헤드샷이 결측되어 `null`로 내려온다(UI에서 `알수없음`).
 */
export const MatchPlayerStat = z.object({
  player_id: Id,
  name: z.string(),
  side: TeamSide,
  /**
   * 킬/데스/어시. **모르면 `null`(= 알수없음)** 이다 (D-148).
   * 3rd.supply 라인업으로 명단만 복원한 참가자는 넥슨 상세에 없어 KDA 가 없다.
   * 0으로 채우면 "0킬을 했다"는 거짓 정보가 되므로 채우지 않는다.
   */
  kill: Count.nullable(),
  death: Count.nullable(),
  assist: Count.nullable(),
  headshot: Count.nullable(),
  damage: Count.nullable(),
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent.nullable(),
  damage_percent: Percent.nullable(),
  headshot_percent: Percent.nullable(),
  /**
   * 무기. 수집원이 무기를 제공하지 않으면 `null`(= 알 수 없음)이다.
   * 넥슨 Open API에는 무기 정보가 없다 (`docs/DECISIONS.md` D-034).
   */
  weapon: Weapon.nullable(),
  /** 배치고사 진행중이면 래더 대신 `배치고사`를 표기하므로 null일 수 있다 */
  rating: Rating.nullable(),
  rating_update: RatingUpdate.nullable(),
  placement: z.boolean(),
  /** 탈주. **`false`는 "탈주하지 않았다"는 실제 정보다.** 모르면 `null` (D-034) */
  dropout: z.boolean().nullable(),
  win: z.boolean(),
  /** MVP. 모르면 `null` (D-034) */
  mvp: z.boolean().nullable(),
  /**
   * **그 경기를 했을 당시** 소속 클랜 (D-131).
   *
   * 현재 소속이 아니다. 선수가 이적해도 이 값은 변하지 않는다 —
   * 기록실과 경기 상세는 역사를 역사대로 보여 준다.
   * 근거가 없으면 `null`(= 알 수 없음)이다. 현재 소속으로 메우지 않는다.
   */
  match_time_clan: MatchTimeClan.nullable(),
  /**
   * 이 선수의 **고유 포지션** — `스나수` · `2F` · `B리베` · `숏` (D-199).
   *
   * ── 이건 "그 판에 무슨 총을 들었나" 가 **아니다**
   *   포지션은 여러 경기를 센 결과이고 경기마다 바뀌지 않는다. 그 판에 실제로
   *   스나를 들었는지는 바로 위 `weapon` 이 말한다 — 사용자 지시:
   *   **"스나수가 무조건 스나를 드는것만은 아니야"**.
   *   그래서 화면은 `누검 숏 (S)` 처럼 **둘을 나란히** 적는다.
   *   포지션으로 무기를 추측하거나 무기로 포지션을 만들지 않는다.
   *
   * ── 모르면 `null` 이고 화면은 **이름만** 적는다
   *   좌표 판정이 없거나 1·2등 격차가 좁으면(`POSITION_MIN_MARGIN`) 비운다.
   *   `-` 나 `알수없음` 으로 채우지 않는다 (D-106).
   *
   * ── 경기 **목록**에서는 채우지 않는다
   *   포지션을 붙이려면 선수마다 판정을 읽어야 해서, 한 페이지에 15경기 ×
   *   10명이면 왕복이 통째로 늘어난다. **펼친 경기 상세**(`red_stats`/`blue_stats`)
   *   에서만 채운다. 목록의 `player_stat` 은 `null` 이다 — mock 도 같다.
   *
   * 기본값이 있어 이 필드가 없던 응답과도 호환된다.
   */
  position_label: z.string().nullable().default(null),
})
export type MatchPlayerStat = z.infer<typeof MatchPlayerStat>

/** 매치 카드에 표시되는 라인업 항목 (스나이퍼는 `[S]` 표기) */
export const MatchLineupEntry = z.object({
  player_id: Id,
  name: z.string(),
  /** 수집원이 주지 않으면 `null` — `[S]` 표기 근거가 없다 (D-034) */
  weapon: Weapon.nullable(),
  dropout: z.boolean().nullable(),
  /** **그 경기 당시** 소속 클랜 (D-131). 현재 소속이 아니다 */
  match_time_clan: MatchTimeClan.nullable(),
})
export type MatchLineupEntry = z.infer<typeof MatchLineupEntry>

/** 매치 시점의 클랜 스냅샷 (당시 래더·부리그) */
export const MatchClanSnapshot = z.object({
  league_clan_id: Id,
  clan: ClanSummary,
  rating: Rating.nullable(),
  division: Division,
  placement: z.boolean(),
  /**
   * 이 경기에서 확인된 **본클랜원** 수 (D-081).
   * 클랜 래더 반영률이 이 값으로 정해지므로 화면에서 그대로 보여 준다.
   * 재구성 경기가 아니면 `null`.
   */
  members_confirmed: Count.nullable(),
  /** 확인된 용병 수. 용병도 개인 기록은 100% 받는다 (D-082) */
  mercenaries_confirmed: Count.nullable(),
  /**
   * 이 클랜의 **현재** 구성 보정 (D-149).
   *
   * 경기별 값이 아니다. 최근 20경기 평균 본클랜원 수로 정해지는 클랜 점수 가산이며
   * 상한은 +50 이다 (1명 +0 · 2명 +10 · 3명 +20 · 4명 +35 · 5명 +50, 사이는 선형).
   *
   * **경기 하나의 증감을 깎는 값이 아니다.** 예전의 반영률(100/70/40/0%)은 폐기됐다.
   * DB 에 계산돼 있는 값을 그대로 내보낸다 — 화면에서 다시 계산하지 않는다.
   */
  composition_score: z.number().nullable(),
  /** 그 보정을 만든 입력값 — 최근 20경기 평균 본클랜원 수 */
  composition_members: z.number().nullable(),
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
  /** 수집원이 종료 시각을 주지 않으면 `null` (D-034) */
  end_at: IsoDateTime.nullable(),
  /** 플레이 시간(초). 모르면 `null` (D-034) */
  play_time: Count.nullable(),
  win: z.boolean(),
  /**
   * 보는 쪽(`league_clan`)이 **전반에 선 진영** — 화면의 `선레드` / `선블루` (D-207).
   *
   * ── 뜻은 확정됐다 (2026-08-30 사용자)
   *   ```
   *   선레드 = 레드진영(공격)을 먼저 한 팀   → 'red'
   *   선블루 = 블루진영(수비)을 먼저 한 팀   → 'blue'
   *   ```
   *   더 이상 `[미확인]` 이 아니다.
   *
   * ── 여기의 `red`/`blue` 는 **진영**이지 `red[]`/`blue[]` 라인업 슬롯이 아니다
   *   우리 `red`/`blue` 라인업 배열은 수집 시 `team_id` 오름차순으로 채운 **내부 슬롯**이고
   *   (`apps/worker/src/lib/projectionRule.ts` 의 `assignSides()`), 실측 결과 그 `red` 슬롯은
   *   3,750경기 중 3,745경기(99.87%)에서 **전반 수비**였다. 즉 슬롯 이름을 그대로
   *   `선레드` 로 읽으면 표기가 뒤집힌다 — 예전 화면이 실제로 그랬다.
   *   이 필드는 슬롯이 아니라 **배틀로그 폭탄 근거**(D-184)가 정한 값이다.
   *
   * ── `win` 과 같이 **보는 쪽 기준**이다
   *   상대 팀은 항상 반대다. 한 경기에 `선레드` 와 `선블루` 가 하나씩 있다.
   *
   * ── 모르면 `null` 이고, 화면은 **아무것도 적지 않는다**
   *   `알수없음` 으로도 채우지 않는다. 근거가 없는데 라벨을 붙이던 것이 이번 결함이었다 (D-106).
   */
  first_side: z.enum(['red', 'blue']).nullable(),
  placement: z.boolean(),
  rating_update: RatingUpdate.nullable(),
  mvp_player_id: Id.nullable(),
  league_clan: MatchClanSnapshot,
  opponent: MatchClanSnapshot,
  red: z.array(MatchLineupEntry),
  blue: z.array(MatchLineupEntry),
  player_stat: MatchPlayerStat.nullable(),
  /**
   * 재구성 경기의 **확인 수준** (`"5v4"`). 재구성이 아니면 `null` (Phase 9 · D-068).
   *
   * 우리가 5명 전원을 확인한 경기와 4명만 확인한 경기를 화면에서 구분하기 위한 값이다.
   * 모르는 것을 아는 척하지 않는다.
   */
  participant_completeness: z.string().nullable(),
  /** 확인 수준 등급. 재구성이 아니면 `null` */
  evidence_confidence: z.enum(['high', 'medium', 'low']).nullable(),
  /*
   * `official` 은 **공개 계약에서 뺐다** (D-149).
   *
   * D-079·D-080 시절에는 이 값이 통계·래더 반영 여부를 정했다.
   * **D-145 에서 그 규칙이 폐기됐다** — 기준은 정상 5v5 인가 하나뿐이다.
   * 그런데 필드를 남겨 두면 화면이 다시 `공식/비공식` 배지를 그리게 되고,
   * 사용자는 "비공식이라 점수를 덜 준다"고 읽는다. 실제로 그랬다.
   *
   * DB 의 `Match.official` 은 **지우지 않았다.** 출처(provenance)와 관리자 화면에서
   * 계속 쓴다 (`/api/admin/matches`). 일반 사용자 응답에만 넣지 않는다.
   *
   * 래더 반영 여부는 `participant_completeness` 로 판정한다 (`officialCopy.isRated`).
   */
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
