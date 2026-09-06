/**
 * ★★Part 7 — 랭킹 구조 조사★★ (2026-09-06 · 사장님 지시 1). ★읽기만 한다. 안 고친다.★
 *
 * 랭킹은 ★`LeaguePlayer` · `LeagueClan` 이라는 미리 집계된 표★ 를 읽는다.
 * Part 6 에서 맞다고 증명한 것은 ★그 자리에서 세는 값★(`playerLadderTotals`)이었다.
 * ★둘이 같은지가 이 조사의 핵심★ 이다 — 다르면 랭킹만 옛 숫자를 보여 준다.
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]

  console.info('══ 랭킹이 읽는 표가 언제 채워졌나 ══\n')
  const fresh = await prisma.$queryRawUnsafe<
    Array<{ slug: string; players: number; lastPlayer: Date | null; clans: number; lastClan: Date | null }>
  >(`
    SELECT l.slug,
           (SELECT COUNT(*)::int FROM "LeaguePlayer" lp WHERE lp."leagueId" = l.id)   AS players,
           (SELECT MAX(lp."updatedAt") FROM "LeaguePlayer" lp WHERE lp."leagueId" = l.id) AS "lastPlayer",
           (SELECT COUNT(*)::int FROM "LeagueClan" lc WHERE lc."leagueId" = l.id)     AS clans,
           (SELECT MAX(lc."updatedAt") FROM "LeagueClan" lc WHERE lc."leagueId" = l.id) AS "lastClan"
      FROM "League" l WHERE l.slug IN ('nolink','supply','sanply') ORDER BY 1`)
  for (const f of fresh)
    console.info(
      `  ${(LABEL[f.slug] ?? f.slug).padEnd(12)} LeaguePlayer ${String(f.players).padStart(6)}행 (마지막 ${f.lastPlayer?.toISOString().slice(0, 16) ?? '-'})` +
        ` · LeagueClan ${String(f.clans).padStart(4)}행 (마지막 ${f.lastClan?.toISOString().slice(0, 16) ?? '-'})`,
    )

  console.info('\n══ ★랭킹 모집단★ — placement=false 인 선수 ══\n')
  const pop = await prisma.$queryRawUnsafe<
    Array<{ slug: string; total: number; ranked: number; placement: number; zeroGame: number }>
  >(`
    SELECT l.slug,
           COUNT(*)::int                                        AS total,
           COUNT(*) FILTER (WHERE NOT lp.placement)::int         AS ranked,
           COUNT(*) FILTER (WHERE lp.placement)::int             AS placement,
           COUNT(*) FILTER (WHERE lp."placementPlayed" = 0)::int AS "zeroGame"
      FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId"
     WHERE l.slug IN ('nolink','supply','sanply') GROUP BY 1 ORDER BY 1`)
  for (const p of pop)
    console.info(
      `  ${(LABEL[p.slug] ?? p.slug).padEnd(12)} 전체 ${String(p.total).padStart(6)}명 · ` +
        `★랭킹에 나오는 선수 ${String(p.ranked).padStart(6)}명★ · 빠지는 선수(placement) ${String(p.placement).padStart(6)}명 · 0판 ${p.zeroGame}`,
    )

  console.info('\n══ ★★집계 표 vs 그 자리에서 센 값★★ (Cloud 0 창) ══\n')
  const cmp = await prisma.$queryRawUnsafe<
    Array<{
      slug: string; agg: number; live: number; both: number
      sameWin: number; diffWin: number; aggOnly: number; liveOnly: number
    }>
  >(`
    WITH live AS (
      SELECT m."leagueId", ps."playerId",
             COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int AS win,
             COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
             COALESCE(SUM(ps.kill),0)::int AS kill, COALESCE(SUM(ps.death),0)::int AS death
        FROM "MatchPlayerStat" ps
        JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2 AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    )
    SELECT l.slug,
      COUNT(*) FILTER (WHERE lp.id IS NOT NULL AND NOT lp.placement)::int          AS agg,
      COUNT(*) FILTER (WHERE live."playerId" IS NOT NULL)::int                     AS live,
      COUNT(*) FILTER (WHERE lp.id IS NOT NULL AND live."playerId" IS NOT NULL)::int AS both,
      COUNT(*) FILTER (WHERE lp.id IS NOT NULL AND live."playerId" IS NOT NULL
                         AND lp.win = live.win AND lp.lose = live.lose
                         AND lp.kill = live.kill AND lp.death = live.death)::int    AS "sameWin",
      COUNT(*) FILTER (WHERE lp.id IS NOT NULL AND live."playerId" IS NOT NULL
                         AND (lp.win <> live.win OR lp.lose <> live.lose
                              OR lp.kill <> live.kill OR lp.death <> live.death))::int AS "diffWin",
      COUNT(*) FILTER (WHERE lp.id IS NOT NULL AND NOT lp.placement
                         AND live."playerId" IS NULL)::int                          AS "aggOnly",
      COUNT(*) FILTER (WHERE lp.id IS NULL AND live."playerId" IS NOT NULL)::int     AS "liveOnly"
      FROM "League" l
      LEFT JOIN "LeaguePlayer" lp ON lp."leagueId" = l.id
      FULL JOIN live ON live."leagueId" = l.id AND live."playerId" = lp."playerId"
     WHERE l.slug IN ('nolink','supply','sanply')
     GROUP BY 1 ORDER BY 1`, from, to, origins)
  console.info('  리그         랭킹표(placement=false)  창에서 실제로 뛴 선수  둘 다  ★값이 같은 선수★  ★값이 다른 선수★  표에만  실제에만')
  for (const c of cmp)
    console.info(
      `  ${(LABEL[c.slug] ?? c.slug).padEnd(12)} ${String(c.agg).padStart(16)} ${String(c.live).padStart(20)}` +
        ` ${String(c.both).padStart(6)} ${String(c.sameWin).padStart(14)} ${String(c.diffWin).padStart(15)}` +
        ` ${String(c.aggOnly).padStart(7)} ${String(c.liveOnly).padStart(8)}`,
    )

  console.info('\n══ 클랜 랭킹 표 ══\n')
  const clan = await prisma.$queryRawUnsafe<
    Array<{ slug: string; total: number; ranked: number; placement: number; divisions: string }>
  >(`
    SELECT l.slug, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE NOT lc.placement)::int AS ranked,
           COUNT(*) FILTER (WHERE lc.placement)::int     AS placement,
           STRING_AGG(DISTINCT lc.division::text, ',' ORDER BY lc.division::text) AS divisions
      FROM "LeagueClan" lc JOIN "League" l ON l.id = lc."leagueId"
     WHERE l.slug IN ('nolink','supply','sanply') AND lc."expelledAt" IS NULL
     GROUP BY 1 ORDER BY 1`)
  for (const c of clan)
    console.info(
      `  ${(LABEL[c.slug] ?? c.slug).padEnd(12)} 활성 ${String(c.total).padStart(4)}곳 · ★랭킹에 나오는 곳 ${String(c.ranked).padStart(4)}★ · 빠지는 곳 ${String(c.placement).padStart(4)} · 부리그 ${c.divisions}`,
    )

  console.info('\n══ 래더 값이 실제로 움직였나 (Cloud 0 창의 증감) ══\n')
  const delta = await prisma.$queryRawUnsafe<Array<{ slug: string; rows: number; withUpdate: number }>>(`
    SELECT l.slug, COUNT(*)::int AS rows,
           COUNT(ps."ratingUpdate")::int AS "withUpdate"
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "League" l ON l.id = m."leagueId"
     WHERE m."startAt" >= $1 AND m."startAt" < $2
       AND l.slug IN ('nolink','supply','sanply')
     GROUP BY 1 ORDER BY 1`, from, to)
  for (const d of delta)
    console.info(
      `  ${(LABEL[d.slug] ?? d.slug).padEnd(12)} 창 안 참가기록 ${String(d.rows).padStart(6)}줄 · ★개인 래더 증감이 적힌 줄 ${d.withUpdate}★`,
    )

  console.info('\n══ 래더 점수의 분포 (랭킹의 정렬 키) ══\n')
  const rating = await prisma.$queryRawUnsafe<
    Array<{ slug: string; n: number; min: number; max: number; base: number; distinct: number }>
  >(`
    SELECT l.slug, COUNT(*)::int AS n, MIN(lp.rating)::int AS min, MAX(lp.rating)::int AS max,
           COUNT(*) FILTER (WHERE lp.rating = lp."baseRating")::int AS base,
           COUNT(DISTINCT lp.rating)::int AS distinct
      FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId"
     WHERE l.slug IN ('nolink','supply','sanply') AND NOT lp.placement
     GROUP BY 1 ORDER BY 1`)
  for (const r of rating)
    console.info(
      `  ${(LABEL[r.slug] ?? r.slug).padEnd(12)} 랭킹 선수 ${String(r.n).padStart(6)}명 · 래더 ${r.min} ~ ${r.max} · ` +
        `서로 다른 값 ${r.distinct}가지 · ★시작점수 그대로인 선수 ${r.base}명★`,
    )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
