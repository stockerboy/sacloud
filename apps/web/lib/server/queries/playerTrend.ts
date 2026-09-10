/**
 * ★선수 추이 그래프 자료★ — 9/3 → 10/1 하루 하나씩 (2026-09-10 · 사장님 지시서 그대로)
 *
 *   - 시작점은 무조건 9/3 = 0%. 게임이 없던 날은 0% 로 바닥에 붙는다. 첫 경기 날로 당기지 않는다
 *   - 하루 경계는 **새벽 6시(KST)**. 9/9 06:00 ~ 9/10 06:00 이 「9/9」
 *   - 오늘은 열 때마다 지금까지의 경기로 다시 센다. 6시가 지나면 그날 값으로 굳는다
 *   - 아직 안 온 날(미래)은 `future: true` — 화면이 그리지 않는다
 *   - DAY = 그날 하루 값 (2판 미만이면 «안 찍힘» = 0%) · 누적 = 9/3 부터 그날까지 쌓인 값
 *   - Y 는 0~100 고정 — 값에 맞춰 늘리지 않는다
 *
 * 순수 함수다. 재료는 `playerLadderRows` (시즌 0 창 안의 래더 경기).
 */
import type { PlayerTrendDay } from '@sacloud/contract'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** 9/3 06:00 KST */
export const TREND_FROM = new Date('2026-09-02T21:00:00.000Z')
/** 10/1 — 마지막 칸 (10/1 06:00 KST 로 닫힌다) */
export const TREND_TO = new Date('2026-09-30T21:00:00.000Z')
/** 그날 하루 값을 찍는 최소 판수 — 사장님: «2판 미만은 안 찍히고 두 판부터 찍혀» */
export const TREND_MIN_GAMES = 2

export interface TrendRow {
  startAt: Date
  winnerSide: string
  side: string
  kill: number | null
  death: number | null
}

/** 경기 시각 → 그래프 날짜 칸 번호 (0 = 9/3). 6시 경계 */
export function trendDayIndex(at: Date): number {
  return Math.floor((at.getTime() - TREND_FROM.getTime()) / DAY)
}

function dateOfIndex(index: number): { date: string; label: string } {
  /* 칸의 시작(9/2 21:00Z + i일)은 KST 로 그날 06:00 이다 — 9시간을 더해 KST 달력의 날짜를 읽는다 */
  const kst = new Date(TREND_FROM.getTime() + index * DAY + 9 * HOUR)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth() + 1
  const d = kst.getUTCDate()
  return { date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, label: `${m}/${d}` }
}

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

export function buildPlayerTrend(rows: readonly TrendRow[], now: Date = new Date()): PlayerTrendDay[] {
  const days = Math.floor((TREND_TO.getTime() - TREND_FROM.getTime()) / DAY) + 1
  const todayIndex = trendDayIndex(now)
  const buckets = Array.from({ length: days }, () => ({ games: 0, win: 0, lose: 0, kill: 0, death: 0 }))
  for (const row of rows) {
    const i = trendDayIndex(row.startAt)
    if (i < 0 || i >= days) continue
    const b = buckets[i] as (typeof buckets)[number]
    b.games += 1
    if (row.winnerSide === row.side) b.win += 1
    else if (row.winnerSide === 'red' || row.winnerSide === 'blue') b.lose += 1
    if (row.kill !== null && row.death !== null) {
      b.kill += row.kill
      b.death += row.death
    }
  }
  let cum = { games: 0, win: 0, lose: 0, kill: 0, death: 0 }
  return buckets.map((b, i) => {
    cum = { games: cum.games + b.games, win: cum.win + b.win, lose: cum.lose + b.lose, kill: cum.kill + b.kill, death: cum.death + b.death }
    const { date, label } = dateOfIndex(i)
    const enough = b.games >= TREND_MIN_GAMES
    return {
      date,
      label,
      games: b.games,
      win: b.win,
      lose: b.lose,
      kill: b.kill,
      death: b.death,
      win_rate: enough ? pct(b.win, b.win + b.lose) : 0,
      kd: enough ? pct(b.kill, b.kill + b.death) : 0,
      cum_games: cum.games,
      cum_win_rate: pct(cum.win, cum.win + cum.lose),
      cum_kd: pct(cum.kill, cum.kill + cum.death),
      future: i > todayIndex,
      today: i === todayIndex,
    }
  })
}
