import type { ClanHexagonV2 } from '@sacloud/contract'

/**
 * ★이 판이 어디서 갈렸나 — 한 줄로 써 준다★ (2026-09-16 사장님).
 *
 * > «그럼 유저들은 저 사진에서 어케 납득을 해야함 / 우리가 진이유가 라이플화력과
 * >  적은 교환율 때문이다? 다른건 다 압도했는데?»
 * > «아 어떡하지 어지럽다; ★걍 진팀이 진 이유를 알면 되는데★»
 *
 * ── 왜 필요한가
 *   여섯 축을 나란히 보여 주면 ★유저가 스스로 해석해야 한다.★ 그런데 퍼센트는
 *   표본을 감춘다 — «스나싸움 60%» 가 사실은 5번 중 3번이고, «라이플화력 53%» 는
 *   43킬 위의 값이다. 그래서 «다 압도했는데 왜 졌지» 가 된다.
 *
 *   축을 더 만드는 대신 ★답을 우리가 써 준다.★
 *
 * ── 고르는 법 (지어내지 않는다)
 *   ① ★표본이 충분한 축만★ 후보다 (`MIN_SAMPLE`). 5번짜리 축은 안 뽑힌다
 *   ② 그중 ★두 팀 차이가 가장 큰 축★ 하나를 고른다
 *   ③ 그 축의 ★실제 횟수★ 로 문장을 만든다 — 퍼센트만 적지 않는다
 *
 *   후보가 하나도 없으면 `null` 이다. 화면은 그때 아무 말도 안 한다 —
 *   ★억지로 이유를 만들지 않는다.★
 */

/**
 * ★이만큼은 쌓여야 «갈렸다» 고 말한다★
 *
 * 한 판이 보통 10~13 라운드다. 열 번도 안 일어난 일을 «이래서 졌다» 라고 하면
 * 한두 번 차이를 원인으로 지목하는 셈이다 — 실측에서 스나싸움이 딱 그랬다
 * (5번 중 3:2 인데 60% 대 40% 로 보인다).
 */
const MIN_SAMPLE = 10

/** 이만큼은 벌어져야 «갈렸다» 고 말한다 (퍼센트포인트) */
const MIN_GAP = 8

/** 축마다 «무엇이 갈렸나» 를 사람 말로 */
const PHRASE: Readonly<Record<string, string>> = {
  sniperDuel: '롱 스나 싸움',
  outnumbered: '수적 열세 상황',
  save: '한 명 남은 상황',
  riflePower: '스나가 빠진 뒤의 화력',
  sniperInfluence: '스나가 살아 있을 때와 아닐 때의 차이',
  trade: '동료가 당한 직후의 되받아치기',
  firstBloodless: '라운드 초반 선제 피해',
}

export interface MatchVerdict {
  /** 갈린 축 */
  key: string
  /** «롱 스나 싸움» 같은 사람 말 */
  phrase: string
  /** 이긴 팀 쪽 «11/43» */
  wonCount: string
  /** 진 팀 쪽 «7/46» */
  lostCount: string
  /** 이긴 팀 값 (%) */
  wonPct: number
  /** 진 팀 값 (%) */
  lostPct: number
}

/** 분자·분모가 없으면 «잴 수 없음» 이다 — 0 으로 치지 않는다 */
const pctOf = (axis: {
  numerator: number | null
  denominator: number | null
}): number | null =>
  axis.numerator === null || axis.denominator === null || axis.denominator === 0
    ? null
    : (axis.numerator / axis.denominator) * 100

/**
 * 두 팀 육각을 받아 ★가장 크게 갈린 축★ 하나를 돌려준다.
 *
 * ⚠ ★이긴 팀이 앞선 축만 본다.★ 진 팀이 앞선 축은 «졌는데 이겼다» 라 이유가 안 된다.
 *   사장님이 본 판이 정확히 그랬다 — 진 팀이 네 축에서 앞섰다.
 */
export function matchVerdict(
  won: ClanHexagonV2 | null,
  lost: ClanHexagonV2 | null,
): MatchVerdict | null {
  if (won === null || lost === null) return null
  let best: MatchVerdict | null = null
  for (const w of won.axes) {
    const l = lost.axes.find((a) => a.key === w.key) ?? null
    if (l === null) continue
    /* 못 잰 축은 건너뛴다 — 없는 값으로 이유를 만들지 않는다 */
    if (w.value === null || l.value === null) continue
    /* ★표본이 얇으면 후보가 아니다★ — 한두 번 차이를 원인이라고 하지 않는다 */
    if (w.denominator === null || l.denominator === null) continue
    const sample = Math.max(w.denominator, l.denominator)
    if (sample < MIN_SAMPLE) continue
    const wp = pctOf(w)
    const lp = pctOf(l)
    if (wp === null || lp === null) continue
    /* 이긴 팀이 앞선 축만 — 진 팀이 앞선 축은 «졌는데 이겼다» 라 이유가 못 된다 */
    const gap = wp - lp
    if (gap < MIN_GAP) continue
    if (best !== null && gap <= best.wonPct - best.lostPct) continue
    best = {
      key: w.key,
      phrase: PHRASE[w.key] ?? w.label,
      wonCount: `${w.numerator}/${w.denominator}`,
      lostCount: `${l.numerator}/${l.denominator}`,
      wonPct: wp,
      lostPct: lp,
    }
  }
  return best
}

/**
 * 한 줄 문장을 만든다.
 *
 * ★숫자를 그대로 넣는다★ — «몇 번 중 몇 번» 이 없으면 퍼센트가 또 표본을 감춘다.
 */
export function matchVerdictText(v: MatchVerdict, wonName: string, lostName: string): string {
  return (
    `${v.phrase}에서 갈렸습니다 — ` +
    `${wonName} ${v.wonCount}(${Math.round(v.wonPct)}%) · ` +
    `${lostName} ${v.lostCount}(${Math.round(v.lostPct)}%)`
  )
}
