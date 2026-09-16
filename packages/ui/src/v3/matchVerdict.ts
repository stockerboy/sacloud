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
 * ★표본이 적을수록 더 큰 차이를 요구한다★ (2026-09-16 사장님:
 * «스나영향력이 압도적으로 높아서 이긴 그런 경기는 왜 안보이지»).
 *
 * ⚠ 첫 판은 표본 10 미만을 ★통째로 버렸다.★ 그런데 한 판에서 스나싸움은 보통
 *   5~10번, 스나영향력은 «스나가 일한 라운드» 5~8개라 ★거의 늘 탈락★ 했다.
 *   그래서 스나로 이긴 판은 이유가 안 나왔다.
 *
 * 이제 두 문턱을 둔다 — 적은 표본은 ★«압도적» 일 때만★ 이유가 된다.
 */
const MIN_SAMPLE = 5
/** 이만큼 쌓였으면 «보통 차이» 로도 이유가 된다 */
const SOLID_SAMPLE = 10
/** 표본이 넉넉할 때의 문턱 (퍼센트포인트) */
const MIN_GAP = 8
/** 표본이 얇을 때의 문턱 — 이만큼 벌어져야 «압도적» 이다 */
const MIN_GAP_THIN = 30

/** 축마다 «무엇이 갈렸나» 를 사람 말로 */
const PHRASE: Readonly<Record<string, string>> = {
  sniperDuel: '롱 스나 싸움',
  outnumbered: '수적 열세 상황',
  save: '한 명 남은 상황',
  riflePower: '스나가 빠진 뒤의 화력',
  /* ★2026-09-16 밤 — 뜻이 갈렸다★ (사장님): 무기별 점수를 상대와 견준 차다 */
  sniperInfluence: '스나들의 판 가르기',
  rifleInfluence: '라플들의 판 가르기',
  blockChance: '먼저 맞고 시작한 라운드',
  openChance: '라운드를 먼저 여는 힘',
  trade: '동료가 당한 직후의 되받아치기',
  firstBloodless: '라운드 초반 크랙',
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
  /** 표본이 얇은 축인가 — 문장에 «◯번뿐이지만» 을 붙인다 */
  thin: boolean
  /** 두 팀 중 큰 쪽 분모 */
  sample: number
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
    if (w.denominator === null || l.denominator === null) continue
    const sample = Math.max(w.denominator, l.denominator)
    /* 세 번 중 두 번을 원인이라 할 수는 없다 */
    if (sample < MIN_SAMPLE) continue
    const wp = pctOf(w)
    const lp = pctOf(l)
    if (wp === null || lp === null) continue
    /* 이긴 팀이 앞선 축만 — 진 팀이 앞선 축은 «졌는데 이겼다» 라 이유가 못 된다 */
    const gap = wp - lp
    /* ★표본이 얇으면 «압도적» 일 때만★ (2026-09-16 사장님) */
    const thin = sample < SOLID_SAMPLE
    if (gap < (thin ? MIN_GAP_THIN : MIN_GAP)) continue
    if (best !== null && gap <= best.wonPct - best.lostPct) continue
    best = {
      key: w.key,
      phrase: PHRASE[w.key] ?? w.label,
      wonCount: `${w.numerator}/${w.denominator}`,
      lostCount: `${l.numerator}/${l.denominator}`,
      wonPct: wp,
      lostPct: lp,
      thin,
      sample,
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
  /*
   * ★표본이 얇으면 그렇다고 밝힌다★ (2026-09-16) — 숨기면 «5번 중 4번» 이
   *   «80%» 로만 보여 커 보인다. 사장님이 처음 물으신 것이 그 문제였다.
   */
  const head = v.thin ? `${v.phrase}에서 갈렸습니다 (${v.sample}번뿐이지만 크게 벌어졌습니다)` : `${v.phrase}에서 갈렸습니다`
  return (
    `${head} — ` +
    `${wonName} ${v.wonCount}(${Math.round(v.wonPct)}%) · ` +
    `${lostName} ${v.lostCount}(${Math.round(v.lostPct)}%)`
  )
}
