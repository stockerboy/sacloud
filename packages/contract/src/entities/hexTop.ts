import { z } from 'zod'
import { ClanSummary, PlayerSummary } from './summaries'

/**
 * ★분야별 TOP5★ — 육각 여섯 축마다 그 리그의 다섯 손가락 (2026-09-14 사장님).
 *
 *   «개인랭킹도 은글슬쩍 유지해 순위대로 1페이지씩 표시해주고 추가로 페이지 하나
 *     더 만들자 여기서는 클랜 , 개인6각 top5 보여주자 각 분야별 top5»
 *
 * ── 왜 「분야별」 인가
 *   종합 순위는 이미 랭킹 탭이 한다. 이 화면이 하는 말은 다르다 —
 *   ★«세이브는 누가 제일 잘하나»★ 다. 그래서 축이 먼저이고 순위가 그 아래다.
 *   기록 사이트가 아니라 ★분석 사이트★ 라는 사장님 말씀이 이 화면의 뜻이다.
 *
 * ── 클랜과 개인이 같은 모양을 쓴다
 *   축 이름 · 다섯 줄 · 각 줄의 값과 등수. 다른 것은 줄에 사람이 서느냐 클랜이
 *   서느냐뿐이다. 그래서 한 스키마에 두 자리(`player` / `clan`)를 둔다.
 */
export const HexTopRow = z.object({
  /** 그 축 안에서의 등수 (1~5) */
  rank: z.number().int().min(1),
  /** 사람 줄이면 채워진다 */
  player: PlayerSummary.nullable().default(null),
  /** 클랜 줄이면 채워지고, 사람 줄에서는 그 사람 소속이다 (없으면 null) */
  clan: ClanSummary.nullable().default(null),
  /** 리그 상세로 가는 주소를 만들 때 쓴다 */
  league_player_id: z.string().nullable().default(null),
  league_clan_id: z.string().nullable().default(null),
  /**
   * 화면에 그대로 적는 값 — ★이미 글자다★ (`'62.4%'` · `'18.3초'`).
   *
   * 숫자로 내리지 않는 이유: 축마다 단위가 다르다(비율 · 초 · 라운드당 킬수).
   * 단위 표를 화면이 또 들고 있으면 두 곳이 어긋난다 — 서버가 한 번만 정한다.
   */
  value: z.string(),
  /** 백분위 0~100. 색을 정하는 데 쓴다. 못 재면 null */
  percentile: z.number().nullable().default(null),
  /**
   * ★「n번 중 n번」★ 의 분자·분모 (2026-09-19 사장님).
   *
   *   «이거 퍼센트말고 n번중n번 이런식으로 해줘 마지막 개인top5»
   *
   * ⚠ ★없는 축이 더 많다.★ 2026-09-18 에 사장님이 「개인육각도 점수제로 줄세워서 다시
   *   측정해」 라고 하셔서 여섯 축 중 ★다섯★ 이 «센 횟수» 가 아니라 ★점수의 평균·총합★ 이
   *   됐다 (`playerHexScore.ts` 의 `axisValuesOf`). 점수 평균에는 분자·분모가 없다.
   *   ★진짜 횟수가 있는 축은 싸움(`duel`) 하나★ 다 — 이긴 판 / 붙은 판.
   *
   *   그래서 여기는 ★있는 축만★ 채운다. 없는 축은 `null` 이고 화면은 지금 글자를
   *   그대로 적는다. ★어림값을 만들지 않는다★ (`CLAUDE.md` 2-1).
   */
  numerator: z.number().nullable().default(null),
  denominator: z.number().nullable().default(null),
})
export type HexTopRow = z.infer<typeof HexTopRow>

export const HexTopAxis = z.object({
  key: z.string(),
  /** 화면에 쓰는 축 이름 — 사장님이 고른 말이다 (`선짤` · `교환`) */
  label: z.string(),
  /**
   * ★배지를 고를 때 쓰는 맨 축 키★ (2026-09-19 사장님: «그냥 뱃지를 보여주고 누르면 top5를 보여줘»).
   *
   * `key` 는 무기까지 붙은 열쇠(`duel:1`)라 그대로는 `badgeOfAxis` 에 못 넣는다.
   * ★화면이 문자열을 쪼개게 두지 않는다★ — 서버가 이미 아는 값을 그대로 내린다
   * (`badges.ts` 머리말: «화면에서 문자열을 만들지 않는다»).
   * 클랜 축은 개인 축 키가 아니라 `null` 이다 — 없는 짝을 지어내지 않는다.
   */
  axis_key: z.string().nullable().default(null),
  /** 그 카드의 무기 (`1` 스나 · `0` 라플). 배지가 무기마다 다르다 (`badgeOfAxis`) */
  weapon: z.union([z.literal(0), z.literal(1)]).nullable().default(null),
  /** 그 축을 잴 수 있었던 모집단 크기. «42곳 중» 처럼 적는다 */
  total: z.number().int().nullable().default(null),
  rows: z.array(HexTopRow),
})
export type HexTopAxis = z.infer<typeof HexTopAxis>

export const LeagueHexTop = z.object({
  /** 클랜 육각 여섯 축. 클랜 기록을 안 주는 리그는 빈 배열이다 */
  clan: z.array(HexTopAxis),
  /** 개인 육각 여섯 축 */
  player: z.array(HexTopAxis),
})
export type LeagueHexTop = z.infer<typeof LeagueHexTop>

/** 축마다 몇 줄을 보여 주나 (사장님: «top5») */
export const HEX_TOP_SIZE = 5
