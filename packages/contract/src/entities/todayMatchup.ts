import { z } from 'zod'

/**
 * ★★오늘의 상대전적★★ — 클랜랭킹 맨 위 카드 (2026-09-22 사장님).
 *
 *   «매일 특정 시간 구간 동안 ★등록된 클랜끼리 서로 가장 많은 경기를 치른 매치업★ 1개를
 *     자동으로 찾아 클랜랭킹 상단에 실시간 상대전적으로 보여준다»
 *
 * 하루의 경계는 ★매일 15:00 KST★ 다. 세는 법과 그 이유는
 * `apps/web/lib/server/queries/todayTopMatchup.ts` 머리글에 있다.
 * ★여기는 모양만 정한다.★
 *
 * ⚠ ★오늘 경기가 없으면 `matchup` 이 `null` 이다.★ 가짜 매치업을 만들지 않는다
 *   (`CLAUDE.md` 2장 1번). 화면은 그때 「오늘 아직 집계된 클랜 상대전적이 없습니다」를 쓴다.
 */
export const TodayMatchupClan = z.object({
  league_clan_id: z.string(),
  slug: z.string(),
  name: z.string(),
  /** 클랜마크 — 없으면 `null` 이고 화면은 구름을 쓴다 */
  mark_bg_url: z.string().nullable().default(null),
  mark_front_url: z.string().nullable().default(null),
})

export const TodayMatchupGame = z.object({
  match_id: z.string(),
  /** KST ISO. 그래프의 X 자리를 이 값이 정한다 */
  start_at: z.string(),
  /** `true` 면 `a` 가 이긴 판이다. 승자를 모르는 경기는 애초에 안 담긴다 */
  a_won: z.boolean(),
})

export const TodayMatchup = z.object({
  /** 집계 구간 (KST ISO) — 화면의 X축 양 끝이다 */
  from: z.string(),
  to: z.string(),
  a: TodayMatchupClan,
  b: TodayMatchupClan,
  a_win: z.number().int().min(0),
  b_win: z.number().int().min(0),
  total: z.number().int().min(0),
  /**
   * ★시간순★ 이다. 화면은 이걸 앞에서부터 훑어 ★그 시점까지의 누적 승률★ 을 만든다 —
   * 마지막 승률만 주면 사장님이 말씀하신 「승률 변화 과정」 을 그릴 수 없다.
   */
  games: z.array(TodayMatchupGame).default([]),
})

export const TodayMatchupResponse = z.object({
  /** 오늘 등록 클랜끼리의 경기가 하나도 없으면 `null` */
  matchup: TodayMatchup.nullable().default(null),
})

export type TodayMatchupClan = z.infer<typeof TodayMatchupClan>
export type TodayMatchupGame = z.infer<typeof TodayMatchupGame>
export type TodayMatchup = z.infer<typeof TodayMatchup>
export type TodayMatchupResponse = z.infer<typeof TodayMatchupResponse>
