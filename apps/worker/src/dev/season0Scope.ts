/**
 * 시즌0 범위 실측 — **읽기만 한다** (D-175).
 *
 * 창과 대상 origin 은 `../lib/season0Window.ts` 한 곳에서 온다. 여기에 날짜를 다시 적지 않는다.
 * 창 밖 기록이 지워지지 않고 남아 있는지도 같이 센다 — 그것이 이 창 변경의 전제다.
 */
import { prisma } from '@sacloud/db'
import {
  SEASON0_FROM,
  SEASON0_ORIGINS,
  SEASON0_TO,
  season0WindowLabel,
} from '../lib/season0Window.js'

const ORIGINS = [...SEASON0_ORIGINS]

async function main(): Promise<void> {
  console.log(`시즌0 창 — ${season0WindowLabel()} · origin ${ORIGINS.join(' + ')}`)
  const inWindow = { gte: SEASON0_FROM, ...(SEASON0_TO ? { lt: SEASON0_TO } : {}) }

  const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true } })
  for (const l of leagues) {
    const total = await prisma.match.count({
      where: { leagueId: l.id, origin: { in: ORIGINS } },
    })
    if (total === 0) continue

    const perOrigin: Record<string, number> = {}
    for (const origin of ORIGINS) {
      perOrigin[origin] = await prisma.match.count({
        where: { leagueId: l.id, origin, startAt: inWindow },
      })
    }
    const windowTotal = Object.values(perOrigin).reduce((a, b) => a + b, 0)

    /* 창 밖(과거) 기록은 **지우지 않는다.** 남아 있는지 숫자로 확인한다 */
    const before = await prisma.match.count({
      where: { leagueId: l.id, origin: { in: ORIGINS }, startAt: { lt: SEASON0_FROM } },
    })

    /* 같은 경기가 두 origin 에 걸쳐 있는가 — 있으면 replay 가 중복으로 뺀다 */
    const dup = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM (
        SELECT "sourceMatchId" FROM "Match"
         WHERE "leagueId" = ${l.id} AND "sourceMatchId" IS NOT NULL
           AND "startAt" >= ${SEASON0_FROM}
         GROUP BY "sourceMatchId" HAVING COUNT(*) > 1) t`

    const players = await prisma.matchPlayerStat.findMany({
      where: { match: { leagueId: l.id, origin: { in: ORIGINS }, startAt: inWindow } },
      select: { playerId: true },
      distinct: ['playerId'],
    })
    const clans = await prisma.match.findMany({
      where: { leagueId: l.id, origin: { in: ORIGINS }, startAt: inWindow },
      select: { redLeagueClanId: true, blueLeagueClanId: true },
    })
    const clanIds = new Set(clans.flatMap((m) => [m.redLeagueClanId, m.blueLeagueClanId]))

    /* 라인업이 10명인 경기 = 우리 공식이 계산할 수 있는 경기 */
    const lineup = await prisma.$queryRaw<Array<{ n: number; matches: bigint }>>`
      SELECT n, COUNT(*) AS matches FROM (
        SELECT s."matchId", COUNT(*)::int AS n
          FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
         WHERE m."leagueId" = ${l.id} AND m.origin = ANY(${ORIGINS})
           AND m."startAt" >= ${SEASON0_FROM}
         GROUP BY s."matchId") t
      GROUP BY n ORDER BY n`

    console.log(`\n=== ${l.slug} (${l.name})`)
    console.log(`  전체 ${total} · 창 안 ${windowTotal} · 창 밖(보존) ${before}`)
    console.table([perOrigin])
    console.log(`  sourceMatchId 중복 그룹 ${Number(dup[0]?.n ?? 0)}`)
    console.log(`  선수 ${players.length}명 · 클랜 ${clanIds.size}개`)
    console.table(lineup.map((r) => ({ '라인업 인원': r.n, 경기: Number(r.matches) })))
  }
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
