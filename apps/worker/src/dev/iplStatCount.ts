/** IPL 참가 기록이 지금 몇 건인가 (읽기 전용) */
import { prisma } from '@sacloud/db'
async function main() {
  const r = await prisma.$queryRaw<{ stats: bigint; matches: bigint; players: bigint }[]>`
    SELECT count(*) AS stats,
           count(DISTINCT s."matchId") AS matches,
           count(DISTINCT s."playerId") AS players
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE l."slug" = 'nolink'
  `
  const x = r[0]!
  console.info(`IPL 참가 기록 ★${Number(x.stats).toLocaleString()}건★ · 경기 ${Number(x.matches).toLocaleString()} · 선수 ${Number(x.players).toLocaleString()}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
