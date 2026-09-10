/**
 * SACLOUD 랭킹 색상 규칙 (승인본)
 * ---------------------------------------------------------------
 * 두 가지 규칙이 있고, 적용 대상이 다르다. 섞어 쓰지 말 것.
 *
 *  1) rankColor(rank)  — 등수(순위 숫자)와 닉네임에 적용
 *  2) statColor(value) — 등수를 제외한 모든 0~100 스케일 수치
 *                        (승률, 킬뎃, 헤드샷 등)에 적용
 */

/* ── 1) 등수 · 닉네임 색상 ───────────────────────────── */

export const RANK_COLORS = {
  top3:   '#ff4d4d', // 1~3위      빨강
  top20:  '#ffd83d', // 4~20위     노랑
  top40:  '#5b9dff', // 21~40위    파랑
  top100: '#22c55e', // 41~100위   초록
  rest:   '#ffffff', // 101위~     하양
} as const;

/**
 * 등수에 따른 색.
 * **순위 숫자와 닉네임 모두 이 함수 하나를 쓴다** (두 값이 항상 같은 색).
 */
export function rankColor(rank: number): string {
  if (rank <= 3)   return RANK_COLORS.top3;
  if (rank <= 20)  return RANK_COLORS.top20;
  if (rank <= 40)  return RANK_COLORS.top40;
  if (rank <= 100) return RANK_COLORS.top100;
  return RANK_COLORS.rest;
}

/** 별칭 — 닉네임에 쓸 때 의도가 드러나도록. 동작은 rankColor 와 동일. */
export const nameColor = rankColor;

/* ── 2) 수치 색상 ────────────────────────────────────── */

export const STAT_COLORS = {
  red:    '#e01b24', // ~39.9
  white:  '#ffffff', // 40 ~ 49.9
  green:  '#22c55e', // 50 ~ 54.9
  brown:  '#a06a35', // 55 ~ 59.9
  blue:   '#5b8dff', // 60 ~ 64.9
  yellow: '#f5c518', // 65 ~ 100
} as const;

/**
 * 0~100 스케일 수치의 색.
 * 등수에는 절대 쓰지 않는다 (등수는 rankColor).
 * 래더 점수(3,800점)처럼 0~100 스케일이 아닌 값도 대상이 아니다 → 흰색으로 둔다.
 */
export function statColor(value: number): string {
  if (Number.isNaN(value)) return '#8a8a93';
  if (value < 40)  return STAT_COLORS.red;
  if (value < 50)  return STAT_COLORS.white;
  if (value < 55)  return STAT_COLORS.green;
  if (value < 60)  return STAT_COLORS.brown;
  if (value < 65)  return STAT_COLORS.blue;
  return STAT_COLORS.yellow;
}

/* ── 사용 예 ─────────────────────────────────────────── */
//
// <span style={{ color: rankColor(row.rank) }}>{row.rank}</span>
// <span style={{ color: nameColor(row.rank) }}>{row.name}</span>
// <span style={{ color: statColor(row.winRate) }}>{row.winRate.toFixed(1)}</span>
// <span style={{ color: statColor(row.kd) }}>{row.kd.toFixed(1)}</span>
// <span>{row.ladder.toLocaleString()}점</span>   // 규칙 밖 — 흰색
