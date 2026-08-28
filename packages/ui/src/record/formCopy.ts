import type { PlayerFormTrend } from '@sacloud/contract'

/**
 * `최근 폼` 판정 문구 (D-167).
 *
 * 세 문구는 **사용자가 직접 지정한 표현**이다. 다듬거나 존댓말/어미를 바꾸지 않는다.
 * 원본(3rd.supply)에는 이 문구도 이 판정도 없다 — 원본과 동일함이 검증되지 않았다.
 *
 * `unknown` 은 사용자가 주지 않은 네 번째 경우다.
 * 경기가 부족한 선수를 셋 중 하나로 밀어 넣지 않기 위해 만들었다 (D-106) —
 * 3경기 뛴 선수에게 `꾸준한 퍼포먼스` 라고 말하면 그건 거짓이다.
 */
export const FORM_TREND_TEXT: Record<PlayerFormTrend, string> = {
  rising: '최근 폼이 급상승중입니다',
  steady: '최근 꾸준한 퍼포먼스를 보여줍니다',
  falling: '최근 퍼포먼스가 하락중입니다',
  unknown: '최근 폼을 판정할 경기가 부족합니다',
}

/**
 * 판정 문구 색.
 *
 * 연승/연패 문구(`streakClass`)와 **같은 토큰 계열**을 쓴다 — 새 색을 만들지 않는다.
 * `꾸준` 과 `부족` 은 좋고 나쁨이 아니라서 색을 주지 않는다.
 */
export const FORM_TREND_CLASS: Record<PlayerFormTrend, string> = {
  rising: 'text-win',
  steady: '',
  falling: 'text-lose',
  unknown: 'text-meta',
}

/** `2026-03` → `3월` (KST 기준 키를 그대로 읽는다) */
export function formMonthLabel(month: string): string {
  const parsed = Number(month.slice(5, 7))
  return Number.isNaN(parsed) ? month : `${parsed}월`
}
