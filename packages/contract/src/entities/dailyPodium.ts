import { z } from 'zod'

/**
 * ★오늘의 셋★ — 그날 클랜전을 뛴 사람·클랜 중 「고르게 잘하고 승률도 좋은」 셋 (2026-09-14 사장님).
 *
 *   «IPL이랑 SPL 개인랭킹이랑 클랜랭킹 둘 다 그 날 클랜전한 인원들을 일열로 세워서
 *     ★육각축이 고르게 전부 잘한 사람 + 승률도 좋아야함★ 3명 그리고 3개씩 뽑아서
 *     올려주는거 어때? 그 날 승률이랑 킬뎃 적어주고
 *     (★IPL도 여기에만 예외로 킬뎃 적어줌★)»
 *
 * 재는 법과 그 이유는 `apps/web/lib/server/queries/dailyPodium.ts` 머리글에 있다.
 * 여기는 ★모양만★ 정한다.
 */
export const DailyPodiumRow = z.object({
  /** 1~3 */
  rank: z.number().int().min(1),
  name: z.string(),
  /** 사람 줄이면 그 사람의 클랜, 클랜 줄이면 자기 자신. 무소속이면 `null` */
  clan: z
    .object({
      name: z.string(),
      slug: z.string(),
      mark: z.object({ bg: z.string().nullable(), front: z.string().nullable() }),
    })
    .nullable()
    .default(null),
  player_id: z.string().nullable().default(null),
  clan_slug: z.string().nullable().default(null),
  games: z.number().int(),
  win: z.number().int(),
  lose: z.number().int(),
  /** 그날 승률 (%) */
  win_rate: z.number(),
  /**
   * 그날 킬뎃 (%) — 데스가 0이면 `null`.
   * ★IPL 도 여기에만 적는다★ — 사장님이 콕 집어 예외로 두셨다.
   */
  kd_rate: z.number().nullable().default(null),
  /** 여섯 축 중 ★가장 낮은 축★ 의 백분위 — «약점 없음» 의 크기다 */
  low_axis: z.number(),
  /** 그 축 이름 */
  low_axis_label: z.string(),
  /** 여섯 축 평균 */
  avg_axis: z.number(),
})
export type DailyPodiumRow = z.infer<typeof DailyPodiumRow>

export const DailyPodium = z.object({
  /** 기준일 (KST `YYYY-MM-DD`). 경기가 하나도 없으면 `null` */
  day: z.string().nullable().default(null),
  players: z.array(DailyPodiumRow),
  clans: z.array(DailyPodiumRow),
})
export type DailyPodium = z.infer<typeof DailyPodium>
