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
  /** 참여중인 리그 카드가 `17,855킬 17,422데스`를 표시한다 (원본 관측).
      무소속리그 카드에서는 이 셋만 `null`이다 — 나머지 기록은 그대로 나온다 (D-107) */
  kill: Count.nullable(),
  death: Count.nullable(),
  /** 킬뎃 % — `킬 / (킬 + 데스) × 100` (원본 실측 확정) */
  kd_rate: Percent.nullable(),
  /**
   * ★점수 래더★ — 경기당 평균 점수 (2026-09-20 사장님: 「래더 총점만 기본정보에 써줘
   * ★보정대상은 보정후의 점수로★ 써줘 그리고 ★래더 3000점 부터 하지말고 0점부터★」).
   *
   *   값은 ★소수 한 자리★ 다 (22.1). DB 는 ×100 정수 칸에 담고 서버가 나눈다 —
   *   `LeagueRankEntry.score_rating` 과 ★같은 값·같은 규칙★ 이다.
   *
   * ⚠ ★상위권 보정이 이미 들어 있다★ — 얼마인지는 `score_bonus` 가 따로 안다.
   * ⚠ ★못 잰 사람은 `null`★ 이다 (D-106). `score_games` 가 문턱에 못 미치면 그렇다.
   * ⚠ ★`rating`(옛 Elo)을 지우지 않는다★ (CLAUDE.md 1-4) — 되돌릴 때 재계산이 없어야 한다.
   *
   * ⚠ ★`.default(null)` 을 둔다★ — 이 칸을 안 채우는 자리가 있다(mock·지난시즌).
   *   기본값이 없으면 그 자리마다 손으로 적어야 하고 하나만 빠뜨려도 통째로 깨진다.
   */
  score_rating: z.number().nullable().default(null),
  /** ★상위권 보정★ 으로 더해진 점수 (경기당). 안 받았으면 0 */
  score_bonus: z.number().default(0),
  /** 그 평균에 들어간 경기 수 */
  score_games: Count.default(0),
  /**
   * ★무기별 판수★ (2026-09-21 사장님: 「기본정보에 ★스나수인지 라플수인지★ 써주고」).
   *
   *   선수 머리 카드가 「스나 킬뎃 ★11판★」 으로 적는 것과 ★같은 값★ 이다 —
   *   `LeaguePlayerTierStat` 의 부(division)별 줄을 ★전부 더한 수★ 다.
   *
   * ⚠ ★안 재어진 리그는 0 이다★ — 스나도 라플도 0 이면 화면이 칸을 안 그린다.
   *   0 을 「스나 0판」 이라고 적지 않는다 (D-106 의 정신).
   */
  sniper_games: Count.default(0),
  rifle_games: Count.default(0),
  /** 배치고사 진행중이면 true (랭킹·래더 대신 `배치고사` 표기) */
  placement: z.boolean(),
  rank: Count.nullable(),
  rank_count: Count.nullable(),
})
export type PlayerLeagueEntry = z.infer<typeof PlayerLeagueEntry>

/**
 * **선수 화면이 한 번에 받는 것** (2026-09-03 · O-034).
 *
 * ══ 왜 합치나 ══
 *
 * 선수 화면은 열릴 때마다 요청을 **둘** 쏜다 — `playerShow` + `playerLeagues`.
 * 둘 다 같은 사람 것이고 항상 같이 쓰인다.
 *
 * 공개일에 천 명이 각자 **자기 닉과 친구 닉**을 친다. 서로 다른 캐시 키가 수천 개고
 * **전부 첫 방문이라 전부 엣지를 지나 DB 로 간다.** 캐시가 고장난 게 아니다 —
 * 두 번째부터는 `HIT` 이 뜬다(오세라 실측). **문제는 「첫 번째」의 개수다.**
 *
 * ```
 * 전   요청 2 · 람다 2 · 캐시 키 2 · DB 접속 2   (자리는 5개다)
 * 후   요청 1 · 람다 1 · 캐시 키 1 · DB 접속 1
 * ```
 * ⚠ **DB 질의 수는 안 준다** — 같은 질의를 한 요청 안에서 할 뿐이다.
 *   줄어드는 것은 **접속 자리를 잡는 횟수**이고, 자리가 5개뿐이라 그게 병목이다.
 *
 * ⚠ **옛 경로 둘은 그대로 산다** (`CLAUDE.md` 10-4). 이건 더한 것이지 바꾼 것이 아니다.
 */
export const PlayerProfile = z.object({
  player: Player,
  leagues: z.array(PlayerLeagueEntry),
})
export type PlayerProfile = z.infer<typeof PlayerProfile>

/** GET /players/search/{q} — 자동완성 결과 */
export const PlayerSearchItem = PlayerSummary.extend({
  clan: ClanSummary.nullable(),
})
export type PlayerSearchItem = z.infer<typeof PlayerSearchItem>
