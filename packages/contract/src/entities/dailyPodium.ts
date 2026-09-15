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
  /**
   * ★그날 육각★ — ★그 하루에 뛴 경기만★ 으로 만든 여섯 축 (2026-09-15 사장님:
   * «개인랭킹도 그렇고 클랜랭킹도 그렇고 저렇게 두지 말고 그 날 1,2,3위 육각그래프를
   *  띄워달라고 / 누적 1,2,3등말고 / 그 날 한 경기 데이터로만 분석해서 육각축 만들어달라고»).
   *
   * ⚠ ★시즌 누적이 아니다.★ 백분위도 ★그날 뛴 사람·클랜 안에서★ 낸다 —
   *   시즌 분포를 쓰면 «오늘 잘한 쪽» 이 아니라 «원래 잘하는 쪽» 이 나온다.
   *
   * 못 잰 축이 있으면 빈 배열이다 (그런 줄은 애초에 셋에 못 든다).
   */
  axes: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        /** 원값 — 축마다 단위가 다르다 (`unit`) */
        value: z.number().nullable(),
        /** 그날 안에서의 백분위 (0~100) — 그래프 면적은 이것으로 그린다 */
        pct: z.number().nullable(),
        unit: z.enum(['percent', 'per_game', 'seconds']),
        /**
         * ★그날 안에서의 등수★ (2026-09-15 사장님 «퍼센트 말고 순위로 해주면 안돼?»).
         * 시즌 등수가 아니다. `total` 은 그날 그 축을 잴 수 있었던 수다.
         * 못 재면 둘 다 `null` 이고 화면은 «측정중» 이라 적는다.
         */
        rank: z.number().nullable().default(null),
        total: z.number().nullable().default(null),
      }),
    )
    .default([]),
})
export type DailyPodiumRow = z.infer<typeof DailyPodiumRow>

export const DailyPodium = z.object({
  /** 기준일 (KST `YYYY-MM-DD`). 경기가 하나도 없으면 `null` */
  day: z.string().nullable().default(null),
  players: z.array(DailyPodiumRow),
  clans: z.array(DailyPodiumRow),
})
export type DailyPodium = z.infer<typeof DailyPodium>
