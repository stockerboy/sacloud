/**
 * ★경기 점수제★ — 규칙의 단일 출처 (2026-09-18 사장님).
 *
 * ── 왜 점수인가
 *
 * 2026-09-17 에 사장님이 구역 축(퍼센트)을 보시고 이렇게 말씀하셨다.
 *
 * > «이렇게 퍼센트로 보니까 진짜 잘모르겠음 누가 못했고 누가 잘했는지
 * >  (…) 걍 봤을때 별 생각이 안듦 얘네 에이가 존나 잘했나보네 이런생각같은게 잘 안듦»
 * > «우리 이거 점수제로 해서 퍼센트를 매겨볼까»
 * > «우리 2층이 다른곳에서 킬을 더 많이하고 더 쭉쭉 뚫고 이러면 점수를 더주는거야
 * >  비록 1대1은 50:50으로 비겼어도 영향력 차이가 보이잖아»
 *
 * ★뚫었나 못 뚫었나(0/1)★ 로는 «얼마나» 가 안 보인다. 점수는 그게 보인다.
 *
 * ── 누가 벌었나를 안 묻는다
 *
 * > «한명이라도 자리를 못믿을때는 그냥 라플잡은건 1점 스나잡은건 2점으로 해서 계산»
 *
 * 자리(포지션)를 특정하는 셈은 시즌 30경기가 있어야 91.7% 다 — ★한 경기로는 69.8%★ 다.
 * 그래서 점수를 ★「누가」 가 아니라 「어디서」★ 로 귀속한다. 구역은 틀릴 일이 없다.
 *
 * ── 축 여섯 (사장님이 고른 것)
 *
 * > «육각형에 스나싸움 소수싸움 스나점수 2층점수 비리베점수 숏점수 이걸 하고싶은건데»
 *
 * 이 파일은 그중 ★점수 넷★ 을 만든다. 스나싸움·소수싸움은 `clanHexV2.ts` 가 이미 센다.
 *
 * ⚠ 2026-09-18 에 현물의 다섯 경기로 ★실측 검증★ 했다 —
 *   다섯 경기 모두 킬·데스가 병영수첩 공식 집계와 한 개도 안 어긋났다.
 */

/* ------------------------------------------------------------------ 상수 --- */

/** 라플을 잡으면 1점. 사장님: «킬 많이 한건 일단 잘한거긴해» */
export const SCORE_RIFLE_KILL = 1
/** 스나를 ★그 라운드 1·2번째 킬★ 로 잡으면 2점 — 5:4 를 만드는 값이 다르다 */
export const SCORE_SNIPER_KILL_EARLY = 2
/** 3번째 킬부터는 스나를 잡아도 1점 — 이미 기운 판이다 */
export const SCORE_SNIPER_KILL_LATE = 1
/** 스나 킬에 2점을 주는 ★순번 문턱★ */
export const SCORE_SNIPER_EARLY_RANK = 2

/** 폭탄을 심고 이기면 2점 */
export const SCORE_BOMB_WIN = 2
/**
 * 폭탄을 심고 져도 ★B쪽이면 2점★.
 *
 * > «비리베는 폭탄 설치한것만으로도 대단한거임 져도 2점 줘야해» — 사장님
 */
export const SCORE_BOMB_LOSS_B = 2
/** A쪽에 심고 지면 1점 */
export const SCORE_BOMB_LOSS = 1

/* -------------------------------------------------------------- 담는 그릇 --- */

/**
 * 점수를 담는 네 칸 + 흘린 것.
 *
 * ⚠ ★`spare` 를 버리지 않는다★ — 구역을 못 읽은 킬이 있으면 조용히 사라지는 대신
 *   여기 쌓인다. 합계와 네 칸의 합이 어긋나면 그만큼이 `spare` 다.
 */
export interface MatchScoreTally {
  /** 스나로 번 점수 ★전부★. 구역을 안 본다 — 스나는 어디서든 스나다 */
  sniper: number
  /** 라플이 ★숏·홀정면 + A쪽 전부★ 에서 번 점수 */
  short: number
  /** 라플이 ★비롱·벙커·바닥·일문★ 에서 번 점수 */
  b: number
  /** 라플이 ★2층★ 에서 번 점수 */
  f2: number
  /** 구역을 못 읽은 라플 점수. ★버리지 않는다★ */
  spare: number
}

