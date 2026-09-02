/**
 * **주간 추이** — 선수·클랜 카드의 그래프 (2026-09-02 사용자 지시).
 *
 * > "일주일단위로 킬데스 그래프로 찍어주기 / 아마 시즌이 총 3개월or6개월정도 할거임"
 * > "날짜는 굳이 안보여줘도 되고 일주일 단위로 찍고 찍을때마다 점을 찍어줘
 * >  그걸 다 이으면 그래프가 되는거야 그리고 점에 %를 써줘"
 * > "만약 일주일간 플레이를 하지 않았다면 킬뎃승률전부 똑같을테니 그걸 각각 전선으로 이어"
 *
 * ── ★값은 **누적**이다★
 *   마지막 인용문이 이 설계를 정한다. 「안 뛰면 값이 똑같다」가 성립하려면
 *   그 주만의 성적이 아니라 **시즌 시작부터 그 주 끝까지의 누적**이어야 한다.
 *   그 주만 세면 안 뛴 주는 값이 **없는** 것이지 **같은** 것이 아니다.
 *
 *   덤으로 순위와도 뜻이 맞는다 — 순위는 원래 누적으로만 정의된다.
 *   그래서 네 선이 전부 같은 뜻의 축 위에 놓인다: **「그 시점까지의 나」**.
 *
 * ── 주의 경계는 **목요일 00:00 KST** (2026-09-02 저녁 · 지시 #19)
 *
 *   > "모든 킬데스와 승률 그래프의 찍는 날은 수요일 00시(목요일로넘어가는 경계)로 한다"
 *
 *   ★사장님 확인 완료 (2026-09-02)★ — **수요일 23:59 → 목요일 00:00 경계**가 맞다.
 *   > "수욜 오후 11시59분에서 목요일로 넘어갈때를 말한것이다."
 *   처음 원문은 두 가지로 읽혔고(「수요일 00시」= 화→수 / 괄호 「목요일로 넘어가는 경계」= 수→목)
 *   괄호 쪽을 골라 잡아 두었는데, 그 값이 맞다고 확인됐다. 값은 `WEEK_BOUNDARY.current`
 *   **한 곳**에만 있다. 다른 해석(`wed00`)은 표에 남겨 둔다 — 쓰지 않는다.
 *
 *   ⚠ 정정 — 그 전(2026-09-02 아침)에는 **월요일 오전 7시 KST** 였다.
 *     하루의 경계가 오전 7시라는 것(D-186 · `kstDayStart`)을 그대로 쓰고 그중 월요일을
 *     주의 시작으로 삼았다. 그 규칙은 `WEEK_BOUNDARY.legacy = 'mon07'` 과 옛 `weekStart()`
 *     로 **그대로 남아 있다** (`CLAUDE.md` 10-4). 지우지 않는다.
 *     경계를 바꾸면 화면의 주간 그래프 칸이 전부 달라진다 — 그것이 의도다.
 *
 * ── 안 뛴 주도 **점을 찍는다**
 *   빼면 선이 끊기거나 두 점이 멀리 이어져 「그 사이에 뭔가 있었다」로 읽힌다.
 *   누적값을 그대로 들고 가면 **수평선**이 되고, 그것이 사실이다 —
 *   그 주에 아무 일도 없었다는 뜻이다. `played: false` 로 구분만 해 둔다.
 *
 * ── 아직 한 판도 안 뛴 주는 `null` 이다
 *   시즌 시작 직후 아직 기록이 없는 구간까지 0% 로 그리면 **거짓 하락선**이 생긴다.
 *   `null` 은 「아직 없다」이고 화면은 그 앞 구간을 그리지 않는다 (D-106 과 같은 태도).
 */

import { z } from 'zod'

/** 한 주 = 7일 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 볼 수 있는 구간 — 사용자가 고른 네 가지.
 *
 * > "한달단위(5주) 두달단위(10주) 세달단위(15주) 6개월단위(25주)
 * >  총 4개의 필터로 볼 수 있게끔 해줘 기본값은 최근5주치를 보여줘."
 *
 * 주 수는 **사용자가 적어 준 값 그대로**다. 우리가 4.35주/달로 고쳐 계산하지 않는다.
 */
export const WEEKLY_RANGES = [
  { weeks: 5, label: '1달' },
  { weeks: 10, label: '2달' },
  { weeks: 15, label: '3달' },
  { weeks: 25, label: '6개월' },
] as const

