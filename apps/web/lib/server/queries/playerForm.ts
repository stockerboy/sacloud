import { prisma, type Prisma } from '@sacloud/db'
import {
  FORM_BASELINE_GAMES,
  FORM_MONTHS,
  FORM_RECENT_GAMES,
  formMonthKey,
  formMonthKeys,
  formRangeStart,
  judgeFormTrend,
  kdRate,
  type PlayerForm,
  type PlayerFormMonth,
} from '@sacloud/contract'
import { ladderMatchWhere } from './ladderScope'

/**
 * 선수 프로필 `최근 폼` (D-167).
 *
 * 계산 규칙·상수·판정 경계는 전부 `packages/contract/src/form.ts` 에 있다.
 * 여기는 **DB 에서 재료만 꺼내 온다.**
 *
 * ── 모집단은 `ladderMatchWhere()` 다 (D-164)
 *   `redRatingUpdate: { not: null }` 로 잡으면 **미러링해 온 3rd.supply 경기가 통째로 빠진다.**
 *   그 칸은 우리 공식이 채우는 것이라 미러 경기에는 없다 (실측: supply 리그 경기
 *   13만 건 중 98건). 이 함정으로 예전에 전 선수 평균킬이 `0.0킬` 로 나갔다.
 *   폼 그래프는 미러 경기 위에서 그려지므로 여기에 걸리면 6개월이 통째로 빈다.
 *
 * ── K/D 를 모르는 참가 기록은 아예 뺀다 (D-148)
 *   미러 경기에는 라인업만 있고 KDA 가 없는 참가 기록이 섞여 있다.
 *   `kill ?? 0` 으로 더하면 판수만 늘고 킬뎃이 0 쪽으로 끌려 내려간다.
 *   `kill`·`death` 가 둘 다 있는 기록만 센다.
 */

/** 폼 계산에 쓰는 경기 모집단 — 이 리그의 **래더 반영 경기** */
function formMatchWhere(leagueId: string): Prisma.MatchWhereInput {
  return { leagueId, ...ladderMatchWhere() }
}

/** K/D 가 **둘 다 있는** 이 선수의 참가 기록만 */
function formStatWhere(leagueId: string, playerId: string): Prisma.MatchPlayerStatWhereInput {
  return {
    playerId,
    kill: { not: null },
    death: { not: null },
    match: formMatchWhere(leagueId),
  }
}

interface Tally {
  games: number
  kill: number
  death: number
}

function tally(rows: readonly { kill: number | null; death: number | null }[]): Tally {
  let kill = 0
  let death = 0
  for (const row of rows) {
    kill += row.kill ?? 0
    death += row.death ?? 0
  }
  return { games: rows.length, kill, death }
}

export async function buildPlayerForm(
  leagueId: string,
  playerId: string,
  now: Date = new Date(),
): Promise<PlayerForm> {
  const keys = formMonthKeys(now, FORM_MONTHS)
  const rangeStart = formRangeStart(now, FORM_MONTHS)

  const [monthRows, windowRows] = await Promise.all([
    /* 그래프 — 최근 6개월. 달 경계는 KST 다 (`formMonthKey`) */
    prisma.matchPlayerStat.findMany({
      where: {
        ...formStatWhere(leagueId, playerId),
        match: { ...formMatchWhere(leagueId), startAt: { gte: rangeStart } },
      },
      select: { kill: true, death: true, match: { select: { startAt: true } } },
    }),
    /* 판정 — 최근 10경기 + 그 앞 30경기. 6개월 밖으로 나가도 상관없다.
       그래프와 기준이 다른 것은 의도다 (D-167) */
    prisma.matchPlayerStat.findMany({
      where: formStatWhere(leagueId, playerId),
      orderBy: [{ match: { startAt: 'desc' } }, { matchId: 'desc' }],
      take: FORM_RECENT_GAMES + FORM_BASELINE_GAMES,
      select: { kill: true, death: true },
    }),
  ])

  const buckets = new Map<string, Tally>(keys.map((key) => [key, { games: 0, kill: 0, death: 0 }]))
  for (const row of monthRows) {
    const bucket = buckets.get(formMonthKey(row.match.startAt))
    /* 경계 밖(조회 시각과 버킷 계산 시각이 달을 넘나드는 극단)이면 버린다.
       없는 달을 새로 만들지 않는다 — x축은 항상 6칸이다 */
    if (!bucket) continue
    bucket.games += 1
    bucket.kill += row.kill ?? 0
    bucket.death += row.death ?? 0
  }

  const months: PlayerFormMonth[] = keys.map((month) => {
    const bucket = buckets.get(month) ?? { games: 0, kill: 0, death: 0 }
    return {
      month,
      games: bucket.games,
      kill: bucket.kill,
      death: bucket.death,
      /* 경기가 없던 달은 `null` 이다. 0% 로 채우면 "다 죽었다" 는 거짓이 된다 (D-106) */
      kd_rate: bucket.games === 0 ? null : kdRate(bucket.kill, bucket.death),
    }
  })

  const recent = tally(windowRows.slice(0, FORM_RECENT_GAMES))
  const baseline = tally(windowRows.slice(FORM_RECENT_GAMES))
  const judged = judgeFormTrend(recent, baseline)

  return {
    months,
    trend: judged.trend,
    recent_games: recent.games,
    recent_kd_rate: judged.recentKdRate,
    baseline_games: baseline.games,
    baseline_kd_rate: judged.baselineKdRate,
    delta: judged.delta,
  }
}
