/**
 * ★선수 추이 그래프 자료★ — 9/3 → 10/1 하루 하나 (2026-09-10 · 사장님 지시서 그대로)
 *
 *   - 출발점은 무조건 9/3 06:00 = 0%. 첫 경기 날로 당기지 않는다
 *   - 하루 경계는 **새벽 6시(KST)**. 9/9 06:00 ~ 9/10 06:00 이 「9/9」
 *   - 경기 없는 날은 **전날 값을 그대로 이어 간다** (2026-09-11 사장님: 0 으로 떨어뜨리지 않는다).
 *     첫 경기 전까지는 0 이 이어진다
 *   - 오늘은 열 때마다 지금까지의 경기로 다시 센다. 6시가 지나면 그날 값으로 굳는다
 *   - 아직 안 온 날(미래)은 `future: true` — 화면이 그리지 않는다
 *   - DAY = 그날 하루 값 (2판 미만이면 «안 찍힘» → 전날 값 유지) · 누적 = 9/3 부터 그날까지 쌓인 값
 *   - `points` = 그날 경기마다 «그 경기 직후» 값 — 선이 하루 안에서도 움직이게 (2026-09-11 사장님:
 *     «너무 직선적이야»). 지어내는 것이 아니라 경기 하나하나의 실제 누적값이다
 *   - Y 는 0~100 고정
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

interface Acc {
  games: number
  win: number
  lose: number
  kill: number
  death: number
}
const add = (a: Acc, row: TrendRow): Acc => ({
  games: a.games + 1,
  win: a.win + (row.winnerSide === row.side ? 1 : 0),
  lose: a.lose + (row.winnerSide !== row.side && (row.winnerSide === 'red' || row.winnerSide === 'blue') ? 1 : 0),
  kill: a.kill + (row.kill !== null && row.death !== null ? row.kill : 0),
  death: a.death + (row.kill !== null && row.death !== null ? row.death : 0),
})
const empty = (): Acc => ({ games: 0, win: 0, lose: 0, kill: 0, death: 0 })

export function buildPlayerTrend(rows: readonly TrendRow[], now: Date = new Date()): PlayerTrendDay[] {
  const days = Math.floor((TREND_TO.getTime() - TREND_FROM.getTime()) / DAY) + 1
  const todayIndex = trendDayIndex(now)
  const byDay: TrendRow[][] = Array.from({ length: days }, () => [])
  for (const row of rows) {
    const i = trendDayIndex(row.startAt)
    if (i < 0 || i >= days) continue
    ;(byDay[i] as TrendRow[]).push(row)
  }
  let cum = empty()
  let prevWr = 0
  let prevKd = 0
  return byDay.map((list, i) => {
    list.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    const dayStart = TREND_FROM.getTime() + i * DAY
    let day = empty()
    const points: PlayerTrendDay['points'] = []
    const enough = list.length >= TREND_MIN_GAMES
    for (const row of list) {
      day = add(day, row)
      cum = add(cum, row)
      points.push({
        at: Math.max(0, Math.min(1, (row.startAt.getTime() - dayStart) / DAY)),
        /* DAY 값은 그날 2판 이상일 때만 움직인다 — 아니면 전날 값에 머문다 */
        win_rate: enough ? pct(day.win, day.win + day.lose) : prevWr,
        kd: enough ? pct(day.kill, day.kill + day.death) : prevKd,
        cum_win_rate: pct(cum.win, cum.win + cum.lose),
        cum_kd: pct(cum.kill, cum.kill + cum.death),
      })
    }
    const { date, label } = dateOfIndex(i)
    const winRate = enough ? pct(day.win, day.win + day.lose) : prevWr
    const kd = enough ? pct(day.kill, day.kill + day.death) : prevKd
    prevWr = winRate
    prevKd = kd
    return {
      date,
      label,
      games: day.games,
      win: day.win,
      lose: day.lose,
      kill: day.kill,
      death: day.death,
      win_rate: winRate,
      kd,
      cum_games: cum.games,
      cum_win_rate: pct(cum.win, cum.win + cum.lose),
      cum_kd: pct(cum.kill, cum.kill + cum.death),
      future: i > todayIndex,
      today: i === todayIndex,
      points,
    }
  })
}