export function emptyMatchScore(): MatchScoreTally {
  return { sniper: 0, short: 0, b: 0, f2: 0, spare: 0 }
}

export function matchScoreTotal(t: MatchScoreTally): number {
  return t.sniper + t.short + t.b + t.f2 + t.spare
}

/** 점수가 들어갈 칸 이름 */
export type ScoreSlot = 'sniper' | 'short' | 'b' | 'f2' | 'spare'

/* ---------------------------------------------------------------- 판정 --- */

/**
 * 한 킬이 ★몇 점★ 인가.
 *
 * @param victimIsSniper 죽은 사람이 스나인가
 * @param rank 그 팀이 ★그 라운드에서 몇 번째로 잡은 킬★ 인가 (1부터)
 */
export function killScore(victimIsSniper: boolean, rank: number): number {
  if (!victimIsSniper) return SCORE_RIFLE_KILL
  return rank <= SCORE_SNIPER_EARLY_RANK ? SCORE_SNIPER_KILL_EARLY : SCORE_SNIPER_KILL_LATE
}

/**
 * 폭탄 한 번이 ★몇 점★ 인가.
 *
 * @param won  심은 팀이 그 라운드를 이겼나
 * @param onB  ★B쪽★ 에 심었나 — 지더라도 2점인 자리다
 */
export function bombScore(won: boolean, onB: boolean): number {
  if (won) return SCORE_BOMB_WIN
  return onB ? SCORE_BOMB_LOSS_B : SCORE_BOMB_LOSS
}

/**
 * 라플 킬 점수가 들어갈 칸.
 *
 * ⚠ ★차례가 있다★ — 한 칸이 여러 이름에 걸칠 수 있어서다 (벙커는 `BUNKER` 이면서 `BADAK` 이다).
 *   2층 → 숏·A → B 순으로 본다. 사장님이 숏칸에 A쪽을 통째로 넣으라 하셨다:
 *
 *   > «ㄱ.빼 ㄴ.숏점수»  (숏점수 하나로 A쪽까지 담는다)
 */
export function scoreSlotOf(hit: {
  inF2: boolean
  inShortOrA: boolean
  inB: boolean
}): ScoreSlot {
  if (hit.inF2) return 'f2'
  if (hit.inShortOrA) return 'short'
  if (hit.inB) return 'b'
  return 'spare'
}

/* ---------------------------------------------------------- 스나 가려내기 --- */

/** 그 선수를 스나로 볼 문턱 — 잡은 것의 절반 이상이 스나 무기면 스나다 */
export const SCORE_SNIPER_SHARE = 0.5
/** 이만큼은 잡아야 무기를 말할 수 있다. 한두 번으로는 안 정한다 */
export const SCORE_SNIPER_MIN_KILLS = 3

/**
 * 한 경기 안에서 ★누가 스나인가★.
 *
 * ⚠ 자리표(`seat`)를 쓰지 않는다 — 한 경기로 자리를 맞히면 69.8% 다.
 *   ★그 경기에서 실제로 든 총★ 이 훨씬 정확하다.
 * ⚠ 이 판정은 ★그 경기 안에서만★ 쓴다. 선수의 성질로 새어 나가면 안 된다.
 */
export function matchSnipersOf(
  kills: readonly { killer: string; sniper: boolean }[],
): Set<string> {
  const tally = new Map<string, { s: number; n: number }>()
  for (const k of kills) {
    const t = tally.get(k.killer) ?? { s: 0, n: 0 }
    t.n += 1
    if (k.sniper) t.s += 1
    tally.set(k.killer, t)
  }
  const out = new Set<string>()
  for (const [who, t] of tally) {
    if (t.n >= SCORE_SNIPER_MIN_KILLS && t.s / t.n >= SCORE_SNIPER_SHARE) out.add(who)
  }
  return out
}
