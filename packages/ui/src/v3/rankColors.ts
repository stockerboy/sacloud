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
  /* ★1~100위는 한 색★ — 밝은 노랑 (2026-09-11 사장님) */
  if (rank <= 100) return RANK_COLORS.top20;
  return RANK_COLORS.rest;
}

/** ★옛 방식★ — 3 / 20 / 40 / 100 네 단계. 지우지 않는다 (`CLAUDE.md` 1-4) */
export function rankColorV2(rank: number): string {
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
  /* ★2026-09-11 사장님: «갈색 숫자색 좀 밝은 갈색으로»★. 옛 값 #a06a35 */
  brown:  '#c08a5a', // 55 ~ 59.9
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

/* ── 3) 층수(실력 점수) 색 ──────────────────────────── */

/**
 * ★층수 색 — 2층마다 한 칸★ (2026-09-12 사장님: «2층 단위로 색 바꾸자», 순서는 맡기셨다)
 *
 * ── 왜 26~46층인가 (지어낸 범위가 아니다)
 *   2026-09-12 IPL 875명 실측 분포 —
 *   ```
 *   34~36층     5명   상위 1%
 *   32~34층    54명   상위 7%
 *   30~32층   353명   상위 47%
 *   28~30층   448명   상위 98%
 *   26~28층    15명   상위 100%
 *   ```
 *   ★전원이 26~36층 안★ 이고 28~32층에 91%가 몰려 있다. 그래서 그 구간을
 *   ★초록 → 연두 → 하늘★ 로 잘게 갈라 같은 구간 안에서도 서로 구분되게 했다.
 *   40층 위는 아직 아무도 없지만 자리를 비워 둔다 — 시즌이 길어지면 올라온다.
 *
 * ── 색 순서
 *   아래는 차갑게 · 위는 뜨겁게. 한 번 보면 규칙을 외울 필요가 없다.
 *
 * ⚠ 옛 판(5층 단위 · 45/40/35/30)은 `floorColorV1` 로 남긴다 (`CLAUDE.md` 1-4).
 *   그 판은 실측 분포에서 ★98%가 한 색★ 이라 색이 일을 하지 않았다.
 */
export const FLOOR_STEPS: readonly (readonly [number, string])[] = [
  [46, '#ff0033'], // 46층 ~      불빨강
  [44, '#ff2d2d'], // 44 ~ 45.9   빨강
  [42, '#ff8a3d'], // 42 ~ 43.9   주황
  [40, '#ffd83d'], // 40 ~ 41.9   노랑
  [38, '#ff6fb5'], // 38 ~ 39.9   분홍
  [36, '#a78bfa'], // 36 ~ 37.9   보라
  [34, '#5b8dff'], // 34 ~ 35.9   파랑
  [32, '#63d9ff'], // 32 ~ 33.9   하늘
  [30, '#a3e635'], // 30 ~ 31.9   연두
  [28, '#22c55e'], // 28 ~ 29.9   초록
  [26, '#ffffff'], // 26 ~ 27.9   하양
] as const;

/** 26층 아래 — 아직 표본이 거의 없는 자리 */
export const FLOOR_BELOW = '#8a93a8';

/**
 * 넘기는 값은 ★점수★ 다 (3,462점). 층은 점수 ÷ 100 이다 — 부르는 쪽이 나누지 않게
 * 여기서 나눈다. 등수 색(`rankColor`)·수치 색(`statColor`)과 ★섞어 쓰지 않는다.★
 */
export function floorColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return FLOOR_BELOW;
  const floor = score / 100;
  for (const [from, color] of FLOOR_STEPS) if (floor >= from) return color;
  return FLOOR_BELOW;
}

/** ★옛 판★ — 5층 단위 (45 빨강 · 40 노랑 · 35 하늘 · 30 초록 · 그 아래 하양). 지우지 않는다 */
export const FLOOR_COLORS_V1 = {
  red:    '#ff2d2d',
  yellow: '#ffd83d',
  sky:    '#63d9ff',
  green:  '#22c55e',
  plain:  '#ffffff',
} as const;

export function floorColorV1(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return FLOOR_COLORS_V1.plain;
  const floor = score / 100;
  if (floor >= 45) return FLOOR_COLORS_V1.red;
  if (floor >= 40) return FLOOR_COLORS_V1.yellow;
  if (floor >= 35) return FLOOR_COLORS_V1.sky;
  if (floor >= 30) return FLOOR_COLORS_V1.green;
  return FLOOR_COLORS_V1.plain;
}
