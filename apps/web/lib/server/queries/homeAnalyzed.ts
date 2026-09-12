/**
 * ★홈 · 경기분석까지 끝난 최근 경기★ (2026-09-12 사장님)
 *
 * > «가장최근 끝난 IPL SPL 경기 (경기분석까지 마친) 3개보여주자 눌러서 상세보기 볼 수 있게»
 *
 * ── 「경기분석까지 마친」 이 무슨 뜻인가
 *   그 판 육각형을 그릴 수 있다는 뜻이다. 배틀로그가 들어와 `MatchClanHexV2` 가
 *   ★양 팀 다★ 접혔을 때만 겹친 그림이 나온다. 한쪽만 있으면 비교가 안 된다.
 *
 * ── 왜 두 리그를 한 번에
 *   홈은 리그를 안 고른다. IPL·SPL 을 섞어 ★시각 순★ 으로 셋을 고른다.
 *   열산(`sanply`)은 뺀다 — 비공식이라 경기분석을 안 돌린다.
 */
import { prisma } from '@sacloud/db'
import type { HomeAnalyzedMatch } from '@sacloud/contract'
import { CLAN_SUMMARY_SELECT, toClanSummary } from '../mappers'

/** 홈이 섞어 보여 줄 리그 — 열산은 경기분석을 안 돌린다 */
const LEAGUES = ['nolink', 'supply'] as const

export async function homeAnalyzedMatches(limit = 3): Promise<HomeAnalyzedMatch[]> {
  const leagues = await prisma.league.findMany({
    where: { slug: { in: [...LEAGUES] } },
    select: { id: true, slug: true, name: true },
  })
  if (leagues.length === 0) return []
  const slugOf = new Map(leagues.map((l) => [l.id, l.slug]))

  const rows = await prisma.match.findMany({
    where: {
      leagueId: { in: leagues.map((l) => l.id) },
      /* ★양 팀 다 접혀 있어야 한다★ — 한쪽만 있으면 겹친 그림이 안 나온다 */
      AND: [
        { clanHexV2: { some: {} } },
        { winnerSide: { in: ['red', 'blue'] } },
      ],
    },
    orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    /* 넉넉히 떠서 「양 팀 다」 를 만족하는 것만 골라 낸다 */
    take: limit * 6,
    select: {
      id: true,
      leagueId: true,
      startAt: true,
      winnerSide: true,
      map: { select: { name: true } },
      redLeagueClanId: true,
      blueLeagueClanId: true,
      redClan: { select: { clan: { select: CLAN_SUMMARY_SELECT } } },
      blueClan: { select: { clan: { select: CLAN_SUMMARY_SELECT } } },
      clanHexV2: { select: { leagueClanId: true } },
    },
  })

  const out: HomeAnalyzedMatch[] = []
  for (const row of rows) {
    if (out.length >= limit) break
    const slug = slugOf.get(row.leagueId)
    if (slug === undefined) continue
    const hexed = new Set(row.clanHexV2.map((h) => h.leagueClanId))
    if (!hexed.has(row.redLeagueClanId) || !hexed.has(row.blueLeagueClanId)) continue
    const redWon = row.winnerSide === 'red'
    const won = redWon ? row.redClan : row.blueClan
    const lost = redWon ? row.blueClan : row.redClan
    if (!won || !lost) continue
    out.push({
      match_id: row.id,
      league_slug: slug,
      map_name: row.map?.name ?? null,
      start_at: row.startAt.toISOString(),
      won_clan: toClanSummary(won.clan),
      lost_clan: toClanSummary(lost.clan),
    })
  }
  return out
}
