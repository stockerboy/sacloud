/**
 * 선수 **주간 추이** — 그래프 카드의 재료 (2026-09-02 사용자 지시).
 *
 * ── 여기서 세지 않는다
 *   접는 규칙(누적 · 주 경계 · 안 뛴 주 · 결측 처리)은 전부
 *   `packages/contract/src/weekly.ts` 의 `foldWeekly()` 하나에 있다.
 *   Mock 도 **같은 함수**를 부른다 — 두 곳에서 따로 세면 mock ↔ live 대조가 어긋난다.
 *   이 파일이 하는 일은 **이미 읽어 둔 행을 그 함수가 아는 모양으로 넘기는 것**뿐이다.
 *
 * ── ★DB 를 한 번도 더 읽지 않는다★
 *   `playerLadderRows()` 가 이 선수의 래더 참가 기록을 이미 전부 들고 있다
 *   (누적 · 폼 · 오늘 · 최근3일 · 티어별이 같은 행을 나눠 쓴다 — 그 파일 머리말).
 *   운영은 `connection_limit=1` 이라 왕복 한 번이 그대로 응답 시간이다 (D-239).
 *
 * ── 모집단은 화면의 다른 수치와 같다
 *   `withLadderMatch` + 시즌0 창. 여기만 다르게 세면 같은 카드 안에서
 *   그래프의 마지막 점과 아래 적힌 누적 승률이 어긋난다.
 */
import {
  foldWeekly,
  kdRateOrNull,
  kstDayStart,
  winRateOrNull,
  WEEKLY_MAX_WEEKS,
  type WeeklyTrend,
} from '@sacloud/contract'
import type { PlayerLadderRow } from './playerLadderRows'

export function buildPlayerWeekly(
  rows: readonly PlayerLadderRow[],
  now: Date = new Date(),
  weeks: number = WEEKLY_MAX_WEEKS,
): WeeklyTrend {
  return foldWeekly(rows, now, weeks, kstDayStart, kdRateOrNull, winRateOrNull)
}
