/** 새 계획을 위한 실측 (2026-09-04 · ★읽기 전용★) — 9/3 07:00 KST 기준 */
import { prisma } from '@sacloud/db'
const CUT = new Date('2026-09-02T22:00:00Z') // 9/3 07:00 KST
const rows = await prisma.$queryRaw<
  { league: string; before: bigint; after: bigint; after_filled: bigint }[]
>`
  SELECT l."slug" AS league,
         count(*) FILTER (WHERE m."startAt" <  ${CUT}) AS before,
         count(*) FILTER (WHERE m."startAt" >= ${CUT}) AS after,
         count(*) FILTER (WHERE m."startAt" >= ${CUT} AND EXISTS (
           SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")) AS after_filled
    FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
   GROUP BY 1 ORDER BY 3 DESC
`
console.info('══ ★9/3 07:00 KST 기준★ ══')
console.info('')
console.info('  리그        그 전       그 후    그 후 기록있음')
console.info('  ' + '─'.repeat(56))
for (const r of rows) {
  const a = Number(r.after); const f = Number(r.after_filled)
  console.info(`  ${r.league.padEnd(10)} ${String(Number(r.before)).padStart(7)} ${String(a).padStart(8)} ${String(f).padStart(10)} (${a ? ((100*f)/a).toFixed(0) : 0}%)`)
}

/* SPL 시즌7 */
const s7 = await prisma.$queryRaw<{ n: bigint; first: Date; last: Date }[]>`
  SELECT count(*) AS n, min(m."startAt") AS first, max(m."startAt") AS last
    FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'supply'
   WHERE m."startAt" >= '2026-06-16T09:05:00Z' AND m."startAt" < ${CUT}
`
const s = s7[0]!
const kst = (d: Date | null) => d ? new Date(d.getTime()+9*3600000).toISOString().slice(0,16).replace('T',' ') : '-'
console.info('')
console.info(`  ★SPL 시즌7 창(6/16~9/3 07시) 경기 ${Number(s.n).toLocaleString()}건★  ${kst(s.first)} ~ ${kst(s.last)}`)

/* 그 창에 기록(라인업) 있는 선수 수 */
const p = await prisma.$queryRaw<{ players: bigint; filled: bigint }[]>`
  SELECT count(DISTINCT lp."id") AS players,
         count(DISTINCT lp."id") FILTER (WHERE lp."rating" IS NOT NULL) AS filled
    FROM "LeaguePlayer" lp JOIN "League" l ON l."id" = lp."leagueId" AND l."slug" = 'supply'
`
console.info(`  ★SPL 선수 ${Number(p[0]!.players).toLocaleString()}명★ (래더 값 있는 선수 ${Number(p[0]!.filled).toLocaleString()}명)`)
await prisma.$disconnect()
