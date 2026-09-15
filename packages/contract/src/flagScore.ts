/**
 * ★깃발 점수★ — 그날(17:00~03:00) 뛴 것만으로 1·2·3등을 가린다 (2026-09-15 사장님).
 *
 * > «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고»
 * > «맨위 육각그래프는 (…) 그 날 마감기준 1,2,3등 (…)
 * >  이것도 그 날 1700-0300까지의 육각이다 알겠지?»
 *
 * ── ★이 파일이 왜 계약에 있나★
 *   같은 계산을 ★두 곳★ 이 해야 한다.
 *   ```
 *   라이브 (17:00~03:00)   apps/web   — 지금 누가 1등인지 실시간으로 보여 준다
 *   마감   (03:00)         apps/worker — 그 순간의 1·2·3등을 깃발로 박는다
 *   ```
 *   둘이 다른 식을 쓰면 ★라이브에서 1등이던 사람이 깃발을 못 받는다.★
 *   그래서 식은 여기 한 곳에만 둔다. 양쪽은 재료만 모아서 넘긴다.
 *
 * ── ⚠ ★시즌 점수와는 다른 계산이다★
 *   `apps/worker/src/lib/playerHexScore.ts` 의 실력 점수는 ★시즌 누적★ 이고
 *   티어계수·신뢰·클랜보정이 붙는다. 깃발은 ★하루★ 라 그런 보정이 뜻이 없다
 *   (하루치는 표본이 작아 신뢰 보정을 걸면 전부 0 에 눌린다).
 *   ★축을 구하는 식(`dayAxisValues`)만 그쪽 `axisValuesOf` 와 같다.★
 *   한쪽을 고치면 다른 쪽도 같이 고친다 — 서로를 가리키는 주석을 달아 두었다.
 *
 * ── 줄 세우는 법 — 「오늘의 셋」과 ★같은 잣대★ 다
 *   사장님: «육각축이 고르게 전부 잘한 사람 + 승률도 좋아야함».
 *   `apps/web/lib/server/queries/dailyPodium.ts` 가 쓰는 그 무게를 그대로 쓴다.
 *   두 화면이 한 리그에서 다른 사람을 1등이라고 하면 안 된다.
 *
 * 순수 함수라 DB 없이 시험한다 (`__tests__/flagScore.test.ts`).
 */

import { z } from 'zod'

/** 여섯 축 — 순서를 바꾸지 않는다. 화면의 육각형이 이 차례로 그린다 */
export const FLAG_AXIS_ORDER = ['save', 'duel', 'carry', 'opening', 'burst', 'outnumbered'] as const
export type FlagAxisKey = (typeof FLAG_AXIS_ORDER)[number]

/**
 * ★하루에 이만큼은 뛰어야 깃발을 다툰다★.
 *
 * 「오늘의 셋」과 같은 값이다 (`dailyPodium.MIN_GAMES`). 3판으로 두면
 * «3판 전승» 이 «6판 4승» 을 이긴다 — 그건 그날 잘한 게 아니라 적게 한 것이다.
 */
export const FLAG_MIN_GAMES = 4

/** 그날 승률이 이보다 낮으면 안 꽂는다 — 사장님: «승률도 좋아야함» */
export const FLAG_MIN_WIN_RATE = 50

/**
 * 축을 잴 수 있는 최소 표본.
 * ⚠ `playerHexScore.ts` 의 `MIN_SITUATION_ROUNDS`·`MIN_DUELS` 와 ★같은 뜻★ 이지만
 *   ★값은 더 작다★ — 저쪽은 시즌 누적이고 이쪽은 하루다. 시즌 값을 그대로 쓰면
 *   하루에 그만큼 겪는 사람이 거의 없어 축이 전부 «측정중» 이 된다.
 */
export const FLAG_MIN_SITUATION_ROUNDS = 3
export const FLAG_MIN_DUELS = 5

/** 몇 명에게 깃발을 주나 — 1등만 정상에 꽂고 2·3 등도 같이 남긴다 */
export const FLAG_PODIUM_SIZE = 3

/**
 * 점수 무게 — 「오늘의 셋」(`dailyPodium`)과 ★같은 값★ 이다.
 * 가장 낮은 축을 제일 무겁게 본다 — «고르게 잘한 사람» 이 사장님 말씀이다.
 */
