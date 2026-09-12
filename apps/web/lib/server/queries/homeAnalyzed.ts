/**
 * ★홈 · 경기분석까지 끝난 최근 경기★ (2026-09-12 사장님)
 *
 * > «가장최근 끝난 IPL SPL 경기 (경기분석까지 마친) 3개보여주자 눌러서 상세보기 볼 수 있게»
 * > «여기 그냥 경기 카테고리에 있는 카드랑 똑같은 카드를 세개 배치하면 돼
 * >  누르면 바로가기 후 화면 전환이 아니라 경기상세 페이지를 이 화면에서 보여주면 돼»
 *
 * ── 「경기분석까지 마친」 이 무슨 뜻인가
 *   그 판 육각형을 그릴 수 있다는 뜻이다. 배틀로그가 들어와 `MatchClanHexV2` 가
 *   ★양 팀 다★ 접혔을 때만 겹친 그림이 나온다. 한쪽만 있으면 비교가 안 된다.
 *
 * ── 카드는 ★경기 목록과 같은 물건★ 이다
 *   `MatchListItem` 그대로 내보낸다 — 화면이 `MatchListV3` 를 그대로 쓴다.
 *   여기서 새 모양을 만들면 홈과 경기 목록이 조용히 갈라진다.
 *
 * ── 왜 두 리그를 한 번에
 *   홈은 리그를 안 고른다. IPL·SPL 을 섞어 ★시각 순★ 으로 셋을 고른다.
 *   열산(`sanply`)은 뺀다 — 비공식이라 경기분석을 안 돌린다.
 */
import { prisma } from '@sacloud/db'
import type { HomeAnalyzedMatch, MatchListItem } from '@sacloud/contract'
import {
  MATCH_ORDER,
  MATCH_SELECT,
  type MatchRow,
  leagueClanIdsOf,
  loadLeagueClanContext,
  toMatchListItem,
} from './matches'
import { withSeasonWindow } from './season0Scope'

/** 홈이 섞어 보여 줄 리그 — 열산은 경기분석을 안 돌린다 */
const LEAGUES = ['nolink', 'supply'] as const

/** 「양 팀 다 접힘」을 찾으려면 넉넉히 떠야 한다 — 갓 끝난 판은 배틀로그가 늦게 온다 */
const SCAN = 60

export async function homeAnalyzedMatches(limit = 3): Promise<HomeAnalyzedMatch[]> {
  const leagues = await prisma.league.findMany({
    where: { slug: { in: [...LEAGUES] } },
    select: { id: true, slug: true, category: true },
  })
  if (leagues.length === 0) return []

  const perLeague = await Promise.all(
    leagues.map(async (league) => {
      const rows = (await prisma.match.findMany({
        where: withSeasonWindow({ leagueId: league.id }),
        orderBy: [...MATCH_ORDER],
        take: SCAN,
        select: MATCH_SELECT,
      })) as MatchRow[]
      if (rows.length === 0) return []

      /* 그 판들 중 육각형이 접힌 클랜 자리 — 한 번에 읽는다 (줄마다 물으면 60번이 된다) */
      const hexRows = await prisma.matchClanHexV2.findMany({
        where: { matchId: { in: rows.map((row) => row.id) } },
        select: { matchId: true, leagueClanId: true },
      })
      const hexed = new Map<string, Set<string>>()
      for (const hex of hexRows) {
        const set = hexed.get(hex.matchId) ?? new Set<string>()
        set.add(hex.leagueClanId)
        hexed.set(hex.matchId, set)
      }

      const ready = rows.filter((row) => {
        const set = hexed.get(row.id)
        if (!set) return false
        /* ★양 팀 다★ 접혀 있어야 겹친 그림이 나온다 */
        return set.has(row.redLeagueClanId) && set.has(row.blueLeagueClanId)
      })
      if (ready.length === 0) return []

      const clans = await loadLeagueClanContext(league.id, leagueClanIdsOf(ready))
      return ready.flatMap((row) => {
        /* 보는 쪽은 ★이긴 팀★ — 홈에는 주인이 없다 (`homeRecent` 와 같은 규칙) */
        const viewer = row.winnerSide === 'blue' ? row.blueLeagueClanId : row.redLeagueClanId
        const item = toMatchListItem(row, viewer, null, clans)
        if (!item) return []
        return [
          {
            league_slug: league.slug,
            league_category: league.category === 'independent' ? ('independent' as const) : ('official' as const),
            start_at: row.startAt.toISOString(),
            match: item as MatchListItem,
          },
        ]
      })
    }),
  )

  return perLeague
    .flat()
    .sort((a, b) => (a.start_at < b.start_at ? 1 : a.start_at > b.start_at ? -1 : 0))
    .slice(0, limit)
}
