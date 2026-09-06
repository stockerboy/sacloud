/** ★Part 5 조사 — 시즌 체계 현황★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'

console.info('══ ①② 현재 Season 행 전체 ══\n')
const seasons = await prisma.$queryRawUnsafe<
  Array<{
    id: string; league: string; number: number; seasonType: string; status: string
    startedAt: Date; endedAt: Date | null; imported: boolean; frozen: boolean
    players: number; clans: number; matches: number
  }>
>(`
  SELECT s.id, l.slug AS league, s.number, s."seasonType", s.status,
         s."startedAt", s."endedAt", s.imported, s.frozen,
         (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" p WHERE p."seasonId"=s.id) AS players,
         (SELECT COUNT(*)::int FROM "LeagueClanSeason" c WHERE c."seasonId"=s.id) AS clans,
         (SELECT COUNT(*)::int FROM "Match" m WHERE m."seasonId"=s.id) AS matches
    FROM "Season" s JOIN "League" l ON l.id = s."leagueId"
   ORDER BY l.slug, s.number`)
console.info('  리그      번호  종류      상태     들여옴 얼림  시작(UTC)   ~ 끝(UTC)     선수   클랜    경기')
for (const s of seasons)
  console.info(
    `  ${s.league.padEnd(8)} ${String(s.number).padStart(5)}  ${s.seasonType.padEnd(9)} ${s.status.padEnd(7)}` +
      ` ${s.imported ? 'O' : 'X'}      ${s.frozen ? 'O' : 'X'}   ` +
      `${s.startedAt.toISOString().slice(0, 10)} ~ ${s.endedAt?.toISOString().slice(0, 10) ?? '진행중   '}` +
      ` ${String(s.players).padStart(6)} ${String(s.clans).padStart(6)} ${String(s.matches).padStart(7)}`,
  )

console.info('\n══ ⑤ 근본 시즌 카드가 Season 행에 어떻게 붙나 ══\n')
const link = await prisma.$queryRawUnsafe<
  Array<{ number: number; srcSeason: number | null; n: number; srcLeague: string | null }>
>(`
  SELECT s.number, p.season AS "srcSeason", COUNT(*)::int AS n,
         MAX(p."sourceLeagueSlug") AS "srcLeague"
    FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id = p."seasonId"
   GROUP BY 1,2 ORDER BY 1 DESC`)
console.info('  Season.number  LeaguePlayerSeason.season  카드수  원본리그')
for (const r of link)
  console.info(
    `  ${String(r.number).padStart(13)}  ${String(r.srcSeason).padStart(24)}  ${String(r.n).padStart(6)}  ${r.srcLeague ?? '-'}`,
  )

console.info('\n══ ⑥⑦ 시즌7 재료가 DB 에 있나 ══\n')
const [lp] = await prisma.$queryRawUnsafe<
  Array<{ rows: number; withKill: number; leagues: string; lastSeen: Date | null }>
>(`
  SELECT COUNT(*)::int AS rows,
         COUNT(*) FILTER (WHERE lp.kill IS NOT NULL)::int AS "withKill",
         (SELECT STRING_AGG(DISTINCT l2.slug, ',') FROM "LeaguePlayer" x
            JOIN "League" l2 ON l2.id = x."leagueId") AS leagues,
         MAX(lp."updatedAt") AS "lastSeen"
    FROM "LeaguePlayer" lp`)
console.info(`  LeaguePlayer(현재시즌 집계) ${lp?.rows ?? 0}행 · 킬 있는 행 ${lp?.withKill ?? 0} · 리그 ${lp?.leagues ?? '-'}`)
console.info(`  마지막 갱신 ${lp?.lastSeen?.toISOString() ?? '-'}`)

const [sp] = await prisma.$queryRawUnsafe<Array<{ n: number; season7: number }>>(`
  SELECT COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE season = 7)::int AS season7
    FROM "LeaguePlayerSeason"`)
console.info(`  LeaguePlayerSeason 전체 ${sp?.n ?? 0}행 · ★그중 season=7 인 것 ${sp?.season7 ?? 0}행★`)

console.info('\n══ 이상한 Season 7 행 (supply) ══\n')
const seven = await prisma.$queryRawUnsafe<
  Array<{ id: string; league: string; startedAt: Date; endedAt: Date | null; createdAt: Date; seasonType: string }>
>(`
  SELECT s.id, l.slug AS league, s."startedAt", s."endedAt", s."createdAt", s."seasonType"
    FROM "Season" s JOIN "League" l ON l.id = s."leagueId" WHERE s.number = 7`)
for (const s of seven)
  console.info(
    `  ${s.league} · id ${s.id} · ${s.seasonType} · ${s.startedAt.toISOString()} ~ ${s.endedAt?.toISOString() ?? '-'} · 만든날 ${s.createdAt.toISOString()}`,
  )
if (seven.length === 0) console.info('  없다')
await prisma.$disconnect()
