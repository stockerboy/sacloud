/* 임시 진단 — 월별 폼 설계용 실측. 끝나면 삭제한다. */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const t0 = Date.now()
const nullKda = await prisma.$queryRawUnsafe<{ total: bigint; nullkill: bigint }[]>(
  `SELECT count(*) AS total, count(*) FILTER (WHERE "kill" IS NULL) AS nullkill FROM "MatchPlayerStat"`,
)
console.log('MatchPlayerStat', nullKda[0], Date.now() - t0, 'ms')

const span = await prisma.$queryRawUnsafe<{ min: Date; max: Date }[]>(
  `SELECT min("startAt") AS min, max("startAt") AS max FROM "Match"`,
)
console.log('startAt span', span[0])

const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true, category: true } })
console.log('leagues', leagues)

/* 경기 많은 선수 5명 */
const top = await prisma.$queryRawUnsafe<{ playerid: string; name: string; leagueid: string; n: bigint }[]>(
  `SELECT s."playerId" AS playerid, p.name, m."leagueId" AS leagueid, count(*) AS n
     FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId" JOIN "Player" p ON p.id = s."playerId"
    GROUP BY 1,2,3 ORDER BY n DESC LIMIT 8`,
)
console.log('top players', top)

await prisma.$disconnect()