export type WeeklyRangeWeeks = (typeof WEEKLY_RANGES)[number]['weeks']

/** 처음 보여 줄 구간 — 사용자 지정 «기본값은 최근5주치» */
export const WEEKLY_DEFAULT_WEEKS: WeeklyRangeWeeks = 5

/** 가장 긴 구간. 서버는 여기까지만 만든다 */
export const WEEKLY_MAX_WEEKS: WeeklyRangeWeeks = 25

/**
 * 한 주의 값. **전부 그 주가 끝난 시점의 누적치**다.
 *
 * 화면은 날짜를 쓰지 않는다 (사용자 지시). `start` 는 대조·디버깅용으로만 남긴다.
 */
export const WeeklyPoint = z.object({
  /** 이 주가 시작한 시각 (ISO). **화면은 쓰지 않는다** */
  start: z.string(),
  /** 그 주에 한 판이라도 뛰었나. 거짓이면 앞 주 값이 그대로 이어진다 */
  played: z.boolean(),
  /** 그 주에 뛴 판수 (그 주만의 값 — 유일하게 누적이 아니다) */
  games: z.number().int().min(0),
  /** 누적 스나이퍼 킬데스 %. 스나로 뛴 판이 아직 없으면 `null` */
  sniper_kd: z.number().nullable(),
  /** 누적 라이플 킬데스 %. 라플로 뛴 판이 아직 없으면 `null` */
  rifle_kd: z.number().nullable(),
  /** 누적 승률 %. 아직 한 판도 없으면 `null` */
  win_rate: z.number().nullable(),
  /**
   * 그 주 끝 시점의 개인랭킹 순위. **주간 순위 기록이 쌓이기 전에는 `null`** 이다.
   *
   * 지어내지 않는다 — 과거 순위는 그때의 **모든 선수 점수**를 알아야 나오는 값이고,
   * 지금 저장돼 있는 것은 현재 점수뿐이다.
   */
  rank: z.number().int().min(1).nullable(),
})
export type WeeklyPoint = z.infer<typeof WeeklyPoint>

/** 카드 하나가 받는 것 */
export const WeeklyTrend = z.object({
  /** 오래된 주 → 최근 주 순서. 길이는 최대 `WEEKLY_MAX_WEEKS` */
  points: z.array(WeeklyPoint),
  /** 순위 선을 그릴 수 있나 — 한 점이라도 `rank` 가 있으면 참 */
  has_rank: z.boolean(),
})
export type WeeklyTrend = z.infer<typeof WeeklyTrend>

/* ========================================================================== */
/* 주 경계 — **여기 하나뿐이다** (지시 #19)                                      */
/* ========================================================================== */

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 주를 어디서 자르나.
 *
 *   `mon07`  월요일 07:00 KST — 옛 규칙 (2026-09-02 아침까지). 하루 경계(D-186) 위에 얹은 것
 *   `wed00`  수요일 00:00 KST — 원문 「수요일 00시」를 글자대로 읽은 해석. **쓰지 않는다** (아래 확인)
 *   `thu00`  목요일 00:00 KST — ★확정★ 수요일 23:59 → 목요일 00:00 경계
 */
export type WeekBoundaryKind = 'mon07' | 'wed00' | 'thu00'

/**
 * ★주 경계 상수 — 바꿀 곳은 `current` 한 줄이다★
 *
 * **사장님 확인 완료 (2026-09-02): 수요일 23:59 → 목요일 00:00 경계.** `current` 는 `thu00` 이다.
 * `legacy` 는 지우지 않는다 — 옛 그래프 칸을 다시 만들어 대조할 때 쓴다 (`CLAUDE.md` 10-4).
 */
export const WEEK_BOUNDARY = {
  legacy: 'mon07',
  current: 'thu00',
} as const satisfies Record<'legacy' | 'current', WeekBoundaryKind>

/** 요일(0=일 … 6=토)과 KST 시각. 표가 하나라 세 규칙이 같은 함수를 탄다 */
const WEEK_BOUNDARY_RULE: Record<WeekBoundaryKind, { weekday: number; hourKst: number }> = {
  mon07: { weekday: 1, hourKst: 7 },
  wed00: { weekday: 3, hourKst: 0 },
  thu00: { weekday: 4, hourKst: 0 },
}

