/**
 * ★★오늘의 최다연승 · 최다연패 클랜★★ — 클랜랭킹 맨 위 (2026-09-22 사장님)
 *
 * > 「클랜랭킹에 비워지게된 자리는 ★그날 하루 최다연승클랜이랑 최다연패클랜 박제★ 해줘
 * >  (실시간) ★15시~다음날15시★」
 *
 * ── ★창은 「오늘의 상대전적」과 같은 것을 쓴다★
 *   `todayWindow()` 한 곳에서 온다. 두 카드가 서로 다른 「오늘」을 보면
 *   같은 화면 안에서 ★기준이 갈린다.★ 그래서 값을 다시 적지 않고 가져다 쓴다.
 *
 * ── ★연승·연패는 「그 창 안에서만」 센다★
 *   어제 이어 온 연승을 들고 오지 않는다. 15:00 에 ★0 부터 다시 센다★ —
 *   사장님이 「그날 하루」 라고 하셨고, 상대전적 카드와 같은 규칙이다.
 *
 * ── ★등록 클랜끼리의 경기만★
 *   `Clan.active` 가 등록 여부를 정한다 (2026-09-22 커밋 `ac5d499e` 의 규칙).
 *   상대가 미등록이면 그 경기는 ★양쪽 모두에게★ 안 센다 — 상대전적 카드와 같다.
 *
 * ── ★고정하지 않는다★ — 부를 때마다 다시 센다. 경기가 들어오면 바로 바뀐다.
 *
 * ── ★없으면 없다고 낸다★ (`CLAUDE.md` 2장 1번)
 *   창 안에 경기가 없으면 `null` 이다. 가짜 클랜을 만들지 않는다.
 */
import { prisma } from '@sacloud/db'
import { toKstIso } from '../format'
import { todayWindow } from './todayTopMatchup'

export interface TodayStreakClan {
  league_clan_id: string
  slug: string
  name: string
  mark_bg_url: string | null
  mark_front_url: string | null
  /** 그 창 안에서 이어 간 판 수 */
  streak: number
  /** 그 창 안의 전적 — 연승/연패가 몇 판 중에 나온 것인지 보인다 */
  win: number
  lose: number
}

export interface TodayStreaks {
  from: string
  to: string
  /** 그 창 안에서 가장 길게 이어 이긴 클랜. 아무도 2연승을 못 했으면 1 이다 */
  best: TodayStreakClan | null
  /** 가장 길게 이어 진 클랜 */
  worst: TodayStreakClan | null
}

interface Acc {
  win: number
  lose: number
  bestWin: number
  bestLose: number
  runWin: number
  runLose: number
  last: Date
}

export async function todayStreaks(leagueId: string, now: Date = new Date()): Promise<TodayStreaks> {
  const { from, to } = todayWindow(now)

  const matches = await prisma.match.findMany({
    where: {
      leagueId,
      supersededAt: null,
      startAt: { gte: from, lt: to },
      redClan: { clan: { active: true } },
      blueClan: { clan: { active: true } },
    },
    /* ★시간순★ 이어야 연속을 셀 수 있다 */
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      startAt: true,
      winnerSide: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
    },
  })

  const seen = new Set<string>()
  const by = new Map<string, Acc>()
  const bump = (id: string, won: boolean, at: Date): void => {
    let a = by.get(id)
    if (!a) {
      a = { win: 0, lose: 0, bestWin: 0, bestLose: 0, runWin: 0, runLose: 0, last: at }
      by.set(id, a)
    }
    if (won) {
      a.win += 1
      a.runWin += 1
      a.runLose = 0
      if (a.runWin > a.bestWin) a.bestWin = a.runWin
    } else {
      a.lose += 1
      a.runLose += 1
      a.runWin = 0
      if (a.runLose > a.bestLose) a.bestLose = a.runLose
    }
    if (at > a.last) a.last = at
  }

  for (const m of matches) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    if (m.redLeagueClanId === m.blueLeagueClanId) continue
    /* 승자를 모르는 경기는 연속을 끊지도 잇지도 않는다 — 없는 셈 친다 (지어내지 않는다) */
    if (m.winnerSide !== 'red' && m.winnerSide !== 'blue') continue
    const redWon = m.winnerSide === 'red'
    bump(m.redLeagueClanId, redWon, m.startAt)
    bump(m.blueLeagueClanId, !redWon, m.startAt)
  }

  const window = { from: toKstIso(from), to: toKstIso(to) }
  if (by.size === 0) return { ...window, best: null, worst: null }

  /*
   * ★흔들리지 않는 고르기★ — 상대전적 카드와 ★같은 차례★ 다.
   *   ① 이어 간 판 수 ② 마지막 경기가 더 최근 ③ 클랜 ID
   *   ③ 까지 가면 값이 고정이라 새로고침해도 깜빡이지 않는다.
   */
  const pickBy = (get: (a: Acc) => number): [string, Acc] | null => {
    let best: [string, Acc] | null = null
    for (const entry of by.entries()) {
      if (get(entry[1]) <= 0) continue
      if (best === null) {
        best = entry
        continue
      }
      const mine = get(entry[1])
      const theirs = get(best[1])
      if (mine !== theirs) {
        if (mine > theirs) best = entry
        continue
      }
      if (entry[1].last.getTime() !== best[1].last.getTime()) {
        if (entry[1].last > best[1].last) best = entry
        continue
      }
      if (entry[0] < best[0]) best = entry
    }
    return best
  }

  const bestEntry = pickBy((a) => a.bestWin)
  const worstEntry = pickBy((a) => a.bestLose)
  const ids = [bestEntry?.[0], worstEntry?.[0]].filter((x): x is string => typeof x === 'string')
  if (ids.length === 0) return { ...window, best: null, worst: null }

  const clans = await prisma.leagueClan.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      clan: { select: { slug: true, name: true, markBgUrl: true, markFrontUrl: true } },
    },
  })
  const shape = (entry: [string, Acc] | null, streak: number): TodayStreakClan | null => {
    if (entry === null) return null
    const row = clans.find((c) => c.id === entry[0])
    /* 클랜 행이 없으면 ★이름을 지어내지 않는다★ — 그 자리를 비운다 */
    if (!row) return null
    return {
      league_clan_id: row.id,
      slug: row.clan.slug,
      name: row.clan.name,
      mark_bg_url: row.clan.markBgUrl,
      mark_front_url: row.clan.markFrontUrl,
      streak,
      win: entry[1].win,
      lose: entry[1].lose,
    }
  }

  return {
    ...window,
    best: shape(bestEntry, bestEntry?.[1].bestWin ?? 0),
    worst: shape(worstEntry, worstEntry?.[1].bestLose ?? 0),
  }
}
