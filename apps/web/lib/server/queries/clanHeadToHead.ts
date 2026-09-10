/**
 * ★클랜 상대전적★ — 시즌 0 안에서 이 클랜이 붙은 상대들 (2026-09-10 · 클랜 상세 v3)
 *
 * `Match` 만 읽는다. 라운드 점수는 원본에 없어 `null` 이다 — 지어내지 않는다 (`CLAUDE.md` 2-1).
 * 상대는 **붙은 판이 많은 순**, 같으면 최근에 붙은 순이다. 최근 판은 상대마다 10판까지 낸다.
 */
import { prisma } from '@sacloud/db'
import type { ClanHeadToHead } from '@sacloud/contract'
import { toKstIso } from '../format'
import { withSeasonWindow } from './season0Scope'

const RECENT_PER_OPPONENT = 10

export async function clanHeadToHead(leagueId: string, leagueClanId: string): Promise<ClanHeadToHead[]> {
  const matches = await prisma.match.findMany({
    where: withSeasonWindow({
      leagueId,
      supersededAt: null,
      OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }],
    }),
    orderBy: { startAt: 'desc' },
    select: {
      id: true,
      startAt: true,
      winnerSide: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
    },
  })
  interface Acc {
    win: number
    lose: number
    last: Date
    recent: ClanHeadToHead['recent']
  }
  const byOpponent = new Map<string, Acc>()
  for (const m of matches) {
    const weAreRed = m.redLeagueClanId === leagueClanId
    const opponentId = weAreRed ? m.blueLeagueClanId : m.redLeagueClanId
    if (opponentId === leagueClanId) continue
    const ourSide = weAreRed ? 'red' : 'blue'
    const won = m.winnerSide === 'red' || m.winnerSide === 'blue' ? m.winnerSide === ourSide : null
    let acc = byOpponent.get(opponentId)
    if (!acc) {
      acc = { win: 0, lose: 0, last: m.startAt, recent: [] }
      byOpponent.set(opponentId, acc)
    }
    if (won === true) acc.win += 1
    else if (won === false) acc.lose += 1
    if (acc.recent.length < RECENT_PER_OPPONENT) {
      acc.recent.push({
        match_id: m.id,
        start_at: toKstIso(m.startAt) ?? m.startAt.toISOString(),
        won,
        our_rounds: null,
        their_rounds: null,
      })
    }
  }
  if (byOpponent.size === 0) return []
  const opponents = await prisma.leagueClan.findMany({
    where: { id: { in: [...byOpponent.keys()] } },
    select: {
      id: true,
      division: true,
      clan: { select: { id: true, slug: true, name: true, markBgUrl: true, markFrontUrl: true } },
    },
  })
  const rows: ClanHeadToHead[] = []
  for (const opp of opponents) {
    const acc = byOpponent.get(opp.id)
    if (!acc) continue
    rows.push({
      league_clan_id: opp.id,
      clan: {
        id: opp.clan.id,
        slug: opp.clan.slug,
        name: opp.clan.name,
        mark_bg_url: opp.clan.markBgUrl,
        mark_front_url: opp.clan.markFrontUrl,
      },
      division: opp.division,
      win: acc.win,
      lose: acc.lose,
      last_played_at: toKstIso(acc.last),
      recent: acc.recent,
    })
  }
  rows.sort((a, b) => b.win + b.lose - (a.win + a.lose) || (b.last_played_at ?? '').localeCompare(a.last_played_at ?? ''))
  return rows
}

/** 시즌 0 최다 연승 (2026-09-10 · 목업 KPI «최다연승»). 경기가 없으면 null · 승패 모르는 경기는 연승을 끊지 않고 건너뛴다 */
export async function clanMaxWinStreak(leagueId: string, leagueClanId: string): Promise<number | null> {
  const matches = await prisma.match.findMany({
    where: withSeasonWindow({
      leagueId,
      supersededAt: null,
      OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }],
    }),
    orderBy: { startAt: 'asc' },
    select: { winnerSide: true, redLeagueClanId: true },
  })
  if (matches.length === 0) return null
  let best = 0
  let run = 0
  for (const m of matches) {
    if (m.winnerSide !== 'red' && m.winnerSide !== 'blue') continue
    const ourSide = m.redLeagueClanId === leagueClanId ? 'red' : 'blue'
    if (m.winnerSide === ourSide) {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}
