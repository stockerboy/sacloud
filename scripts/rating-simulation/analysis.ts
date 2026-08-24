/**
 * 분석 — "왜 이 순위인가"와 "이 순위가 상식적인가".
 *
 * 리더보드를 뽑는 것보다 이쪽이 중요하다. 숫자가 나왔다는 것과
 * **사람이 납득할 이유가 있다**는 것은 다른 문제다.
 */
import type { ClanLeaderRow, LeaderRow } from './season.js'
import type { SimPlayer } from './population.js'

/* -------------------------------------------------------------------------- */
/* 순위 이유                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 두 선수를 비교해 **왜 위/아래인지** 수치로 설명한다.
 * "공식이 그렇게 나왔음"은 이유가 아니다.
 */
export function explainVersus(higher: LeaderRow, lower: LeaderRow): string {
  const bits: string[] = []
  const d = (label: string, a: number, b: number, unit = '', digits = 1): void => {
    const diff = a - b
    if (Math.abs(diff) < 1e-9) return
    bits.push(`${label} ${diff > 0 ? '+' : ''}${diff.toFixed(digits)}${unit}`)
  }
  d('판수', higher.games, lower.games, '판', 0)
  d('승률', higher.winRate, lower.winRate, '%p')
  d('KD', higher.kd, lower.kd, '%p')
  d('평균 상대', higher.avgOpponentRating, lower.avgOpponentRating, '점', 0)
  d('강자전', higher.strongOpponentGames, lower.strongOpponentGames, '판', 0)
  d('업셋승', higher.upsetWins, lower.upsetWins, '회', 0)
  d('MVP율', higher.mvpRate, lower.mvpRate, '%p')
  d('신뢰도', higher.confidence * 100, lower.confidence * 100, '%p', 0)
  d('표시점수', higher.displayed, lower.displayed, '점')
  return bits.join(' · ')
}

/** 한 선수가 그 자리에 있는 이유를 한 줄로 */
export function rankReason(row: LeaderRow, field: readonly LeaderRow[]): string {
  const n = field.length
  const pct = (value: number, key: keyof LeaderRow): number => {
    const below = field.filter((r) => (r[key] as number) < value).length
    return (below / n) * 100
  }
  const parts: string[] = []
  parts.push(`승률 ${row.winRate.toFixed(1)}%(상위 ${(100 - pct(row.winRate, 'winRate')).toFixed(0)}%)`)
  parts.push(`평균상대 ${row.avgOpponentRating.toFixed(0)}(상위 ${(100 - pct(row.avgOpponentRating, 'avgOpponentRating')).toFixed(0)}%)`)
  parts.push(`KD ${row.kd.toFixed(1)}`)
  if (row.upsetWins > 0) parts.push(`업셋승 ${row.upsetWins}`)
  if (row.confidence < 1) parts.push(`신뢰도 ${(row.confidence * 100).toFixed(0)}% (내부 ${row.internal.toFixed(0)} → 표시 ${row.displayed.toFixed(0)})`)
  return parts.join(' · ')
}

/* -------------------------------------------------------------------------- */
/* 순위 역전 전수 조사                                                           */
/* -------------------------------------------------------------------------- */

export interface Inversion {
  higher: LeaderRow
  lower: LeaderRow
  verdict: 'PASS' | 'QUESTIONABLE' | 'FAIL'
  reason: string
}

/**
 * "판수도 적고 승률도 낮은데 순위가 높다" 를 전부 찾는다.
 *
 * 그 자체가 잘못은 아니다 — 훨씬 강한 상대와 싸웠다면 정당하다.
 * 그래서 **정당화 근거가 있는지**로 판정한다.
 */
