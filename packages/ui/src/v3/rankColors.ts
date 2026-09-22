/**
 * SACLOUD 랭킹 색상 규칙 (승인본)
 * ---------------------------------------------------------------
 * 두 가지 규칙이 있고, 적용 대상이 다르다. 섞어 쓰지 말 것.
 *
 *  1) rankColor(rank)  — 등수(순위 숫자)와 닉네임에 적용
 *  2) statColor(value) — 등수를 제외한 모든 0~100 스케일 수치
 *                        (승률, 킬뎃, 헤드샷 등)에 적용
 *
 * ── ★★2026-09-20 — 경계를 여기서 지웠다★★ (비판 검수가 찾았다)
 *
 *   이 파일은 시안에서 온 것이라 ★경계 숫자를 스스로 갖고 있었다.★ 그래서
 *   같은 규칙이 ★두 곳★ 에 살았다 —
 *     · 등수   `@sacloud/contract` 의 `rankTone` / `rankToneOf`
 *     · 승률   `../common/rate` 의 `rateTone`
 *
 *   `CLAUDE.md` 4절이 ★«화면마다 rankColor 를 복사해 두지 않는다 — 우리는
 *   한 곳뿐이다»★ 라고 적어 뒀는데 ★이 파일이 그 둘째 곳이었다.★
 *   사장님이 경계를 바꿀 때마다 ★한쪽만 고쳐질 위험★ 이 있었다.
 *
 *   이제 ★판단은 전부 위 두 곳에서 받아 오고, 여기는 색만 고른다.★
 *   ⚠ 오늘 기준으로 ★색이 한 픽셀도 안 바뀐다★ — 두 곳의 경계가 같았다.
 *   ⚠ 옛 판(`rankColorV2`)은 지우지 않았다 (`CLAUDE.md` 1-4).
 */
import { rankTone, rankToneOf, type RankTone } from '@sacloud/contract'

import { type RateTone, rateTone } from '../common/rate'

/* ── 1) 등수 · 닉네임 색상 ───────────────────────────── */

/**
 * ⚠ ★2026-09-22 — 흰 바탕 글자색으로★ (사장님: 서플라이 투톤 지시).
 *   전부 ★글자색으로만★ 쓰인다(위 사용 예 참고) — 흰 카드 위에서 `top20`(노랑)과
 *   `rest`(하양)는 그대로 두면 ★글자가 안 보인다.★ 색의 뜻(빨강·노랑·파랑·초록·«평범»)은
 *   그대로 두고 ★글자로 읽히는 진하기★ 만 낮춘다. 옛 값(다크 배경용)은 지우지 않고
 *   여기 남긴다 (`CLAUDE.md` 1-4): top3 #ff4d4d(그대로 둬도 읽힘) · top20 #ffd83d ·
 *   top40 #5b9dff(그대로 둬도 읽힘) · top100 #22c55e(그대로 둬도 읽힘) · rest #ffffff
 */
export const RANK_COLORS = {
  top3:   '#ff4d4d', // 1~3위      빨강
  top20:  '#b8860b', // 4~20위     노랑(흰 바탕용 진한 금색)
  top40:  '#5b9dff', // 21~40위    파랑
  top100: '#22c55e', // 41~100위   초록
  rest:   '#1c2233', // 101위~     — 흰 바탕 기본 글자색
} as const;

/** 등수 색 이름 → 이 파일의 색. ★경계는 여기 없다★ — 계약이 이름을 정해 준다 */
const RANK_BY_TONE: Record<RankTone, string> = {
  red: RANK_COLORS.top3,
  gold: RANK_COLORS.top20,
  blue: RANK_COLORS.top40,
  green: RANK_COLORS.top100,
  /* ★지금 규칙에서는 안 나온다★ — 옛 판(`rankToneV1`)만 쓴다 */
  brown: '#c08a5a',
  plain: RANK_COLORS.rest,
}

