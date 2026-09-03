/**
 * **통합 순위** — 리그 등수를 0~100 으로 바꿔 권위 무게를 곱해 더한다 (O-043 · 2026-09-03).
 *
 * ══ 왜 SQL 로 세나 ══
 *
 * 리그마다 등수를 매기려면 그 리그 선수를 전부 정렬해야 한다 (27,000명 남짓).
 * 그걸 매 요청마다 JS 로 끌어오면 무겁다. ★등수는 SQL 창 함수가 제일 잘한다.★
 *
 * ⚠ ★그런데 점수 공식이 두 곳에 생기면 안 된다.★ 공식의 진실은
 *   `@sacloud/contract` 의 `rankScore()` · `unifiedScore()` 다.
 *   그래서 SQL 은 **등수와 인원만** 내고, ★점수는 계약 함수가 계산한다.★
 *   (`__tests__/unifiedRank.test.ts` 가 둘이 같은 답을 내는지 지킨다)
 *
 * ══ `RankSnapshot` 을 안 쓴 이유 ══
 *
 * 그 표가 1시간마다 채워지는 줄 알았는데 ★실측하니 3행뿐이고 2026-08-22 것이다★
 * (supply · season 7). ★비어 있는 것을 전제로 짓지 않는다.★
 */
import { LEAGUE_AUTHORITY, authorityOf, unifiedScore } from '@sacloud/contract'
import { prisma } from '@sacloud/db'

/** 통합 순위 한 줄 */
export interface UnifiedRankRow {
  rank: number
  playerId: string
  playerName: string
  score: number
  /** 어느 리그에서 몇 등이었나 — 화면이 근거를 보여 줄 수 있게 같이 낸다 */
  parts: { league: string; division: number; rank: number; total: number; weight: number }[]
}

interface RankedRow {
  playerId: string
  name: string
  league: string
  division: number
  rnk: bigint
  total: bigint
}

/** 통합 순위에 넣는 리그들 — 권위 표에 있는 것만 (daerule 은 없다) */
const LEAGUES = [...new Set(LEAGUE_AUTHORITY.map((a) => a.league))]

/**
 * 통합 순위를 만든다.
 *
 * ⚠ ★점수가 같으면 등수도 같다★ — 사장님: «점수 높은데 순위 낮은 것 절대안된다».
 *   같은 점수에 다른 등수를 주면 그 말을 어긴다. 그래서 `RANK` 방식으로 매긴다.
 */
export async function getUnifiedRanks(limit = 100): Promise<UnifiedRankRow[]> {
  const ranked = await prisma.$queryRaw<RankedRow[]>`
    SELECT lp."playerId"                                                   AS "playerId",
           p."name"                                                        AS name,
           l."slug"                                                        AS league,
           /* ★티어는 선수가 아니라 「그 선수가 속한 클랜」의 것이다★ —
              'LeaguePlayer' 에는 division 이 없다. 클랜이 없으면 1 로 본다 */
           COALESCE(lc."division", 1)                                      AS division,
           RANK() OVER (PARTITION BY lp."leagueId" ORDER BY lp."rating" DESC) AS rnk,
           COUNT(*) OVER (PARTITION BY lp."leagueId")                      AS total
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
      LEFT JOIN "LeagueClan" lc
             ON lc."leagueId" = lp."leagueId" AND lc."clanId" = lp."clanId"
     WHERE l."slug" = ANY(${LEAGUES})
       /*
        * ★★랭킹에 드는 선수만 센다★★
        *
        * 안 걸면 ★한 판도 안 뛴 사람이 상위권에 들어온다.★ 실측 —
        * '''
        * sanply  15,335명 중 ★13,314명이 rating 3000 그대로★ → 전부 750위(상위 5%)
        * supply  10,439명 중 ★ 9,191명★             → 전부 457위(상위 4%)
        * '''
        * 그러면 ★한 판도 안 뛴 사람이 그 리그에서 95점★ 을 받는다.
        * 사장님이 이 판을 요구하신 이유가 바로 그것이다 —
        * > «못하던 애들이 치고올라와서 순위권에 올라오는 경우가 생기면
        * >  **사람들이 신뢰를 안할까봐**»
        *
        * 'placement = false' 는 ★개인랭킹 화면이 이미 쓰는 그 기준★ 이다
        * ('playerRankWhere()'). ★화면과 통합 순위가 같은 사람을 세야 한다.★
        */
       AND lp."placement" = false
  `

  /* 선수마다 리그별 등수를 모은다 */
  const byPlayer = new Map<string, { name: string; parts: UnifiedRankRow['parts'] }>()
  for (const r of ranked) {
    const a = authorityOf(r.league, r.division)
    if (!a) continue
    const cur = byPlayer.get(r.playerId) ?? { name: r.name, parts: [] }
    cur.parts.push({
      league: r.league,
      division: r.division,
      rank: Number(r.rnk),
      total: Number(r.total),
      weight: a.weight,
    })
    byPlayer.set(r.playerId, cur)
  }

  /* ★점수는 계약 함수가 낸다★ — 공식이 두 곳에 생기지 않게 */
  const scored = [...byPlayer.entries()]
    .map(([playerId, v]) => ({
      playerId,
      playerName: v.name,
      parts: v.parts,
      score: unifiedScore(
        v.parts.map((p) => ({
          leagueSlug: p.league,
          division: p.division,
          rank: p.rank,
          total: p.total,
        })),
      ),
    }))
    .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))

  /* ★점수가 같으면 등수도 같다★ */
  const out: UnifiedRankRow[] = []
  let lastScore = Number.NaN
  let lastRank = 0
  scored.slice(0, limit).forEach((row, i) => {
    const rank = row.score === lastScore ? lastRank : i + 1
    lastScore = row.score
    lastRank = rank
    out.push({ rank, ...row })
  })
  return out
}
