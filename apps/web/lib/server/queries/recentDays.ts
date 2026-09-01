/**
 * 최근 3일치 **일별 기록** (D-198 · 사용자 지시).
 *
 * ```
 * 오늘   미접속
 * 8/16   6전 4승 2패 · 승률 67% · 킬뎃 54% · 판킬 9.2
 * 8/8    3전 1승 2패 · 승률 33% · 킬뎃 47% · 판킬 7.1
 * ```
 *
 * ── 무엇을 세나
 *   첫 줄은 **언제나 오늘**이다. 경기가 없으면 `played: false` 이고 화면이 `미접속` 을 적는다.
 *   그 아래는 **실제로 뛴 날** 두 개다 — 달력상 어제·그제가 아니다.
 *   일주일을 쉬었으면 그만큼 건너뛴 날짜가 나온다.
 *
 * ── 하루의 경계는 **오전 7시 KST** (D-186)
 *   새벽 3시 경기는 전날로 묶인다. 자정으로 자르면 한 번 앉아서 한 판들이 이틀로 쪼개진다.
 *
 * ── 모집단은 화면의 다른 수치와 같다
 *   `withLadderMatch` + 시즌0 창 (D-164 · D-178). 여기만 다른 경기를 세면
 *   같은 카드 안에서 숫자가 어긋난다.
 */
import { prisma } from '@sacloud/db'
import {
  dayLabelOf,
  kdRateOrNull,
  killPerMatch,
  kstDayKey,
  winRateOrNull,
  type PlayerDayRecord,
} from '@sacloud/contract'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'
import { playerLadderRows, type PlayerLadderRow } from './playerLadderRows'

/** 오늘 말고 몇 날을 더 보여주나 */
const EXTRA_DAYS = 2

/**
 * 얼마나 거슬러 읽을까.
 *
 * 하루에 20판 안팎이므로 400건이면 최근 20일 가까이 덮는다. 그 안에 뛴 날이
 * 두 개도 없으면 그 선수는 정말 오래 쉰 것이고, 그때는 있는 만큼만 보여준다.
 *
 * > `[미확인]` 400은 우리가 고른 값이다. 사양에 숫자가 없다.
 */
const SCAN_LIMIT = 400

interface DayBucket {
  games: number
  knownGames: number
  win: number
  lose: number
  kill: number
  death: number
}

const empty = (): DayBucket => ({ games: 0, knownGames: 0, win: 0, lose: 0, kill: 0, death: 0 })

function toRecord(key: string, todayKey: string, bucket: DayBucket | null): PlayerDayRecord {
  const label = dayLabelOf(key, todayKey)
  if (!bucket || bucket.games === 0) {
    return {
      date: key,
      label,
      played: false,
      games: 0,
      win: 0,
      lose: 0,
      win_rate: null,
      kd_rate: null,
      kill_per_match: null,
    }
  }
  return {
    date: key,
    label,
    played: true,
    games: bucket.games,
    win: bucket.win,
    lose: bucket.lose,
    win_rate: winRateOrNull(bucket.win, bucket.lose),
    kd_rate: kdRateOrNull(bucket.kill, bucket.death),
    /* 판킬의 분모는 **K/D 를 아는 판수**다 — 킬을 모르는 판을 분모에 넣으면 평균이 낮아진다 (D-176) */
    kill_per_match: bucket.knownGames === 0 ? null : killPerMatch(bucket.kill, bucket.knownGames),
  }
}

export async function playerRecentDays(
  leagueId: string,
  playerId: string,
  now: Date = new Date(),
): Promise<PlayerDayRecord[]> {
  return playerRecentDaysFrom(await playerLadderRows(leagueId, playerId), now)
}

/**
 * 위와 **같은 값**을, 이미 읽어 둔 참가 기록에서 만든다 (2026-09-01 · D-239 후속).
 *
 * 모집단이 누적·폼·티어별과 같아서 같은 행을 다섯 번 읽고 있었다.
 * 왜 합쳤는지는 `playerLadderRows.ts` 머리말에 있다.
 *
 * ── 자르는 자리는 그대로 `SCAN_LIMIT` 이다
 *   전량을 쓰면 **값이 바뀐다** — 400건보다 더 거슬러 올라간 날이 목록에 들어온다.
 *   줄이는 작업이지 넓히는 작업이 아니다.
 *
 * > `[미확인]` 옛 질의의 정렬은 `startAt DESC` 하나뿐이라 같은 시각의 경기가 있으면
 * > 400번째 경계에서 어느 행이 들어올지가 실행마다 달라질 수 있었다.
 * > `playerLadderRows()` 는 `matchId DESC` 를 타이브레이커로 두어 **결정적**이다.
 * > 이 차이는 「같은 시각에 시작한 경기가 정확히 그 경계에 걸릴 때」만 드러난다.
 */
export function playerRecentDaysFrom(
  rows: readonly PlayerLadderRow[],
  now: Date = new Date(),
): PlayerDayRecord[] {
  return daysOf(
    rows.slice(0, SCAN_LIMIT).map((row) => ({
      kill: row.kill,
      death: row.death,
      side: row.side,
      match: { startAt: row.startAt, winnerSide: row.winnerSide },
    })),
    now,
  )
}

/**
 * **옛 방식** — 질의 한 번(+중첩 한 번)으로 같은 값을 만든다
 * (`CLAUDE.md` 10-4: 옛 버전을 남긴다). 대조용 기준이다.
 */
export async function playerRecentDaysByQuery(
  leagueId: string,
  playerId: string,
  now: Date = new Date(),
): Promise<PlayerDayRecord[]> {
  const rows = await prisma.matchPlayerStat.findMany({
    where: { playerId, match: withLadderMatch({ leagueId, ...seasonWindowWhere() }) },
    select: {
      kill: true,
      death: true,
      side: true,
      match: { select: { startAt: true, winnerSide: true } },
    },
    orderBy: { match: { startAt: 'desc' } },
    take: SCAN_LIMIT,
  })

  return daysOf(rows, now)
}

/**
 * **날짜로 접는 규칙은 여기 하나뿐이다.**
 * 새 경로와 옛 경로가 재료를 다르게 구해 올 뿐, 세는 일은 둘 다 이 함수가 한다.
 */
function daysOf(
  rows: readonly {
    kill: number | null
    death: number | null
    side: string
    match: { startAt: Date; winnerSide: string }
  }[],
  now: Date,
): PlayerDayRecord[] {
  const byDay = new Map<string, DayBucket>()
  for (const row of rows) {
    const key = kstDayKey(row.match.startAt)
    const bucket = byDay.get(key) ?? empty()
    bucket.games += 1
    if (row.match.winnerSide === row.side) bucket.win += 1
    else bucket.lose += 1
    /* K/D 를 모르는 참가 기록은 0으로 더하지 않는다 — 평균이 거짓이 된다 (D-148) */
    if (row.kill !== null && row.death !== null) {
      bucket.knownGames += 1
      bucket.kill += row.kill
      bucket.death += row.death
    }
    byDay.set(key, bucket)
  }

  const todayKey = kstDayKey(now)
  /* 오늘은 **경기가 없어도** 자리를 지킨다. 그게 `미접속` 이라는 정보다 */
  const days: PlayerDayRecord[] = [toRecord(todayKey, todayKey, byDay.get(todayKey) ?? null)]

  const played = [...byDay.keys()]
    .filter((key) => key !== todayKey)
    .sort()
    .reverse()
    .slice(0, EXTRA_DAYS)
  for (const key of played) days.push(toRecord(key, todayKey, byDay.get(key) ?? null))

  return days
}