/**
 * 등수에 따른 색.
 * **순위 숫자와 닉네임 모두 이 함수 하나를 쓴다** (두 값이 항상 같은 색).
 *
 * ⚠ ★경계는 `@sacloud/contract` 의 `rankTone` 에만 있다.★ 여기서 다시 세지 않는다.
 */
export function rankColor(rank: number): string {
  const tone = rankTone(rank)
  return tone === null ? RANK_COLORS.rest : RANK_BY_TONE[tone]
}

/**
 * ★등수 색을 «비율» 로★ (2026-09-16 사장님).
 *
 * > «순위(뭐 그 날 탑3든지 그냥 개인랭킹이든지 클랜랭킹이든지 상위 5프로 이내는
 * >  노란색 10프로이내는 파란색 20프로이내는 초록색 나머지는 걍 하얀색 으로 해줘
 * >  ★참가중인 인원수나 클랜수의 상위비율★ 로 하자»
 *
 * ── 왜 이게 옳은가
 *   지금까지는 ★절대 등수★ 로 색을 줬는데, 모집단이 리그마다 달라서 같은 «10위» 가
 *   어떤 곳에서는 상위 1%, 어떤 곳에서는 상위 25% 였다. 그래서 «IPL 개인 749명 /
 *   클랜 42곳» 처럼 ★리그마다 다른 경계표★ 를 따로 두는 땜질이 쌓였다
 *   (`PLAYER_HEX_STEPS` · `SMALL_LEAGUE_STEPS` 주석 참고).
 *   비율로 재면 그 표들이 통째로 필요 없어진다 — ★하나의 자★ 로 모든 화면을 잰다.
 *
 * ── 모집단을 모르면 색을 안 준다
 *   `total` 이 없으면 «상위 몇 %» 를 말할 수 없다. 지어내지 않고 흰색이다 (D-106).
 *
 * ── 1등만은 언제나 노랑
 *   ★가정★: 참가가 스무 곳 미만이면 1등도 5% 를 넘어 색이 없어진다. 1등이 흰색이면
 *   사람이 «색이 고장났나» 로 읽는다. 그래서 1등은 비율과 무관하게 노랑으로 둔다.
 */
export const RANK_RATIO_STEPS: readonly (readonly [number, string])[] = [
  [5, RANK_COLORS.top20], //  상위 5%   노랑
  [10, RANK_COLORS.top40], // 상위 10%  파랑
  [20, RANK_COLORS.top100], // 상위 20%  초록
] as const

/** ⚠ ★경계는 `@sacloud/contract` 의 `rankToneOf` 에만 있다.★ 여기서 다시 세지 않는다 */
export function rankColorOf(rank: number, total: number | null | undefined): string {
  const tone = rankToneOf(rank, total)
  return tone === null ? RANK_COLORS.rest : RANK_BY_TONE[tone]
}

/** ★옛 방식★ — 3 / 20 / 40 / 100 네 단계. 지우지 않는다 (`CLAUDE.md` 1-4) */
export function rankColorV2(rank: number): string {
  if (rank <= 3)   return RANK_COLORS.top3;
  if (rank <= 20)  return RANK_COLORS.top20;
  if (rank <= 40)  return RANK_COLORS.top40;
  if (rank <= 100) return RANK_COLORS.top100;
  return RANK_COLORS.rest;
}

/**
 * ★육각형 축 등수 색★ — 싸움 3위 · 나머지 5위 (2026-09-12 사장님).
 *
 * > «5위미만은 전부 평범한 색으로 바꿔라 각 특성을 사람이 적어서 다 잘해보인다»
 *
 * 축 등수는 ★배지와 같은 경계★ 를 쓴다 — 색이 켜지면 배지가 있고, 꺼지면 없다.
 * 두 곳이 갈라지면 «노란데 배지가 없네» 가 된다.
 *
 * ⚠ 하루에 두 번 바뀐 자리다 —
 *   ① 모든 축 100위 (개인랭킹과 같은 규칙)
 *   ② 스나싸움만 20위 (`SNIPER_DUEL_RANK_LIMIT`)
 *   ③ ★지금★ — 싸움 3위 · 나머지 5위
 */
