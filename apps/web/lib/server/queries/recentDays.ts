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