/**
 * 그 시각이 속한 **주의 시작** (UTC `Date`). 기본은 `WEEK_BOUNDARY.current`.
 *
 * 한국은 서머타임이 없으므로 KST = UTC+9 고정으로 계산한다 — 그래서 주 간격이 항상 정확히
 * 7일이고, 연말을 넘어가도 `Date.UTC` 의 날짜 산술이 알아서 처리한다.
 *
 * `mon07` 을 주면 옛 `weekStart(at, kstDayStart)` 와 **같은 값**이 나온다 (테스트로 고정).
 */
export function weekStartOf(at: Date, boundary: WeekBoundaryKind = WEEK_BOUNDARY.current): Date {
  const { weekday, hourKst } = WEEK_BOUNDARY_RULE[boundary]
  /* KST 벽시계를 UTC 자리에 놓고 계산한 뒤 마지막에 9시간을 되돌린다 */
  const wall = new Date(at.getTime() + KST_OFFSET_MS)
  /* 경계 시각 전이면 아직 전날 안이다 (하루 경계와 같은 태도) */
  const dayOffset = wall.getUTCHours() < hourKst ? -1 : 0
  const dayWall = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate() + dayOffset,
    hourKst,
  )
  const backDays = (new Date(dayWall).getUTCDay() - weekday + 7) % 7
  return new Date(dayWall - backDays * DAY_MS - KST_OFFSET_MS)
}

/**
 * `from` **뒤**부터 `to` **까지** 지나는 주 경계 시각을 오래된 것부터 (from < t ≤ to).
 *
 * 주간 순위 스냅샷이 「어느 시점의 순위를 찍어야 하나」를 이것으로 안다 —
 * 시즌 시작(`from`)부터 지금(`to`)까지 지난 경계마다 한 번씩이다.
 */
export function weekBoundariesBetween(
  from: Date,
  to: Date,
  boundary: WeekBoundaryKind = WEEK_BOUNDARY.current,
): Date[] {
  const out: Date[] = []
  let t = weekStartOf(from, boundary).getTime()
  if (t <= from.getTime()) t += WEEK_MS
  while (t <= to.getTime()) {
    out.push(new Date(t))
    t += WEEK_MS
  }
  return out
}

/**
 * **옛 규칙** — 그 시각이 속한 주의 시작 (월요일 오전 7시 KST). 지우지 않는다 (`CLAUDE.md` 10-4).
 *
 * `kstDayStart` 와 같은 규칙 위에 얹는다 — 오전 7시 전이면 전날로 친다.
 * 새 코드는 `weekStartOf(at)` 을 쓴다. 이 함수는 `WEEK_BOUNDARY.legacy` 경로에서만 불린다.
 */
export function weekStart(at: Date, dayStart: (d: Date) => Date): Date {
  const start = dayStart(at)
  /* `start` 는 그 하루가 시작한 UTC 시각이다. 그 하루가 KST 로 무슨 요일인지 본다.
     KST = UTC+9 이고 하루가 07:00 KST 에 시작하므로, 9시간을 더하면 그날 07:00 이 된다 */
  const kst = new Date(start.getTime() + 9 * 60 * 60 * 1000)
  const weekday = kst.getUTCDay() /* 0=일 1=월 … 6=토 */
  const backDays = (weekday + 6) % 7 /* 월요일이면 0, 일요일이면 6 */
  return new Date(start.getTime() - backDays * 24 * 60 * 60 * 1000)
}

/** 이번 주의 시작 — `mon07` 이면 옛 함수를 그대로 탄다, 나머지는 새 규칙 */
function thisWeekStart(now: Date, dayStart: (d: Date) => Date, boundary: WeekBoundaryKind): Date {
  return boundary === 'mon07' ? weekStart(now, dayStart) : weekStartOf(now, boundary)
}

/**
 * 최근 `weeks` 주의 **끝 시각**을 오래된 것부터 만든다.
 *
 * 마지막 원소는 `now` 다 — 이번 주는 아직 안 끝났고, 그 시점까지의 누적이 맞다.
 * 「이번 주가 끝나야 점을 찍는다」로 하면 오늘 뛴 판이 일주일 동안 안 보인다.
 *
 * `dayStart` 는 옛 경계(`mon07`)에서만 쓴다. 인자를 남겨 둔 것은 호출부를 안 바꾸기 위해서다.
 */
