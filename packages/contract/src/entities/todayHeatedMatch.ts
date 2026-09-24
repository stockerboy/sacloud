import { z } from 'zod'
import { MatchListItem } from './match'

/**
 * ★그 날 가장 치열했던 경기★ (2026-09-24 사장님 「경기분석에서 라운드별 분석 그거를 여기 펼쳐놔줘
 * (그 날 하루 가장 치열하게 경기한 게임 - 라운드가 많을수록 치열)」).
 *
 * 리그홈의 「상대전적」 자리를 대신한다 — 같은 자리, 다른 기준(오늘 최다맞대결 → 오늘 최다라운드).
 * 오늘 라운드 집계가 잡힌 경기가 하나도 없으면 `match` 가 `null` 이다(가짜를 만들지 않는다).
 */
export const TodayHeatedMatchResponse = z.object({
  match: MatchListItem.nullable().default(null),
})
export type TodayHeatedMatchResponse = z.infer<typeof TodayHeatedMatchResponse>