export const HEX_AXIS_RANK_LIMIT = 5
export const HEX_DUEL_RANK_LIMIT = 3
/** ★옛 값★ (2026-09-12 낮) — 스나싸움만 20위였다 */
export const SNIPER_DUEL_RANK_LIMIT = 20

export function rankColorHexAxis(rank: number, isDuel = false): string {
  const limit = isDuel ? HEX_DUEL_RANK_LIMIT : HEX_AXIS_RANK_LIMIT
  return rank <= limit ? RANK_COLORS.top20 : RANK_COLORS.rest
}

/**
 * ★개인 육각형 축 등수 색★ — 10위 빨강 · 50위 노랑 · 100위 파랑 (2026-09-13 사장님).
 *
 * > «Ipl 개인 육각 100등안에 드는 등수 파랑색 50등안 노랑색 10등 안 강렬한 빨간색»
 *
 * ── 왜 클랜과 다른 규칙인가
 *   ★모집단 크기가 다르다.★ IPL 개인은 ★749명★ 인데 클랜은 ★42곳★ 이다.
 *   클랜에 100위 경계를 두면 ★전부 파랑★ 이 되어 색이 아무 말도 안 한다.
 *   그래서 클랜은 그대로 `rankColorHexAxis`(싸움 3위 · 나머지 5위)를 쓰고,
 *   개인만 이 함수를 쓴다. ★두 함수를 섞어 쓰지 않는다.★
 *
 * 세 단계는 위로 갈수록 뜨겁다 — 파랑 → 노랑 → 빨강. 층수 색(`FLOOR_STEPS`)과 같은 방향이라
 * 사람이 규칙을 두 번 외우지 않는다.
 */
export const PLAYER_HEX_STEPS: readonly (readonly [number, string])[] = [
  [10, '#ff0033'], //  1 ~  10위   강렬한 빨강
  [50, '#b8860b'], // 11 ~  50위   ⚠2026-09-22 흰바탕용, 옛값 #ffd83d — 1-4
  [100, '#5b9dff'], // 51 ~ 100위   파랑
] as const

/**
 * ★작은 리그는 경계도 작다★ — SPL · 열산 (2026-09-13 사장님).
 *
 * > «SPL 열산은 5위 안 빨간색 10위 안 노란색 20등 안 파란색 나머지 흰색 육각말하는거야»
 *
 * ── 왜 리그마다 다른가
 *   IPL 개인랭킹은 ★749명★ 이고 SPL 은 ★117명★, 열산은 축을 잰 사람이 ★171명★ 이다.
 *   IPL 경계(10/50/100)를 그대로 쓰면 SPL 은 ★거의 전원이 색을 받는다★ —
 *   색이 「잘한다」를 말하지 못하고 그냥 칠해진다.
 *   사장님이 작은 리그용으로 5/10/20 을 직접 정하셨다.
 */
export const PLAYER_HEX_STEPS_SMALL: readonly (readonly [number, string])[] = [
  [5, '#ff0033'], //  1 ~  5위   강렬한 빨강
  [10, '#b8860b'], //  6 ~ 10위   ⚠2026-09-22 흰바탕용, 옛값 #ffd83d — 1-4
  [20, '#5b9dff'], // 11 ~ 20위   파랑
] as const

/** 큰 경계를 쓰는 리그 — 지금은 IPL 하나다. 모르는 리그는 ★작은 쪽★ 으로 본다 */
const BIG_POOL_LEAGUES: ReadonlySet<string> = new Set(['nolink'])

export function playerHexSteps(leagueSlug?: string): readonly (readonly [number, string])[] {
  /* slug 를 안 넘긴 옛 호출부는 지금까지처럼 큰 경계다 (화면이 조용히 안 바뀐다) */
  if (leagueSlug === undefined) return PLAYER_HEX_STEPS
  return BIG_POOL_LEAGUES.has(leagueSlug) ? PLAYER_HEX_STEPS : PLAYER_HEX_STEPS_SMALL
}