export function weekEnds(
  now: Date,
  weeks: number,
  dayStart: (d: Date) => Date,
  boundary: WeekBoundaryKind = WEEK_BOUNDARY.current,
): Date[] {
  const thisWeek = thisWeekStart(now, dayStart, boundary)
  const out: Date[] = []
  for (let i = weeks - 1; i >= 1; i -= 1) {
    /* i 주 전 주의 **끝** = (i-1) 주 전 주의 시작 */
    out.push(new Date(thisWeek.getTime() - (i - 1) * WEEK_MS))
  }
  out.push(now)
  return out
}

/** 그 주가 시작한 시각 — `weekEnds` 와 짝이다 */
export function weekStartsOf(
  now: Date,
  weeks: number,
  dayStart: (d: Date) => Date,
  boundary: WeekBoundaryKind = WEEK_BOUNDARY.current,
): Date[] {
  const thisWeek = thisWeekStart(now, dayStart, boundary)
  const out: Date[] = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    out.push(new Date(thisWeek.getTime() - i * WEEK_MS))
  }
  return out
}

/**
 * 순위 색 (2026-09-02 사용자 지시).
 *
 * > "1위부터-10위 밝은 노란색 / 11위부터 50위 파란색 / 51위부터 100위 갈색
 * >  / 101위부터 200위 초록색 / 201위부터는 전부 하얀색"
 *
 * **경계값은 사용자가 준 그대로다.** 선수 카드와 클랜 카드가 같은 함수를 쓴다 —
 * 「클랜은 순위-색깔체계 선수카드와 동일」이라고 못박아 주셨다.
 */
export type RankTone = 'gold' | 'blue' | 'brown' | 'green' | 'plain'

export function rankTone(rank: number | null | undefined): RankTone | null {
  if (rank == null || rank <= 0) return null
  if (rank <= 10) return 'gold'
  if (rank <= 50) return 'blue'
  if (rank <= 100) return 'brown'
  if (rank <= 200) return 'green'
  return 'plain'
}

/**
 * 무소속리그(IPL)에서 **킬뎃을 보여 주는 순위 상한** (2026-09-02 사용자 지시).
 *
 * > "무소속은 킬뎃을 개인랭킹 1-100위까지만 보여주고 문구를 남겨
 * >  IPL은 top100만 킬뎃이 보인다고"
 *
 * ⚠ 이 값이 **D-107 을 대신한다.** 그전까지 무소속리그는 누적 킬·데스·킬뎃을
 *   **전원 감췄다.** 이제는 상위 100위까지 보인다. 나머지는 여전히 감추고,
 *   화면이 그 이유를 한 줄로 적는다 — 없는 값이 아니라 **안 보여 주는 값**이다.
 */
export const INDEPENDENT_KD_RANK_LIMIT = 100

/** 그 문구. 한 곳에서만 온다 */
export const INDEPENDENT_KD_NOTE = `IPL은 top${INDEPENDENT_KD_RANK_LIMIT}만 킬뎃이 보입니다`

/** 이 순위면 무소속리그에서도 킬뎃을 보여 주나 */
export function independentKdVisible(rank: number | null | undefined): boolean {
  return rank != null && rank > 0 && rank <= INDEPENDENT_KD_RANK_LIMIT
}

/* ========================================================================== */
/* 접는 규칙 — **여기 하나뿐이다**                                              */
/* ========================================================================== */

/**
 * 주간 추이를 만드는 데 필요한 **참가 기록 한 줄**의 최소 모양.
 *
 * 실제 서버는 `PlayerLadderRow` 를, Mock 은 픽스처를 이 모양으로 맞춰서 넘긴다.
 * **세는 일은 아래 `foldWeekly` 하나가 한다** — 두 곳에서 따로 세면
 * mock ↔ live 값 대조가 어긋난다 (`packages/mock` 이 여러 곳에 적어 둔 그 이유다).
 */
export interface WeeklyRow {
  /** 정렬 타이브레이커. 같은 시각 경기가 있어도 결과가 흔들리지 않게 한다 */
  matchId: string
  startAt: Date
  /** 이 선수가 뛴 진영 */
  side: string
  winnerSide: string
  /** `0 = 라이플` · `1 = 스나이퍼` · `null = 모름` (D-034) */
  weapon: number | null
  kill: number | null
  death: number | null
}

/** `0 = 라이플` · `1 = 스나이퍼` (CLAUDE.md 6장) */
const WEAPON_RIFLE = 0
const WEAPON_SNIPER = 1

