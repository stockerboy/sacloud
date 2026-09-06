/** ★시즌이 실제로 몇 개 어떻게 쌓여 있나★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<
  Array<{
    league: string; number: number; seasonType: string; startedAt: Date; endedAt: Date | null
    players: number; matches: number; frozen: boolean
  }>
>(`
  SELECT l.slug AS league, s.number, s."seasonType", s."startedAt", s."endedAt", s.frozen,
         (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" ps WHERE ps."seasonId" = s.id) AS players,
         (SELECT COUNT(*)::int FROM "Match" m WHERE m."seasonId" = s.id) AS matches
    FROM "Season" s JOIN "League" l ON l.id = s."leagueId"
   ORDER BY l.slug, s.number`)
let cur = ''
for (const r of rows) {
  if (r.league !== cur) {
    console.info(`\n══ ${r.league} ══`)
    console.info('  번호    종류      얼림  시작        ~ 끝          선수행   경기')
    cur = r.league
  }
  console.info(
    `  ${String(r.number).padStart(5)}  ${r.seasonType.padEnd(9)} ${r.frozen ? 'O' : 'X'}` +
      `    ${r.startedAt.toISOString().slice(0, 10)} ~ ${(r.endedAt?.toISOString().slice(0, 10) ?? '진행중   ')}` +
      `  ${String(r.players).padStart(6)} ${String(r.matches).padStart(7)}`,
  )
}
console.info('\n══ 원본 시즌 7 이 들어와 있나 ══')
const [seven] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
  `SELECT COUNT(*)::int AS n FROM "Season" WHERE number = -107`)
console.info(`  내부번호 -107 (원본 시즌 7) 인 Season : ${seven?.n ?? 0}개`)
const src = await prisma.$queryRawUnsafe<Array<{ slug: string | null; n: number }>>(
  `SELECT "sourceLeagueSlug" AS slug, COUNT(*)::int AS n FROM "LeaguePlayerSeason" GROUP BY 1 ORDER BY 2 DESC`)
console.info(`  LeaguePlayerSeason 의 원본 리그 표기: ${JSON.stringify(src)}`)
await prisma.$disconnect()