export const FLAG_W_LOW = 0.45
export const FLAG_W_AVG = 0.25
export const FLAG_W_WIN = 0.3

/** 그 선수의 하루치 배틀로그 합 (`MatchPlayerHex` 를 더한 것) */
export interface FlagDayTally {
  /** 그날 뛴 경기 수 */
  games: number
  win: number
  lose: number
  kill: number
  death: number
  /** 등장한 라운드 수 — 선짤·연속킬의 분모 */
  rounds: number
  firstKills: number
  burstRounds: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  /** 주무기 기준 싸움 */
  sniperDuelWon: number
  sniperDuelLost: number
  rifleDuelWon: number
  rifleDuelLost: number
  /** 그날 주무기 (0 라플 · 1 스나). 모르면 null → 싸움 축이 null */
  weapon: 0 | 1 | null
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/**
 * 축 원값 (%) — ★표본이 모자라면 `null`★. 0 으로 채우지 않는다 (D-106).
 *
 * ⚠ `playerHexScore.ts` 의 `axisValuesOf` 와 ★같은 식★ 이다. 문턱만 하루용이다.
 */
/**
 * ★문턱★ — 축을 잴 최소 표본. 화면에 따라 다르다 (2026-09-15 사장님).
 *
 *   ★순위를 매기는 화면★ (랭킹 · 깃발) — 문턱이 있어야 한다.
 *     «1번 중 1번 = 100%» 가 «10번 중 7번 = 70%» 를 이기면 줄이 뒤집힌다.
 *
 *   ★그 판을 설명하는 화면★ (경기 상세) — 문턱을 두지 않는다.
 *     사장님: «1번중 1번은 100퍼센트가 맞잖아». 순위를 매기는 게 아니라
 *     «이 판에서 뭘 했나» 를 말하는 자리다. 대신 ★분모를 같이 적는다.★
 */
export interface FlagAxisGate {
  situationRounds: number
  duels: number
  /**
   * ★겪은 적이 아예 없을 때★ — `true` 면 0%, `false` 면 «못 잼»(`null`).
   *
   * 2026-09-15 사장님:
   * > «세이브 상황없었으면 0%(0/0) 있었는디 못해도 0%(0/1) 두번중한번하면(1/2) 50% 이런식»
   *
   * 랭킹에서는 `false` 다 — «상황이 없었다» 와 «못했다» 를 같은 0 으로 놓고
   * 줄을 세우면 안 겪은 사람이 못한 사람과 같이 바닥에 깔린다.
   * 한 판 설명에서는 `true` 다 — 육각이 비면 «못 잼» 이 «못함» 처럼 보인다.
   */
  emptyIsZero: boolean
}

/** 줄을 세울 때 (랭킹 · 깃발) */
export const FLAG_GATE_RANKED: FlagAxisGate = {
  situationRounds: FLAG_MIN_SITUATION_ROUNDS,
  duels: FLAG_MIN_DUELS,
  emptyIsZero: false,
}

/** 한 판을 설명할 때 (경기 상세) — ★한 번만 겪어도 적고, 안 겪었으면 0% 다★ */
export const FLAG_GATE_RAW: FlagAxisGate = {
  situationRounds: 1,
  duels: 1,
  emptyIsZero: true,
}

/**
 * ★세이브는 백분위가 아니라 고정 눈금이다★ (2026-09-15 사장님).
 *
 * > «세이브도 그냥 횟수로 넣어야할듯 퍼센트가 아니라 1회 2회 3회 4회 5회까지
 * >  0회는 그래프가 움직이면 안되고 (…) 중간크기 6각형 테두리에 1회부터 여기에 점을 찍어
 * >  그리고 젤큰 육각형과 그다음으로 큰 육각형 사이의 공간을 4개로 나눠서
 * >  (세이브 4번이 가장큰그래프의 테두리에 찍힌다 5회이상은 걍 4회로친다)»
 *
 * ── 왜 백분위를 버리나
 *   세이브는 ★한 판에 전원 0회★ 인 경기가 흔하다 (실측). 백분위로 그리면 그 열 명이
 *   모두 «가운데» 에 찍혀서, ★아무도 세이브를 안 한 판★ 이 «다들 보통은 했다» 처럼 보인다.
 *   횟수는 그런 거짓말을 안 한다 — 0회면 도형이 중심에서 안 움직인다.
 *
 * ── 눈금 (그림의 세 겹과 맞물린다)
 *   ```
 *   0회   0.00   중심 — 움직이지 않는다
 *   1회   0.66   ★중간 육각 테두리★
 *   2회   0.77   ┐ 1회와 4회 사이를
 *   3회   0.89   ┘ 고르게 나눈 자리
 *   4회   1.00   ★가장 큰 육각 테두리★
 *   5회 이상 → 4회로 친다
 *   ```
 *
 * ★한 판 육각에서만 쓴다.★ 시즌·하루는 판수가 많아 세이브가 수십 번이라
 * 4회 상한을 두면 전원 만점이 된다 — 거기는 그대로 비율이다.
 */
export const SAVE_SCALE_FULL = 4
/** 1회가 찍히는 자리 — 그림의 ★중간 육각★ 테두리다 (`0.66 * R`) */
export const SAVE_SCALE_FIRST = 66

/** 세이브 횟수 → 그림 반지름 백분율 (0~100) */
export function saveScaleOf(saves: number): number {
  if (saves <= 0) return 0
  const capped = Math.min(saves, SAVE_SCALE_FULL)
  /* 1회(66) 와 4회(100) 사이를 고르게 나눈다 */
  return round1(SAVE_SCALE_FIRST + ((100 - SAVE_SCALE_FIRST) * (capped - 1)) / (SAVE_SCALE_FULL - 1))
}

/** 축마다 «몇 번 중 몇 번» — 화면이 «100% (1/1)» 로 적을 수 있게 */
export interface FlagAxisParts {
  numerator: number | null
  denominator: number | null
}

/** 축의 분자·분모 — 값과 같은 규칙으로 고른다 */
export function dayAxisParts(t: FlagDayTally): Record<FlagAxisKey, FlagAxisParts> {
  const duelWon = t.weapon === 1 ? t.sniperDuelWon : t.weapon === 0 ? t.rifleDuelWon : 0
  const duelLost = t.weapon === 1 ? t.sniperDuelLost : t.weapon === 0 ? t.rifleDuelLost : 0
  return {
    save: { numerator: t.aloneWon, denominator: t.aloneRounds },
    duel: { numerator: duelWon, denominator: duelWon + duelLost },
    carry: { numerator: t.kill, denominator: t.games },
    opening: { numerator: t.firstKills, denominator: t.games },
    burst: { numerator: t.burstRounds, denominator: t.games },
    outnumbered: { numerator: t.outWon, denominator: t.outRounds },
  }
}

export function dayAxisValues(
  t: FlagDayTally,
  gate: FlagAxisGate = FLAG_GATE_RANKED,
): Record<FlagAxisKey, number | null> {
  const duelWon = t.weapon === 1 ? t.sniperDuelWon : t.weapon === 0 ? t.rifleDuelWon : 0
  const duelLost = t.weapon === 1 ? t.sniperDuelLost : t.weapon === 0 ? t.rifleDuelLost : 0
  const duels = duelWon + duelLost
  return {
    save:
      t.aloneRounds >= gate.situationRounds
        ? round1((t.aloneWon / t.aloneRounds) * 100)
        : gate.emptyIsZero
          ? 0
          : null,
    duel:
      t.weapon !== null && duels >= gate.duels
        ? round1((duelWon / duels) * 100)
        : gate.emptyIsZero
          ? 0
          : null,
    carry: t.games > 0 ? Math.round((t.kill / t.games) * 100) / 100 : null,
    /*
     * ★선짤·연속킬은 「판당 몇 번」 이다★ (2026-09-15 사장님:
     * «연속킬이랑 선짤 이 두개만 판당평균 n.n회 이런식으로 바꿔»).
     *
     * ⚠ 옛 값은 ★라운드 비율(%)★ 이었다 (`firstKills / rounds × 100`).
     *   퍼센트로 적으니 «선짤 7%» 처럼 작은 숫자만 나와서 무슨 뜻인지 안 와닿았다.
     *   지금은 캐리력(판당 킬)과 ★같은 단위★ 라 나란히 읽힌다.
     *   ★백분위는 그대로다★ — 순위를 가리는 잣대는 안 바뀐다 (단조 변환이다).
     */
    opening: t.games > 0 ? Math.round((t.firstKills / t.games) * 100) / 100 : null,
    burst: t.games > 0 ? Math.round((t.burstRounds / t.games) * 100) / 100 : null,
    outnumbered:
      t.outRounds >= gate.situationRounds
        ? round1((t.outWon / t.outRounds) * 100)
        : gate.emptyIsZero
          ? 0
          : null,
  }
}

/**
 * 백분위 — ★나보다 낮은 사람의 비율 × 100★. 오름차순 배열을 받는다.
 * ⚠ `playerHexScore.ts` 의 `percentileOf` 와 같은 식이다.
 */
export function flagPercentile(sorted: readonly number[], v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || sorted.length === 0) return null
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((sorted[mid] as number) < v) lo = mid + 1
    else hi = mid
  }
  return round1((lo / sorted.length) * 100)
}

