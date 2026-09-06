/** ★근본 시즌은 언제부터 언제까지인가★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<
  Array<{
    number: number; startedAt: Date | null; endedAt: Date | null
    league: string; players: number; seasonType: string; frozen: boolean
    firstFetched: Date | null; lastFetched: Date | null; srcLeagues: string | null
  }>
>(`
  SELECT s.number, s."startedAt", s."endedAt", l.slug AS league, s."seasonType", s.frozen,
         (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" ps WHERE ps."seasonId" = s.id) AS players,
         (SELECT MIN(ps."sourceFetchedAt") FROM "LeaguePlayerSeason" ps WHERE ps."seasonId" = s.id) AS "firstFetched",
         (SELECT MAX(ps."sourceFetchedAt") FROM "LeaguePlayerSeason" ps WHERE ps."seasonId" = s.id) AS "lastFetched",
         (SELECT STRING_AGG(DISTINCT ps."sourceLeagueSlug", ',') FROM "LeaguePlayerSeason" ps WHERE ps."seasonId" = s.id) AS "srcLeagues"
    FROM "Season" s JOIN "League" l ON l.id = s."leagueId"
   WHERE s.number < -100 ORDER BY s.number DESC`)
console.info('  내부번호 원본시즌 리그     종류     얼림  시작 ~ 끝                    선수행  원본리그')
for (const r of rows) {
  const src = -100 - r.number
  console.info(
    `  ${String(r.number).padStart(7)} ${String(src).padStart(7)}  ${r.league.padEnd(8)} ${r.seasonType.padEnd(8)} ${r.frozen ? 'O' : 'X'}` +
      `   ${(r.startedAt?.toISOString().slice(0, 10) ?? '(없음)')} ~ ${(r.endedAt?.toISOString().slice(0, 10) ?? '★없음★')}` +
      `   ${String(r.players).padStart(6)}  ${r.srcLeagues ?? '-'}`,
  )
}
console.info(`\n  합계 ${rows.reduce((a, b) => a + b.players, 0)}행 · 시즌 ${rows.length}개`)
await prisma.$disconnect()
