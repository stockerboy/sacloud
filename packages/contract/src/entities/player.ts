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