/** 점수 — 「오늘의 셋」과 같은 식. 낮은 축을 제일 무겁게 본다 */
export function flagScoreOf(low: number, avg: number, winRate: number): number {
  return low * FLAG_W_LOW + avg * FLAG_W_AVG + winRate * FLAG_W_WIN
}

/** 한 사람의 하루치 — 점수를 매기기 전 재료 */
export interface FlagCandidate<T> {
  /** 부르는 쪽이 붙이는 꼬리표 (선수 id 같은 것). 이 파일은 안 들여다본다 */
  ref: T
  tally: FlagDayTally
}

/** 줄 세운 결과 한 줄 */
export interface FlagRanked<T> {
  ref: T
  /** 1부터 */
  rank: number
  score: number
  /** 백분위로 바꾼 여섯 축 (그날 뛴 사람들 사이에서) */
  axes: { key: FlagAxisKey; value: number | null; pct: number | null }[]
  /** 가장 낮은 축의 백분위와 이름 */
  lowPct: number
  lowKey: FlagAxisKey
  winRate: number
  /** 킬 ÷ (킬+데스) · % — 사이트 공통 잣대. 잴 수 없으면 null */
  kdRate: number | null
  games: number
  win: number
  lose: number
}

/**
 * ★그날 1·2·3등★.
 *
 * 백분위는 ★그날 뛴 사람들 안에서★ 낸다 — 시즌 분포를 쓰면 «오늘 잘한 사람» 이 아니라
 * «원래 잘하는 사람» 이 나온다 (사장님이 짚어 주신 자리다).
 *
 * ── 누가 후보에서 빠지나 (★지어내지 않는다★)
 *   · 그날 `FLAG_MIN_GAMES` 판을 못 채웠다
 *   · 여섯 축 중 하나라도 못 쟀다 — 고르게 잘했는지 말할 수가 없다
 *   · 그날 승률이 `FLAG_MIN_WIN_RATE` 미만이다
 *
 * 아무도 못 채우면 ★빈 배열★ 이다. 억지로 세 명을 채우지 않는다.
 */
