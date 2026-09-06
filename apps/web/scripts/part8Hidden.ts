/**
 * ★화면 질의가 숨긴 사본을 세는가★ (2026-09-06 · Part 8). ★읽기만 한다. 안 고친다.★
 *
 * Part 7 에서 ★집계★ 가 숨긴 사본을 세던 것을 고쳤다.
 * 그런데 ★화면 질의(`season0Scope.seasonWindowWhere`)에는 그 조건이 없다.★
 * 그러면 —
 *   랭킹(집계 표를 읽음)      숨긴 사본 ★뺀 값★
 *   선수 상세(그 자리에서 셈)  숨긴 사본 ★센 값★
 * ★같은 화면 안에서 숫자가 어긋난다.★ 얼마나인지 센다.
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]

  console.info('══ Cloud 0 창 안의 숨긴 사본 ══\n')
  const hidden = await prisma.$queryRawUnsafe<
    Array<{ slug: string; matches: number; stats: number; players: number; clans: number }>
  >(`
    SELECT l.slug,
           COUNT(DISTINCT m.id)::int              AS matches,
           COUNT(ps.id)::int                      AS stats,
           COUNT(DISTINCT ps."playerId")::int     AS players,
           COUNT(DISTINCT m."redLeagueClanId")::int AS clans
      FROM "Match" m
      JOIN "League" l ON l.id = m."leagueId"
      LEFT JOIN "MatchPlayerStat" ps ON ps."matchId" = m.id
     WHERE m."supersededAt" IS NOT NULL
       AND m."startAt" >= $1 AND m."startAt" < $2
     GROUP BY 1 ORDER BY 1`, from, to)
  if (hidden.length === 0) console.info('  ★없다★')
  for (const h of hidden)
    console.info(
      `  ${(LABEL[h.slug] ?? h.slug).padEnd(12)} 숨긴 경기 ${h.matches}건 · 참가기록 ${h.stats}줄 · ` +
        `걸리는 선수 ${h.players}명 · 클랜 ${h.clans}곳`,
    )

  console.info('\n══ 화면이 세는 값 vs 숨김을 뺀 값 (선수) ══\n')
  const players = await prisma.$queryRawUnsafe<
    Array<{ slug: string; total: number; diff: number }>
  >(`
    WITH withHidden AS (
      SELECT m."leagueId", ps."playerId",
             COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int AS win,
             COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
             COALESCE(SUM(ps.kill),0)::int AS kill, COALESCE(SUM(ps.death),0)::int AS death
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    ), withoutHidden AS (
      SELECT m."leagueId", ps."playerId",
             COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int AS win,
             COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
             COALESCE(SUM(ps.kill),0)::int AS kill, COALESCE(SUM(ps.death),0)::int AS death
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2 AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    )
    SELECT l.slug, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE a.win <> b.win OR a.lose <> b.lose
                              OR a.kill <> b.kill OR a.death <> b.death)::int AS diff
      FROM withHidden a
      JOIN withoutHidden b ON b."leagueId" = a."leagueId" AND b."playerId" = a."playerId"
      JOIN "League" l ON l.id = a."leagueId"
     WHERE l.slug IN ('nolink','supply','sanply')
     GROUP BY 1 ORDER BY 1`, from, to, origins)
  for (const p of players)
    console.info(
      `  ${(LABEL[p.slug] ?? p.slug).padEnd(12)} 창 안 선수 ${String(p.total).padStart(5)}명 중 ` +
        `★숫자가 달라지는 선수 ${p.diff}명★`,
    )

  console.info('\n══ 경기 목록에도 숨긴 사본이 나오나 ══\n')
  const [list] = await prisma.$queryRawUnsafe<Array<{ inList: number }>>(`
    SELECT COUNT(*)::int AS "inList" FROM "Match" m
     WHERE m."supersededAt" IS NOT NULL AND m."startAt" >= $1 AND m."startAt" < $2`, from, to)
  console.info(`  경기 목록 질의(getLeagueMatches)는 숨김 조건이 없다 → ★${list?.inList}건이 목록에 그대로 나온다★`)

  console.info('\n══ 랭킹(집계 표)은 이미 뺐다 — 그래서 어긋난다 ══\n')
  console.info('  랭킹        LeaguePlayer 를 읽는다 → Part 7 에서 숨김을 뺐다 ★맞는 값★')
  console.info('  선수 상세   그 자리에서 센다        → 숨김 조건이 없다      ★부풀려진 값★')
  console.info('  ★같은 선수의 두 숫자가 서로 다르다.★')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