export function rankColorPlayerHexAxis(rank: number, leagueSlug?: string): string {
  for (const [limit, color] of playerHexSteps(leagueSlug)) if (rank <= limit) return color
  return RANK_COLORS.rest
}

/** @deprecated 2026-09-12 — `rankColorHexAxis(rank, true)` 를 쓴다. 옛 호출부를 위해 남긴다 */
export function rankColorSniperDuel(rank: number): string {
  return rankColorHexAxis(rank, true)
}

/** 별칭 — 닉네임에 쓸 때 의도가 드러나도록. 동작은 rankColor 와 동일. */
export const nameColor = rankColor;

/* ── 2) 수치 색상 ────────────────────────────────────── */

/* ⚠ 2026-09-22 흰 바탕용. 옛 값(다크): white #ffffff · yellow #f5c518 — 1-4 */
export const STAT_COLORS = {
  red:    '#e01b24', // ~39.9
  /* ⚠ 2026-09-23 새벽 — 바탕이 우리 어두운 톤으로 돌아왔는데 이 값은 흰 바탕용 검정이라
     경기 카드의 「(40.0%)」「(46.7%)」 가 면에 묻혀 안 보였다 (폰 선수 상세 찍어서 잡았다). 옛 값 '#1c2233' */
  white:  '#d9dbe4', // 40 ~ 49.9 — 본문 글자색 (--color-text)
  green:  '#22c55e', // 50 ~ 54.9
  /* ★2026-09-11 사장님: «갈색 숫자색 좀 밝은 갈색으로»★. 옛 값 #a06a35 */
  brown:  '#c08a5a', // 55 ~ 59.9
  blue:   '#5b8dff', // 60 ~ 64.9
  yellow: '#b8860b', // 65 ~ 100 — 흰 바탕용 진한 금색
} as const;

/**
 * 0~100 스케일 수치의 색.
 * 등수에는 절대 쓰지 않는다 (등수는 rankColor).
 * 래더 점수(3,800점)처럼 0~100 스케일이 아닌 값도 대상이 아니다 → 흰색으로 둔다.
 */
/** 승률 색 이름 → 이 파일의 색. ★경계는 여기 없다★ — `rateTone` 이 이름을 정해 준다 */
const STAT_BY_TONE: Record<RateTone, string> = {
  low: STAT_COLORS.red,
  base: STAT_COLORS.white,
  r1: STAT_COLORS.green,
  r2: STAT_COLORS.brown,
  r3: STAT_COLORS.blue,
  r4: STAT_COLORS.yellow,
}

/** ⚠ ★경계는 `../common/rate` 의 `rateTone` 에만 있다.★ 여기서 다시 세지 않는다 */
export function statColor(value: number): string {
  /* ★숫자가 아니면 색을 지어내지 않는다★ — 회색 (D-106). `rateTone` 은 여기까지 안 본다 */
  if (Number.isNaN(value)) return '#8a8a93';
  return STAT_BY_TONE[rateTone(value)]
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
  [40, '#b8860b'], // 40 ~ 41.9   ⚠2026-09-22 흰바탕용, 옛값 #ffd83d — 1-4
  [38, '#ff6fb5'], // 38 ~ 39.9   분홍
  [36, '#a78bfa'], // 36 ~ 37.9   보라
  [34, '#5b8dff'], // 34 ~ 35.9   파랑
  [32, '#63d9ff'], // 32 ~ 33.9   하늘
  [30, '#a3e635'], // 30 ~ 31.9   연두
  [28, '#22c55e'], // 28 ~ 29.9   초록
  [26, '#1c2233'], // 26 ~ 27.9   ⚠2026-09-22 흰바탕용, 옛값(다크) #ffffff — 1-4
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
  yellow: '#b8860b', // ⚠2026-09-22 흰바탕용, 옛값 #ffd83d — 1-4
  sky:    '#63d9ff',
  green:  '#22c55e',
  plain:  '#1c2233', // ⚠2026-09-22 흰바탕용, 옛값(다크) #ffffff — 1-4
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