/**
 * ★동점을 가운데로 놓는 백분위★ — 한 판 육각처럼 ★모집단이 열 명뿐★ 일 때 쓴다.
 *
 * ⚠ 왜 따로 두나 (2026-09-15 실측)
 *   `flagPercentile` 은 «나보다 ★낮은★ 사람의 비율» 이다. 시즌처럼 사람이 많으면
 *   동점이 드물어 문제가 없는데, ★한 판 열 명★ 에서는 «세이브 0%» 가 일곱 명씩 나온다.
 *   그러면 일곱 명이 ★전부 0 백분위★ 가 되어 육각이 통째로 찌그러진다 —
 *   실측: cks♡ 의 여섯 축 중 넷이 0 이라 도형이 선 한 줄로 보였다.
 *
 *   여기서는 «낮은 사람» 과 «나 이하인 사람» 의 ★가운데★ 를 쓴다.
 *   일곱 명이 0 으로 묶이면 일곱 명 모두 35 가 된다 — 순서는 그대로면서 도형이 산다.
 *
 * ★줄 세우기에는 쓰지 않는다★ — 깃발·랭킹은 `flagPercentile` 그대로다.
 */
export function flagPercentileMid(sorted: readonly number[], v: number | null): number | null {
  if (v === null || sorted.length === 0) return null
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if ((sorted[m] as number) < v) lo = m + 1
    else hi = m
  }
  const below = lo
  let lo2 = 0
  let hi2 = sorted.length
  while (lo2 < hi2) {
    const m = (lo2 + hi2) >> 1
    if ((sorted[m] as number) <= v) lo2 = m + 1
    else hi2 = m
  }
  return round1((((below + lo2) / 2 / sorted.length) * 100))
}

