/**
 * ★선수 여섯 축 · 실력 점수★ — 계약 (2026-09-10 · 사장님 확정)
 *
 * > "개인랭킹 이걸로 확정이다 (…) 클랜은 그냥 원래하던대로 가고" — 사용자, 2026-09-10
 *
 * 화면은 계산하지 않는다. `LeaguePlayerHex` 한 줄(잡 `player-hex-build` 가 미리 접어 둔 것)을
 * 그대로 옮긴 것이다. 공식은 `apps/worker/src/lib/playerHexScore.ts` 한 곳뿐이다.
 *
 * 축 순서는 선수 상세 v3 시안의 시계 방향이다 — 12시부터
 *   세이브 → 싸움(스나싸움/샷싸움) → 캐리력 → 선짤 → 연속킬 → 소수싸움
 *
 * 옛 `PlayerTraits`(`traits.ts` · 화면에서 그때그때 계산) 는 지우지 않는다 (`CLAUDE.md` 1-4).
 * 그쪽은 `PLAYER_TRAITS_ENABLED = false` 로 꺼져 있다.
 */
import { z } from 'zod'
import { Count, Percent } from './common'
import { TRAIT_AXIS_KEYS, TRAIT_AXIS_LABEL, type TraitAxisKey } from './traits'

export const PLAYER_HEX_AXIS_ORDER: readonly TraitAxisKey[] = [
  'save',
  'duel',
  'carry',
  'opening',
  'burst',
  'outnumbered',
]

/**
 * ★배지 경계★ (2026-09-12 사장님).
 *
 * > «벳지중 스나싸움은 3위 안에 들어야 준다 그리고 나머지 벳지들은 5위안에 들어야준다
 * >  5위미만은 전부 평범한 색으로 바꿔라 각 특성을 사람이 적어서 다 잘해보인다»
 *
 * ── 왜 싸움만 더 좁은가
 *   싸움(`duel`)은 ★같은 무기끼리만★ 견준다 — IPL 스나수는 141명뿐이다.
 *   다른 축은 스나·라플을 섞어 876명이다. 같은 «5위» 라도 무게가 다르다.
 *
 * ⚠ ★옛 값은 10 이었다★ (`PLAYER_HEX_BADGE_RANK_V1`) — 축 하나에 열 명씩,
 *   여섯 축이면 예순 명이 배지를 달았다. 사장님 말씀대로 «다 잘해 보였다».
 */
export const PLAYER_HEX_BADGE_RANK = 5
/** 싸움(스나싸움·샷싸움)만 더 좁다 */
export const PLAYER_HEX_BADGE_RANK_DUEL = 3
/** ★옛 값★ (2026-09-10 ~ 2026-09-12) — 모든 축 10위 (`CLAUDE.md` 1-4) */
export const PLAYER_HEX_BADGE_RANK_V1 = 10

/** 이 축에서 배지를 주는 등수 경계 */
export function playerHexBadgeRank(key: string): number {
  return key === 'duel' ? PLAYER_HEX_BADGE_RANK_DUEL : PLAYER_HEX_BADGE_RANK
}

export const PLAYER_HEX_BADGE: Record<TraitAxisKey, { sniper: string; rifle: string }> = {
  save: { sniper: '세이브 머신', rifle: '세이브 머신' },
  duel: { sniper: '롱 마스터', rifle: '샷터' },
  carry: { sniper: '캐리 머신', rifle: '캐리 머신' },
  opening: { sniper: 'First Blood', rifle: 'First Blood' },
  burst: { sniper: '멀티킬러', rifle: '멀티킬러' },
  /* 2026-09-11 사장님: «말맞추기» → «소수싸움» */
  outnumbered: { sniper: '소수싸움', rifle: '소수싸움' },
}

/** 축 설명 — 시안의 «의미» 칸. 무기별로 싸움만 다르다 */
export const PLAYER_HEX_DESC: Record<TraitAxisKey, { sniper: string; rifle: string }> = {
  save: { sniper: '혼자 남은 라운드를 이긴 비율', rifle: '혼자 남은 라운드를 이긴 비율' },
  duel: { sniper: 'A롱·비롱에서 상대 스나를 잡은 비율', rifle: '라플끼리 붙어 이긴 비율' },
  carry: { sniper: '한 판 평균 킬', rifle: '한 판 평균 킬' },
  opening: { sniper: '라운드 첫 킬을 딴 비율', rifle: '라운드 첫 킬을 딴 비율' },
  burst: { sniper: '2초 안에 연달아 잡은 라운드 비율', rifle: '2초 안에 연달아 잡은 라운드 비율' },
  outnumbered: { sniper: '수가 밀린 라운드를 이긴 비율', rifle: '수가 밀린 라운드를 이긴 비율' },
}

