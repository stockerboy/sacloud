/** 3~6월 IPL 경기 하나 고르기 (2026-09-04 · ★읽기 전용★) — 화면 확인용 주소를 만든다 */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<
  { id: string; key: string; startAt: Date; players: bigint }[]
>`
  SELECT m."id", m."sourceMatchId" AS key, m."startAt",
         (SELECT count(*) FROM "MatchPlayerStat" s WHERE s."matchId" = m."id") AS players
    FROM "Match" m
    JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
   WHERE m."startAt" < '2026-06-30T15:00:00Z'
   ORDER BY (SELECT count(*) FROM "MatchPlayerStat" s WHERE s."matchId" = m."id") DESC,
            m."startAt" DESC
   LIMIT 5
`
console.info('══ ★3~6월 IPL 경기 (라인업 많은 순)★ ══')
console.info('')
for (const r of rows) {
  const kst = new Date(r.startAt.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ')
  console.info(`  ${kst} KST · ${Number(r.players)}명 · https://3rdcloud.my/league/nolink/match/${r.key}`)
}
if (rows.length === 0) console.info('  (아직 없다)')
await prisma.$disconnect()
