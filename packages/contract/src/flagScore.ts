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
export function dayAxisValues(t: FlagDayTally): Record<FlagAxisKey, number | null> {
  const duelWon = t.weapon === 1 ? t.sniperDuelWon : t.weapon === 0 ? t.rifleDuelWon : 0
  const duelLost = t.weapon === 1 ? t.sniperDuelLost : t.weapon === 0 ? t.rifleDuelLost : 0
  const duels = duelWon + duelLost
  return {
    save: t.aloneRounds >= FLAG_MIN_SITUATION_ROUNDS ? round1((t.aloneWon / t.aloneRounds) * 100) : null,
    duel: t.weapon !== null && duels >= FLAG_MIN_DUELS ? round1((duelWon / duels) * 100) : null,
    carry: t.games > 0 ? Math.round((t.kill / t.games) * 100) / 100 : null,
    opening: t.rounds > 0 ? round1((t.firstKills / t.rounds) * 100) : null,
    burst: t.rounds > 0 ? round1((t.burstRounds / t.rounds) * 100) : null,
    outnumbered: t.outRounds >= FLAG_MIN_SITUATION_ROUNDS ? round1((t.outWon / t.outRounds) * 100) : null,
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