export function playerHexLabelOf(key: TraitAxisKey, weapon: 0 | 1 | null): string {
  const pair = TRAIT_AXIS_LABEL[key]
  return weapon === 0 ? pair.rifle : pair.sniper
}

export const PlayerHexAxis = z.object({
  key: z.enum(TRAIT_AXIS_KEYS),
  label: z.string(),
  desc: z.string(),
  /** 원값 — 캐리력은 킬/판, 나머지는 % */
  value: z.number().nullable(),
  unit: z.enum(['percent', 'per_game']),
  /**
   * 모집단 백분위 (0~100). 그래프 면적은 이것으로 그린다.
   *
   * ★모집단이 축마다 다르다★ (2026-09-12 사장님) —
   *   싸움(`duel`)  → 리그 × 무기 (스나수는 스나수끼리)
   *   나머지 다섯   → 리그 통합 (스나·라플을 섞는다)
   * ⚠ 옛 서술은 «리그 × 무기 모집단 백분위» 였다 — 2026-09-12 까지는 여섯 축 전부 그랬다.
   */
  percentile: Percent.nullable(),
  rank: Count.nullable(),
  total: Count.nullable(),
  /** 10위 이내면 배지 이름, 아니면 null */
  badge: z.string().nullable(),
  /** «47:23» 같은 원시 표기 — 없으면 null */
  numerator: Count.nullable(),
  denominator: Count.nullable(),
})
export type PlayerHexAxis = z.infer<typeof PlayerHexAxis>

export const PlayerHex = z.object({
  /** 잰 무기 — 어느 쪽도 10판이 안 되면 null 이고 `measuring` 이 true 다 */
  weapon: z.union([z.literal(0), z.literal(1)]).nullable(),
  games: Count,
  weapon_games: Count,
  rounds: Count,
  axes: z.array(PlayerHexAxis),
  /** 여섯 축 가중 백분위 */
  hex: Percent.nullable(),
  score: Count.nullable(),
  score_rank: Count.nullable(),
  /**
   * ★통합 순위★ — 스나·라플을 섞어 실력 점수로 줄 세운 등수 (2026-09-12 사장님).
   *
   * > «이거 통합 순위 맞아? 왜 140명? 통합 순위로 넣어»
   *
   * 바로 위 `score_rank` 는 ★그 무기 안에서만★ 의 등수라 «15위 / 140명» 처럼 나온다.
   * 개인랭킹 화면이 보여 주는 등수는 섞은 줄의 순서다 — 그 값을 여기 따로 싣는다.
   * 모집단은 개인랭킹과 ★같다★ (점수가 있고 최소 판수를 넘긴 선수).
   * 못 세면 `null` 이다 (지어내지 않는다).
   */
  score_rank_all: Count.nullable().optional(),
  score_total_all: Count.nullable().optional(),
  score_total: Count.nullable(),
  win_rate_rank: Count.nullable(),
  win_rate_total: Count.nullable(),
  tier_factor: z.number(),
  shrink: z.number(),
  clan_bonus: z.number().int(),
  measuring: z.boolean(),
  formula_version: z.string(),
  updated_at: z.string().nullable(),
})
export type PlayerHex = z.infer<typeof PlayerHex>

/** 클랜 상세 v3 «상대전적» 한 줄 — 시즌 0 안에서 그 상대와 붙은 기록 */
export const ClanHeadToHead = z.object({
  league_clan_id: z.string(),
  clan: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    mark_bg_url: z.string().nullable(),
    mark_front_url: z.string().nullable(),
  }),
  division: Count.nullable(),
  win: Count,
  lose: Count,
  last_played_at: z.string().nullable(),
  /** 최근 순 (최대 10) — 세트 승패 추이 그래프용 */
  recent: z.array(
    z.object({
      match_id: z.string(),
      start_at: z.string(),
      won: z.boolean().nullable(),
      our_rounds: Count.nullable(),
      their_rounds: Count.nullable(),
    }),
  ),
})
export type ClanHeadToHead = z.infer<typeof ClanHeadToHead>
