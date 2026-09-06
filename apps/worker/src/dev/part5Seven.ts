/** ★시즌7 기간의 재료가 무엇이 있나★ (2026-09-06 · Part 5 조사). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

console.info('══ 미러(3rd.supply)로 가져온 경기의 기간 ══\n')
const a = await prisma.$queryRawUnsafe<
  Array<{ league: string; n: number; first: Date; last: Date; stats: number }>
>(`
  SELECT l.slug AS league, COUNT(*)::int AS n, MIN(m."startAt") AS first, MAX(m."startAt") AS last,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" s WHERE s."matchId" IN (
            SELECT m2.id FROM "Match" m2 WHERE m2."leagueId"=l.id AND m2.origin='3rd.supply')) AS stats
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
   WHERE m.origin='3rd.supply' GROUP BY l.id, l.slug ORDER BY 1`)
for (const r of a)
  console.info(
    `  ${r.league.padEnd(8)} ${String(r.n).padStart(7)}건 · ${r.first.toISOString().slice(0, 10)} ~ ${r.last.toISOString().slice(0, 10)} · 참가기록 ${r.stats.toLocaleString()}줄`,
  )

console.info('\n══ 2024-04 이전 경기가 있나 (시즌7 시작이 2024-04 라면) ══\n')
const b = await prisma.$queryRawUnsafe<Array<{ league: string; before: number; after: number }>>(`
  SELECT l.slug AS league,
         COUNT(*) FILTER (WHERE m."startAt" <  TIMESTAMP '2024-04-01')::int AS before,
         COUNT(*) FILTER (WHERE m."startAt" >= TIMESTAMP '2024-04-01' AND m."startAt" < ${CUT})::int AS after
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" GROUP BY 1 ORDER BY 1`)
console.info('  리그      2024-04 이전   2024-04 ~ 기준시각')
for (const r of b)
  console.info(`  ${r.league.padEnd(8)} ${String(r.before).padStart(10)} ${String(r.after).padStart(18)}`)

console.info('\n══ 지금 화면의 「지난 시즌」이 무엇을 보여 주나 ══\n')
const c = await prisma.$queryRawUnsafe<Array<{ league: string; season: number; n: number }>>(`
  SELECT l.slug AS league, p.season, COUNT(*)::int AS n
    FROM "LeaguePlayerSeason" p
    JOIN "LeaguePlayer" lp ON lp.id = p."leaguePlayerId"
    JOIN "League" l ON l.id = lp."leagueId"
   GROUP BY 1,2 ORDER BY 1,2`)
for (const r of c) console.info(`  ${r.league.padEnd(8)} 원본시즌 ${r.season} · ${r.n}장`)

console.info('\n══ LeaguePlayer(현재 집계)는 어느 창을 담고 있나 ══\n')
const d = await prisma.$queryRawUnsafe<Array<{ league: string; n: number; kill: number; win: number }>>(`
  SELECT l.slug AS league, COUNT(*)::int AS n,
         COALESCE(SUM(lp.kill),0)::int AS kill, COALESCE(SUM(lp.win),0)::int AS win
    FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId" GROUP BY 1 ORDER BY 1`)
for (const r of d)
  console.info(`  ${r.league.padEnd(8)} 선수 ${String(r.n).padStart(6)}명 · 킬합 ${r.kill.toLocaleString()} · 승합 ${r.win.toLocaleString()}`)
await prisma.$disconnect()