export function findInversions(rows: readonly LeaderRow[], limit = 100): Inversion[] {
  const top = rows.slice(0, limit)
  const out: Inversion[] = []
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const higher = top[i]!
      const lower = top[j]!
      if (!(higher.games < lower.games && higher.winRate < lower.winRate)) continue

      const oppGap = higher.avgOpponentRating - lower.avgOpponentRating
      const kdGap = higher.kd - lower.kd
      const upsetGap = higher.upsetWins - lower.upsetWins

      let verdict: Inversion['verdict']
      let reason: string
      if (oppGap >= 80) {
        verdict = 'PASS'
        reason = `평균 상대가 ${oppGap.toFixed(0)}점 높다 — 더 어려운 일정을 소화했다`
      } else if (oppGap >= 30 && (kdGap > 3 || upsetGap > 3)) {
        verdict = 'PASS'
        reason = `상대 ${oppGap.toFixed(0)}점 우위 + ${kdGap > 3 ? `KD +${kdGap.toFixed(1)}` : `업셋승 +${upsetGap}`}`
      } else if (oppGap >= 0) {
        verdict = 'QUESTIONABLE'
        reason = `상대 우위가 ${oppGap.toFixed(0)}점뿐이다 — 설명이 약하다`
      } else {
        verdict = 'FAIL'
        reason = `판수·승률·상대 수준이 **모두** 낮은데 순위가 높다 (상대 ${oppGap.toFixed(0)}점)`
      }
      out.push({ higher, lower, verdict, reason })
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* 이상 탐지                                                                    */
/* -------------------------------------------------------------------------- */

export interface Anomaly {
  code: string
  severity: 'info' | 'warn' | 'fail'
  message: string
}

export function detectAnomalies(
  rows: readonly LeaderRow[],
  players: readonly SimPlayer[],
): Anomaly[] {
  const out: Anomaly[] = []
  const top10 = rows.slice(0, 10)
  const top20 = rows.slice(0, 20)
  const top30 = rows.slice(0, 30)
  const top100 = rows.slice(0, 100)
  const push = (code: string, severity: Anomaly['severity'], message: string): void => {
    out.push({ code, severity, message })
  }

  for (const r of top20) {
    if (r.winRate <= 45) push('LOW_WINRATE_TOP20', 'fail', `${r.name} 승률 ${r.winRate.toFixed(1)}% 인데 ${r.rank}위`)
  }
  for (const r of top30) {
    if (r.games >= 800 && r.winRate < 50)
      push('VOLUME_GRIND_TOP30', 'fail', `${r.name} ${r.games}판 승률 ${r.winRate.toFixed(1)}% 인데 ${r.rank}위 — 판수 박치기`)
  }
  /* 실력 상위 10% 기준선 — "약자만 상대했다"가 문제인지 판단할 때 쓴다.
     진짜 최상위 실력자가 약한 일정을 소화하고도 1위인 것은 **정상**이다.
     이 값은 진단용으로만 쓴다 (공식은 latent 를 보지 못한다). */
  const latentSorted = [...rows].map((r) => r.latentSkill).sort((a, b) => b - a)
  const eliteLine = latentSorted[Math.floor(latentSorted.length * 0.1)] ?? Infinity

  for (const r of top10) {
    if (r.games < 50)
      push('LOW_GAMES_TOP10', 'warn', `${r.name} ${r.games}판으로 ${r.rank}위 — 신뢰도가 약하다`)
    if (r.kd >= 65 && r.winRate < 55)
      push('KD_ONLY_TOP10', 'fail', `${r.name} KD ${r.kd.toFixed(1)} 인데 승률 ${r.winRate.toFixed(1)}% — KD만으로 상위`)
    if (r.avgOpponentRating < 2950) {
      const genuinelyElite = r.latentSkill >= eliteLine
      push(
        'WEAK_SCHEDULE_TOP10',
        genuinelyElite ? 'info' : 'fail',
        genuinelyElite
          ? `${r.name} 평균 상대 ${r.avgOpponentRating.toFixed(0)} 로 낮지만 **실제 실력이 상위 10%** 다 — 정상`
          : `${r.name} 평균 상대 ${r.avgOpponentRating.toFixed(0)} — 약자만 상대하고 ${r.rank}위`,
      )
    }
  }

  /* 실제로 잘하는데 밀린 사람 — 이게 제일 중요한 검사다 */
  const byId = new Map(players.map((p) => [p.id, p]))
  for (const r of rows) {
    const p = byId.get(r.playerId)
    if (!p) continue
    if (r.games >= 150 && r.winRate >= 62 && r.avgOpponentRating >= 3050 && r.rank > 100) {
      push(
        'STRONG_BUT_BURIED',
        'fail',
        `${r.name} ${r.games}판 ${r.winRate.toFixed(1)}% 평균상대 ${r.avgOpponentRating.toFixed(0)} 인데 ${r.rank}위`,
      )
    }
  }

  /* MVP 과대평가 */
  for (const r of top10) {
    if (r.mvpRate > 30 && r.winRate < 56)
      push('MVP_OVERWEIGHT', 'warn', `${r.name} MVP율 ${r.mvpRate.toFixed(0)}% 인데 승률 ${r.winRate.toFixed(1)}%`)
  }

  /* 신뢰도가 너무 세거나 약한가 */
  const suppressed = rows.filter((r) => r.games < 60 && r.internal - r.displayed > 250)
  if (suppressed.length > 0) {
    push(
      'CONFIDENCE_STRONG',
      'info',
      `판수 60 미만 ${suppressed.length}명이 내부 대비 250점 이상 눌렸다 (최대 ${Math.max(...suppressed.map((r) => r.internal - r.displayed)).toFixed(0)}점)`,
    )
  }
  const lowGamesHigh = top100.filter((r) => r.games < 40)
  if (lowGamesHigh.length > 3) {
    push('CONFIDENCE_WEAK', 'warn', `40판 미만인데 top100 에 ${lowGamesHigh.length}명 — 신뢰도가 약할 수 있다`)
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* 포지션 편향                                                                  */
/* -------------------------------------------------------------------------- */

export interface RoleBias {
  role: string
  count: number
  avgDisplayed: number
  avgLatent: number
  /** 표시점수 − 실제실력. 0보다 크면 그 역할이 이득을 봤다 */
  avgOverRating: number
  top20Share: number
}

export function roleBias(rows: readonly LeaderRow[]): RoleBias[] {
  const roles = [...new Set(rows.map((r) => r.role))]
  const top20 = rows.slice(0, 20)
  return roles
    .map((role) => {
      const group = rows.filter((r) => r.role === role)
      const avgDisplayed = group.reduce((a, r) => a + r.displayed, 0) / group.length
      const avgLatent = group.reduce((a, r) => a + r.latentSkill, 0) / group.length
      return {
        role,
        count: group.length,
        avgDisplayed,
        avgLatent,
        avgOverRating: avgDisplayed - avgLatent,
        top20Share: (top20.filter((r) => r.role === role).length / Math.max(1, top20.length)) * 100,
      }
    })
    .sort((a, b) => b.avgOverRating - a.avgOverRating)
}

/* -------------------------------------------------------------------------- */
/* 실력 재현도                                                                  */
/* -------------------------------------------------------------------------- */

/** 스피어만 순위상관 — 표시 순위가 실제 실력 순위를 얼마나 따라가는가 */
export function skillCorrelation(rows: readonly LeaderRow[]): number {
  const n = rows.length
  if (n < 2) return 0
  const byLatent = [...rows].sort((a, b) => b.latentSkill - a.latentSkill)
  const latentRank = new Map(byLatent.map((r, i) => [r.playerId, i + 1]))
  let sum = 0
  for (const row of rows) {
    const d = row.rank - (latentRank.get(row.playerId) ?? row.rank)
    sum += d * d
  }
  return 1 - (6 * sum) / (n * (n * n - 1))
}

/* -------------------------------------------------------------------------- */
/* 클랜 쪽                                                                      */
/* -------------------------------------------------------------------------- */

export function clanRankReason(row: ClanLeaderRow): string {
  const bonusShare =
    Math.abs(row.baseDeltaTotal) + row.bonusTotal === 0
      ? 0
      : (row.bonusTotal / (Math.abs(row.baseDeltaTotal) + row.bonusTotal)) * 100
  return [
    `${row.games}전 ${row.winRate.toFixed(1)}%`,
    `평균 본클랜원 ${row.avgMembers.toFixed(2)}명`,
    `구성보너스 누적 ${row.bonusTotal.toFixed(0)}점(기여 ${bonusShare.toFixed(0)}%)`,
    `평균 상대 ${row.avgOpponentRating.toFixed(0)}`,
  ].join(' · ')
}

export interface ClanAnomaly {
  code: string
  severity: 'info' | 'warn' | 'fail'
  message: string
}

export function detectClanAnomalies(rows: readonly ClanLeaderRow[]): ClanAnomaly[] {
  const out: ClanAnomaly[] = []
  const top10 = rows.slice(0, 10)
  for (const r of top10) {
    if (r.winRate < 50)
      out.push({ code: 'CLAN_LOW_WINRATE_TOP10', severity: 'fail', message: `${r.name} 승률 ${r.winRate.toFixed(1)}% 인데 ${r.rank}위` })
    const bonusShare = r.bonusTotal / Math.max(1, Math.abs(r.baseDeltaTotal) + r.bonusTotal)
    if (bonusShare > 0.5)
      out.push({
        code: 'CLAN_BONUS_DOMINATES',
        severity: 'fail',
        message: `${r.name} 순위의 ${(bonusShare * 100).toFixed(0)}% 가 구성 보너스다 — 실력보다 구성이 지배`,
      })
  }
  /* 실력 대비 과대/과소 */
  const sortedByLatent = [...rows].sort((a, b) => b.latentStrength - a.latentStrength)
  const latentRank = new Map(sortedByLatent.map((r, i) => [r.clanId, i + 1]))
  for (const r of rows.slice(0, 20)) {
    const lr = latentRank.get(r.clanId) ?? r.rank
    if (lr - r.rank > 25)
      out.push({
        code: 'CLAN_OVERRATED',
        severity: 'warn',
        message: `${r.name} 실제 전력 ${lr}위인데 래더 ${r.rank}위 (평균 본클랜원 ${r.avgMembers.toFixed(1)})`,
      })
  }
  return out
}

/** 클랜 rating 총량이 얼마나 새로 생겼는가 */
export interface InflationReport {
  clanCount: number
  totalRating: number
  baseline: number
  created: number
  createdPerGame: number
  avgRating: number
  topRating: number
}

export function inflationReport(
  rows: readonly ClanLeaderRow[],
  created: number,
  totalGames: number,
): InflationReport {
  const total = rows.reduce((a, r) => a + r.rating, 0)
  return {
    clanCount: rows.length,
    totalRating: total,
    baseline: rows.length * 3000,
    created,
    createdPerGame: totalGames ? created / totalGames : 0,
    avgRating: total / Math.max(1, rows.length),
    topRating: rows[0]?.rating ?? 0,
  }
}

/* -------------------------------------------------------------------------- */
/* 무엇이 순위를 만드는가 (D-141)                                                */
/* -------------------------------------------------------------------------- */

/** 스피어만 순위상관 — 두 값의 순위가 얼마나 같이 가는가 */
function spearman(rows: readonly LeaderRow[], pick: (r: LeaderRow) => number): number {
  const n = rows.length
  if (n < 2) return 0
  const sorted = [...rows].sort((a, b) => pick(b) - pick(a))
  const rankOf = new Map(sorted.map((r, i) => [r.playerId, i + 1]))
  let sum = 0
  for (const row of rows) {
    const d = row.rank - (rankOf.get(row.playerId) ?? row.rank)
    sum += d * d
  }
  return 1 - (6 * sum) / (n * (n * n - 1))
}

export interface RankDrivers {
  /** 일정을 감안한 승리의 질 (기대 대비 초과 승리) */
  winsAboveExpected: number
  /** 강자 상대 승수 */
  strongOpponentWins: number
  /** 단순 승률 */
  winRate: number
  /** 평균 상대 강도 */
  scheduleStrength: number
  kd: number
  mvpRate: number
  games: number
}

/**
 * 순위를 실제로 만드는 것이 무엇인지 잰다.
 *
 * 사용자가 요구한 순서는 명확하다.
 *   일정 감안 승리의 질 > 승률 >>> KD > MVP
 * 이 순서가 뒤집히면 그 설계는 FAIL 이다.
 */
export function rankDrivers(rows: readonly LeaderRow[]): RankDrivers {
  return {
    winsAboveExpected: spearman(rows, (r) => r.winsAboveExpected),
    strongOpponentWins: spearman(rows, (r) => r.vsTop30Wins),
    winRate: spearman(rows, (r) => r.winRate),
    scheduleStrength: spearman(rows, (r) => r.avgOpponentRating),
    kd: spearman(rows, (r) => r.kd),
    mvpRate: spearman(rows, (r) => r.mvpRate),
    games: spearman(rows, (r) => r.games),
  }
}

/**
 * 승패·상대강도가 KD/MVP 보다 확실히 큰가 — **인과로 판정한다.**
 *
 * ── 처음에 잘못 쟀다 (기록으로 남긴다)
 *   원래는 "KD 순위상관이 승률 순위상관보다 충분히 낮은가"로 판정했다. 그래서 FAIL 이 났다.
 *   그런데 퍼포먼스 비중을 **0% 로 놓아도** KD 상관이 0.761 이었다.
 *   KD 가 점수에 **아무 영향도 주지 않는 상태**에서 나온 값이다.
 *
 *   이유는 당연하다 — 잘하는 선수는 원래 KD 가 높다. 상관은 인과가 아니다.
 *   그래서 raw 상관으로 판정하면 **영원히 FAIL** 이 나오는 잘못된 잣대였다.
 *
 * ── 그래서 이렇게 판정한다
 *   1. 순위가 **일정 감안 승리의 질**과 강하게 맞물려 있는가 (≥ 0.90)
 *   2. 퍼포먼스 비중 때문에 KD 상관이 **0% 기준선보다 유의하게 올라갔는가**
 *      올라갔다면 그만큼이 KD 가 실제로 순위를 만든 몫이다
 */
export function driversVerdict(
  d: RankDrivers,
  /** 퍼포먼스 비중 0% 일 때의 KD 상관 — "공짜로 생기는" 몫 */
  baselineKd?: number,
): { pass: boolean; reason: string } {
  if (d.winsAboveExpected < 0.9) {
    return {
      pass: false,
      reason: `일정 감안 승리의 질 상관이 ${d.winsAboveExpected.toFixed(3)} 뿐이다 — 순위가 승리의 질을 못 따라간다`,
    }
  }
  if (baselineKd !== undefined) {
    const causal = d.kd - baselineKd
    if (causal > 0.02) {
      return {
        pass: false,
        reason: `KD 상관이 기준선(${baselineKd.toFixed(3)})보다 ${causal.toFixed(3)} 높다 — KD 가 순위를 만들고 있다`,
      }
    }
    return {
      pass: true,
      reason:
        `승리의 질 ${d.winsAboveExpected.toFixed(3)} · KD 는 기준선 대비 ${causal >= 0 ? '+' : ''}${causal.toFixed(3)} — ` +
        `KD 상관 ${d.kd.toFixed(3)} 은 대부분 "잘하면 KD 도 높다" 는 자연 상관이다`,
    }
  }
  return { pass: true, reason: `일정 감안 승리의 질 상관 ${d.winsAboveExpected.toFixed(3)}` }
}

/** 표시 점수대별 인원 — 4900/5000 희귀성 검증 */
export function bandCounts(rows: readonly LeaderRow[]): Record<string, number> {
  const bands = [4000, 4100, 4300, 4500, 4700, 4800, 4900, 5000]
  const out: Record<string, number> = {}
  for (const b of bands) out[`${b}+`] = rows.filter((r) => r.displayed >= b).length
  return out
}