/**
 * 참가 기록 → 주간 점들.
 *
 * ── K/D 를 모르는 참가 기록은 킬뎃에서 뺀다 (D-148)
 *   미러 경기에는 라인업만 있고 KDA 가 없는 행이 섞여 있다. `kill ?? 0` 으로 더하면
 *   판수만 늘고 킬뎃이 0 쪽으로 끌려 내려간다. **승패는 그 행도 센다** —
 *   이겼는지 졌는지는 아는 값이다.
 *
 * ── 무기를 모르는 판은 어느 쪽에도 안 넣는다 (D-034)
 *   라플로 가정하면 라플 킬뎃이 거짓이 된다.
 *
 * ── 순위(`rank`)는 여기서 채우지 않는다
 *   그 시점의 **모든 선수 점수**를 알아야 나오는 값이라 한 선수의 행만 봐서는 못 만든다.
 *   주간 순위 기록이 생기면 그때 바깥에서 얹는다.
 */
export function foldWeekly(
  rows: readonly WeeklyRow[],
  now: Date,
  weeks: number,
  dayStart: (d: Date) => Date,
  kdOf: (kill: number, death: number) => number | null,
  winRateOf: (win: number, lose: number) => number | null,
  /* 주 경계. 호출부는 안 넘긴다 — 기본값이 `WEEK_BOUNDARY.current` 라 한 곳만 바꾸면 전부 따라온다 */
  boundary: WeekBoundaryKind = WEEK_BOUNDARY.current,
): WeeklyTrend {
  const ends = weekEnds(now, weeks, dayStart, boundary)
  const starts = weekStartsOf(now, weeks, dayStart, boundary)

  const ordered = [...rows].sort((a, b) => {
    const d = a.startAt.getTime() - b.startAt.getTime()
    if (d !== 0) return d
    return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0
  })

  let win = 0
  let lose = 0
  let sniperKill = 0
  let sniperDeath = 0
  let sniperGames = 0
  let rifleKill = 0
  let rifleDeath = 0
  let rifleGames = 0

  const points: WeeklyPoint[] = []
  let cursor = 0

  for (let w = 0; w < ends.length; w += 1) {
    const endAt = ends[w]!.getTime()
    const startAt = starts[w]!.getTime()
    let gamesThisWeek = 0

    while (cursor < ordered.length && ordered[cursor]!.startAt.getTime() < endAt) {
      const row = ordered[cursor]!
      cursor += 1

      if (row.winnerSide === row.side) win += 1
      else lose += 1

      const known = row.kill !== null && row.death !== null
      if (known && row.weapon === WEAPON_SNIPER) {
        sniperGames += 1
        sniperKill += row.kill ?? 0
        sniperDeath += row.death ?? 0
      } else if (known && row.weapon === WEAPON_RIFLE) {
        rifleGames += 1
        rifleKill += row.kill ?? 0
        rifleDeath += row.death ?? 0
      }

      if (row.startAt.getTime() >= startAt) gamesThisWeek += 1
    }

    points.push({
      start: starts[w]!.toISOString(),
      played: gamesThisWeek > 0,
      games: gamesThisWeek,
      sniper_kd: sniperGames === 0 ? null : kdOf(sniperKill, sniperDeath),
      rifle_kd: rifleGames === 0 ? null : kdOf(rifleKill, rifleDeath),
      win_rate: win + lose === 0 ? null : winRateOf(win, lose),
      rank: null,
    })
  }

  return { points, has_rank: points.some((p) => p.rank !== null) }
}

/**
 * 클랜 주간 추이 — **승률 한 줄**만 만든다 (2026-09-02 사용자 지시).
 *
 * > "클랜정보카드도 수정 / 그래프카드에 일주일 단위 승률기록(개인기록과 동일)"
 *
 * 선수와 **같은 규칙**이다 — 누적 · 같은 주 경계(`WEEK_BOUNDARY.current`) · 안 뛴 주는 수평선.
 * 다른 것은 재료뿐이다: 클랜은 참가 기록이 아니라 **경기 승패**만 있으면 된다.
 *
 * ── 왜 `foldWeekly` 를 그대로 못 쓰나
 *   그쪽은 무기·킬·데스를 요구한다. 클랜 경기 행에는 그게 없다 —
 *   IPL 은 경기 24,662건 중 라인업을 아는 것이 1,562건뿐이라
 *   억지로 맞추면 **없는 값을 0 으로 채우게 된다** (D-148 이 금지한 그것).
 *   그래서 승률만 세는 짧은 함수를 따로 둔다. 주 경계와 누적 규칙은 **같은 함수**를 쓴다.
 */
