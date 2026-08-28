/**
 * 미러 구간과 넥슨 재구성 경기의 겹침 · 두 래더 스케일의 혼재 규모 — 읽기만 한다.
 *
 * 배경 — supply 리그의 `LeaguePlayer.rating` 에 두 종류가 섞여 있다.
 *   · 미러(3rd.supply) 선수 : 원본 점수 그대로 (D-153)
 *   · `rate` 가 계산한 선수 : 우리 공식 기준점 3000 (D-145)
 * 기준점이 달라서 2판짜리 신규 행이 상위권에 앉는다.
 *
 * 여기서 재는 것 —
 *   1. 미러 경기의 시간 범위 (원본이 커버하는 구간)
 *   2. 넥슨 재구성 경기가 그 구간 **안**에 있는가 (있다면 중복 계산이다)
 *   3. 리그별로 두 스케일이 각각 몇 명인가
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true } })

  for (const league of leagues) {
    const mirror = await prisma.match.aggregate({
      where: { leagueId: league.id, origin: '3rd.supply' },
      _min: { startAt: true },
      _max: { startAt: true },
      _count: true,
    })
    const nexonCount = await prisma.match.count({ where: { leagueId: league.id, origin: 'nexon' } })
    if (mirror._count === 0 && nexonCount === 0) continue

    console.log(`\n=== ${league.slug} (${league.name})`)
    console.log(`미러 경기 ${mirror._count}건`)
    if (mirror._min.startAt) {
      console.log(`  구간 ${mirror._min.startAt.toISOString()} ~ ${mirror._max.startAt?.toISOString()}`)
    }
    console.log(`넥슨 재구성 경기 ${nexonCount}건`)

    if (nexonCount > 0 && mirror._max.startAt) {
      const inside = await prisma.match.count({
        where: {
          leagueId: league.id,
          origin: 'nexon',
          startAt: { lte: mirror._max.startAt },
        },
      })
      console.log(`  그중 미러 구간 안 ${inside}건  ← 원본이 이미 가진 기간`)
      console.log(`  미러 구간 뒤   ${nexonCount - inside}건  ← 진짜 신규 경기`)
    }

    /* 두 스케일이 각각 몇 명인가 */
    const rows = await prisma.$queryRaw<Array<{ 구분: string; n: bigint; min: number; avg: number; max: number }>>`
      SELECT CASE WHEN p."sourcePlayerId" IS NULL THEN '우리 공식(3000 기준)' ELSE '원본 점수' END AS "구분",
             COUNT(*) AS n,
             MIN(lp.rating)::int AS min,
             AVG(lp.rating)::int AS avg,
             MAX(lp.rating)::int AS max
        FROM "LeaguePlayer" lp
        JOIN "Player" p ON p.id = lp."playerId"
       WHERE lp."leagueId" = ${league.id}
       GROUP BY 1 ORDER BY 1`
    console.table(rows.map((r) => ({ ...r, n: Number(r.n) })))
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
