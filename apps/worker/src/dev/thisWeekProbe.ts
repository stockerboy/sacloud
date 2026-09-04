/** 이번 주(목 00시~) 경기가 다 들어왔나 (2026-09-04 · ★읽기 전용★) */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<{ d: string; games: bigint; filled: bigint; last: Date }[]>`
  SELECT to_char(m."startAt" AT TIME ZONE 'Asia/Seoul', 'MM-DD(Dy)') AS d,
         count(*) AS games,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")) AS filled,
         max(m."startAt") AS last
    FROM "Match" m
    JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
   WHERE m."startAt" >= '2026-08-27T15:00:00Z'
   GROUP BY 1, date_trunc('day', m."startAt" AT TIME ZONE 'Asia/Seoul')
   ORDER BY 2 DESC
`
console.info('══ ★최근 일주일 IPL 경기★ (KST) ══')
console.info('')
for (const r of rows.sort((a, b) => a.d.localeCompare(b.d))) {
  const g = Number(r.games); const f = Number(r.filled)
  console.info(`  ${r.d}  경기 ${String(g).padStart(4)}  기록 ${String(f).padStart(4)} (${g ? ((100*f)/g).toFixed(0) : 0}%)`)
}
const last = await prisma.$queryRaw<{ k: string; at: Date }[]>`
  SELECT m."sourceMatchId" AS k, m."startAt" AS at
    FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
   ORDER BY m."startAt" DESC LIMIT 1
`
const l = last[0]
console.info('')
if (l) {
  const kst = new Date(l.at.getTime() + 9*3600000).toISOString().slice(0,16).replace('T',' ')
  const ago = Math.round((Date.now() - l.at.getTime()) / 60000)
  console.info(`  ★가장 최근 경기 ${kst} KST★ — ${ago}분 전`)
}
await prisma.$disconnect()