export function rankFlagDay<T>(
  candidates: readonly FlagCandidate<T>[],
  size: number = FLAG_PODIUM_SIZE,
): FlagRanked<T>[] {
  /* ① 축 원값을 먼저 다 구한다 — 백분위의 모집단이 되어야 한다 */
  const withValues = candidates.map((c) => ({ c, values: dayAxisValues(c.tally) }))

  /* ② 축마다 그날의 분포 (null 은 모집단에 안 넣는다) */
  const pools = {} as Record<FlagAxisKey, number[]>
  for (const key of FLAG_AXIS_ORDER) {
    pools[key] = withValues
      .map((w) => w.values[key])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
  }

  /* ③ 문턱을 넘은 사람만 점수를 낸다 */
  const scored: FlagRanked<T>[] = []
  for (const { c, values } of withValues) {
    const t = c.tally
    if (t.games < FLAG_MIN_GAMES) continue
    const winRate = t.games === 0 ? 0 : (t.win / t.games) * 100
    if (winRate < FLAG_MIN_WIN_RATE) continue

    const axes = FLAG_AXIS_ORDER.map((key) => ({
      key,
      value: values[key],
      pct: flagPercentile(pools[key], values[key]),
    }))
    /* 하나라도 못 잰 축이 있으면 «고르게» 를 말할 수 없다 */
    if (axes.some((a) => a.pct === null)) continue

    const pcts = axes.map((a) => a.pct as number)
    const lowPct = Math.min(...pcts)
    const lowIndex = pcts.indexOf(lowPct)
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length
    const kills = t.kill
    const deaths = t.death
    scored.push({
      ref: c.ref,
      rank: 0,
      score: flagScoreOf(lowPct, avg, winRate),
      axes,
      lowPct,
      lowKey: FLAG_AXIS_ORDER[lowIndex] as FlagAxisKey,
      winRate: round1(winRate),
      kdRate: kills + deaths === 0 ? null : round1((kills / (kills + deaths)) * 100),
      games: t.games,
      win: t.win,
      lose: t.lose,
    })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

/* -------------------------------------------------------------------------- */
/* 화면이 받는 모양                                                              */
/* -------------------------------------------------------------------------- */

/** 깃발판 한 줄 — 1·2·3등 */
export const FlagBoardRowSchema = z.object({
  rank: z.number().int(),
  player_id: z.string(),
  name: z.string(),
  clan: z
    .object({
      slug: z.string(),
      name: z.string(),
      mark: z.object({ bg: z.string().nullable(), front: z.string().nullable() }),
    })
    .nullable(),
  score: z.number(),
  games: z.number().int(),
  win: z.number().int(),
  lose: z.number().int(),
  win_rate: z.number(),
  /** 킬 ÷ (킬+데스) · % */
  kd_rate: z.number().nullable(),
  /** 그날 육각 — 백분위. 마감 뒤 저장본에는 빈 배열이다 */
  axes: z.array(
    z.object({
      key: z.string(),
      value: z.number().nullable(),
      pct: z.number().nullable(),
    }),
  ),
  /** 지금까지 받은 깃발 수 (1등만) */
  flags: z.number().int(),
})
export type FlagBoardRowSchema = z.infer<typeof FlagBoardRowSchema>

/** 깃발판 — 산 하나 */
/** 능선 한 점 — «그 시각까지의 1등 점수» */
export const FlagTimelinePointSchema = z.object({
  slot: z.number().int(),
  score: z.number().nullable(),
  player_id: z.string().nullable(),
})

export const FlagBoard = z.object({
  league: z.string(),
  /** 마감일 `YYYY-MM-DD` (KST) */
  day_key: z.string(),
  opens_at: z.string(),
  closes_at: z.string(),
  /** 아직 경쟁 중인가 */
  live: z.boolean(),
  /** 한 칸이 몇 분인가 */
  slot_minutes: z.number().int().default(30),
  /** ★능선★ — 시각마다 «그때까지의 1등 점수» */
  timeline: z.array(FlagTimelinePointSchema).default([]),
  rows: z.array(FlagBoardRowSchema),
})
export type FlagBoard = z.infer<typeof FlagBoard>