export function foldWeeklyClan(
  rows: readonly { matchId: string; startAt: Date; won: boolean }[],
  now: Date,
  weeks: number,
  dayStart: (d: Date) => Date,
  winRateOf: (win: number, lose: number) => number | null,
  boundary: WeekBoundaryKind = WEEK_BOUNDARY.current,
): WeeklyTrend {
  const ends = weekEnds(now, weeks, dayStart, boundary)
  const starts = weekStartsOf(now, weeks, dayStart, boundary)

  const ordered = [...rows].sort((a, b) => {
    const d = a.startAt.getTime() - b.startAt.getTime()
    if (d !== 0) return d
    return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0
  })

  let win = 0
  let lose = 0
  const points: WeeklyPoint[] = []
  let cursor = 0

  for (let w = 0; w < ends.length; w += 1) {
    const endAt = ends[w]!.getTime()
    const startAt = starts[w]!.getTime()
    let gamesThisWeek = 0

    while (cursor < ordered.length && ordered[cursor]!.startAt.getTime() < endAt) {
      const row = ordered[cursor]!
      cursor += 1
      if (row.won) win += 1
      else lose += 1
      if (row.startAt.getTime() >= startAt) gamesThisWeek += 1
    }

    points.push({
      start: starts[w]!.toISOString(),
      played: gamesThisWeek > 0,
      games: gamesThisWeek,
      /* 클랜 카드는 킬뎃 선을 그리지 않는다 — 재료가 없다. 0 으로 채우지 않는다 */
      sniper_kd: null,
      rifle_kd: null,
      win_rate: win + lose === 0 ? null : winRateOf(win, lose),
      rank: null,
    })
  }

  return { points, has_rank: false }
}

/* ========================================================================== */
/* 순위 얹기 — 주간 순위 스냅샷이 생기면 여기서 `rank` 를 채운다 (지시 #19)       */
/* ========================================================================== */

/**
 * 스냅샷 한 줄의 최소 모양. 서버는 `WeeklyRankSnapshot` 행을, Mock 은 픽스처를 이 모양으로 넘긴다.
 *
 * `weekStartAt` 은 **스냅샷을 찍은 경계 시각**이다 — 그 시각에 시작하는 주의 첫 순간이고,
 * 곧 **직전 주가 끝난 시점의 순위**다.
 */
export interface WeeklyRankRow {
  weekStartAt: Date
  rank: number
}

/**
 * 주간 점들에 순위를 얹는다.
 *
 * ── 점 `i` 의 순위 = 그 주가 **끝난** 시점의 순위 = 다음 주 시작 경계의 스냅샷
 *   점의 값이 전부 「그 주 끝 시점의 누적」이므로 순위도 같은 시각이어야 선이 한 축에 놓인다.
 *
 * ── 마지막 점은 `now` 라 스냅샷이 없다 — **지금 순위**(`liveRank`)를 그대로 쓴다
 *   화면이 이미 `playerRankOf` 로 들고 있는 값이다. 다시 세지 않는다.
 *
 * ── 스냅샷이 없는 주는 `null` 이다. **0 으로 채우지 않는다.** 화면이 「기록 없음」을 적는다.
 *   시즌 초 · 그 주에 아직 랭킹 모집단에 없던 선수 · 배치고사 중이던 주가 여기 해당한다.
 */
export function attachWeeklyRank(
  trend: WeeklyTrend,
  snapshots: readonly WeeklyRankRow[],
  liveRank: number | null,
): WeeklyTrend {
  const rankAt = new Map<number, number>()
  for (const s of snapshots) rankAt.set(s.weekStartAt.getTime(), s.rank)

  const last = trend.points.length - 1
  const points = trend.points.map((point, index) => {
    if (index === last) return { ...point, rank: liveRank != null && liveRank > 0 ? liveRank : null }
    /* 이 주의 끝 = 다음 주의 시작. 서머타임이 없어 정확히 7일 뒤다 */
    const endAt = new Date(point.start).getTime() + WEEK_MS
    return { ...point, rank: rankAt.get(endAt) ?? null }
  })
  return { points, has_rank: points.some((p) => p.rank !== null) }
}
