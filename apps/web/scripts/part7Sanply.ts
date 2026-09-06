/**
 * ★열산만 34명 + 56명이 남았다 — 왜인가★ (2026-09-06 · Part 7). ★읽기만 한다. 안 고친다.★
 *
 * 의심 —
 *   ① 집계가 ★숨긴 사본(supersededAt)★ 을 같이 세고 있나
 *   ② 집계 뒤에 ★새 경기가 들어와★ 다시 벌어졌나
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]
  const league = await prisma.league.findUniqueOrThrow({
    where: { slug: 'sanply' },
    select: { id: true },
  })

  console.info('══ 숨긴 사본을 포함하면 숫자가 맞나 ══\n')
  const [cmp] = await prisma.$queryRawUnsafe<
    Array<{ withHidden: number; withoutHidden: number; hiddenMatches: number; hiddenStats: number }>
  >(`
    SELECT
      (SELECT COUNT(DISTINCT ps."playerId")::int FROM "MatchPlayerStat" ps
         JOIN "Match" m ON m.id = ps."matchId"
        WHERE m."leagueId" = $1 AND m."startAt" >= $2 AND m."startAt" < $3
          AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($4::text[])))          AS "withHidden",
      (SELECT COUNT(DISTINCT ps."playerId")::int FROM "MatchPlayerStat" ps
         JOIN "Match" m ON m.id = ps."matchId"
        WHERE m."leagueId" = $1 AND m."startAt" >= $2 AND m."startAt" < $3
          AND m."supersededAt" IS NULL
          AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($4::text[])))          AS "withoutHidden",
      (SELECT COUNT(*)::int FROM "Match" m
        WHERE m."leagueId" = $1 AND m."startAt" >= $2 AND m."startAt" < $3
          AND m."supersededAt" IS NOT NULL)                                              AS "hiddenMatches",
      (SELECT COUNT(*)::int FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
        WHERE m."leagueId" = $1 AND m."startAt" >= $2 AND m."startAt" < $3
          AND m."supersededAt" IS NOT NULL)                                              AS "hiddenStats"`,
    league.id, from, to, origins)
  console.info(`  숨긴 사본까지 세면 선수 ★${cmp?.withHidden}명★`)
  console.info(`  숨긴 사본을 빼면   선수 ★${cmp?.withoutHidden}명★`)
  console.info(`  Cloud 0 창 안 ★숨긴 사본 경기 ${cmp?.hiddenMatches}건★ · 거기 달린 참가기록 ${cmp?.hiddenStats}줄`)
  console.info(`  집계 잡이 반영한 선수 수는 ★445명★ 이었다 — 위 둘 중 어느 쪽인가`)

  console.info('\n══ 집계 잡이 숨김을 보는가 (코드 근거) ══\n')
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync('apps/worker/src/lib/season0Window.ts', 'utf8'),
  )
  console.info(`  season0Window.ts 에 supersededAt 조건이 ${src.includes('supersededAt') ? '★있다★' : '★없다★'}`)
  const rate = await import('node:fs').then((fs) =>
    fs.readFileSync('apps/worker/src/jobs/rate.ts', 'utf8'),
  )
  console.info(`  rate.ts 에 supersededAt 조건이 ${rate.includes('supersededAt') ? '★있다★' : '★없다★'}`)

  console.info('\n══ 남은 34명은 집계 뒤에 생긴 것인가 ══\n')
  const rows = await prisma.$queryRawUnsafe<
    Array<{ name: string; aggUpdated: Date; lastMatch: Date | null; hiddenGames: number }>
  >(`
    WITH live AS (
      SELECT ps."playerId",
             COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int  AS win,
             COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
             COALESCE(SUM(ps.kill),0)::int AS kill, COALESCE(SUM(ps.death),0)::int AS death,
             MAX(m."startAt") AS "lastMatch"
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."leagueId" = $1 AND m."startAt" >= $2 AND m."startAt" < $3
         AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($4::text[]))
       GROUP BY 1
    )
    SELECT p.name, lp."updatedAt" AS "aggUpdated", live."lastMatch",
           (SELECT COUNT(*)::int FROM "MatchPlayerStat" ps2 JOIN "Match" m2 ON m2.id = ps2."matchId"
             WHERE ps2."playerId" = lp."playerId" AND m2."leagueId" = $1
               AND m2."startAt" >= $2 AND m2."startAt" < $3
               AND m2."supersededAt" IS NOT NULL)                       AS "hiddenGames"
      FROM "LeaguePlayer" lp
      JOIN "Player" p ON p.id = lp."playerId"
      JOIN live ON live."playerId" = lp."playerId"
     WHERE lp."leagueId" = $1
       AND (lp.win <> live.win OR lp.lose <> live.lose
            OR lp.kill <> live.kill OR lp.death <> live.death)
     ORDER BY live."lastMatch" DESC NULLS LAST`,
    league.id, from, to, origins)
  const after = rows.filter((r) => r.lastMatch && r.lastMatch > r.aggUpdated).length
  const hidden = rows.filter((r) => r.hiddenGames > 0).length
  console.info(`  어긋난 선수 ${rows.length}명`)
  console.info(`    그중 ★마지막 경기가 집계보다 뒤★ (= 집계 뒤 새 경기)  ${after}명`)
  console.info(`    그중 ★숨긴 사본 경기를 가진 선수★                     ${hidden}명`)
  for (const r of rows.slice(0, 5))
    console.info(
      `    ${r.name.padEnd(14)} 집계 ${r.aggUpdated.toISOString().slice(0, 16)} · ` +
        `마지막 경기 ${r.lastMatch?.toISOString().slice(0, 16) ?? '-'} · 숨긴 경기 ${r.hiddenGames}판`,
    )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
