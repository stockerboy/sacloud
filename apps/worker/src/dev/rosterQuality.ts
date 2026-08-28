/**
 * "본클랜원 0명" 이 진짜인지 데이터 구멍인지 가른다 — 읽기만 한다.
 *
 * `participantRole` 은 **원본이 기록한 경기 당시 소속**과 그 팀의 클랜을 비교해 정한다
 * (`supplyMirrorImport`). 그래서 셋 중 하나다.
 *
 *   같은 클랜        본클랜원
 *   다른 클랜        진짜 용병          ← (A) 열산화가 실제로 심한 것
 *   소속 기록 없음   우리가 모르는 것    ← (B) 데이터 구멍
 *
 * (B) 가 크면 "클랜원이 많을수록 점수를 더" 를 지금 데이터로는 못 한다.
 */
import { prisma } from '@sacloud/db'

const FROM = new Date('2026-01-01T00:00:00.000Z')
const TO = new Date('2026-07-01T00:00:00.000Z')

async function analyse(slug: string): Promise<void> {
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!league) return

  const rows = await prisma.$queryRaw<Array<{ 구분: string; n: bigint }>>`
    SELECT CASE
             WHEN s."matchTimeLeagueClanId" IS NULL THEN '소속 기록 없음'
             WHEN s."matchTimeLeagueClanId" = CASE WHEN s.side = 'red' THEN m."redLeagueClanId"
                                                   ELSE m."blueLeagueClanId" END THEN '본클랜원'
             ELSE '다른 클랜(용병)'
           END AS "구분",
           COUNT(*) AS n
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m.id = s."matchId"
     WHERE m."leagueId" = ${league.id} AND m.origin = '3rd.supply'
       AND m."startAt" >= ${FROM} AND m."startAt" < ${TO}
     GROUP BY 1 ORDER BY 2 DESC`

  const total = rows.reduce((sum, r) => sum + Number(r.n), 0)
  console.log(`\n=== ${slug} (${league.name}) — 참가행 ${total}`)
  console.table(
    rows.map((r) => ({
      구분: r.구분,
      참가행: Number(r.n),
      비율: `${((Number(r.n) / total) * 100).toFixed(1)}%`,
    })),
  )

  /* 용병으로 잡힌 선수가 정말 다른 클랜 소속인지 표본으로 본다 */
  const sample = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.name AS "선수", c1.name AS "경기당시 소속", c2.name AS "뛴 팀"
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m.id = s."matchId"
      JOIN "Player" p ON p.id = s."playerId"
      LEFT JOIN "LeagueClan" lc1 ON lc1.id = s."matchTimeLeagueClanId"
      LEFT JOIN "Clan" c1 ON c1.id = lc1."clanId"
      LEFT JOIN "LeagueClan" lc2 ON lc2.id = CASE WHEN s.side='red' THEN m."redLeagueClanId"
                                                  ELSE m."blueLeagueClanId" END
      LEFT JOIN "Clan" c2 ON c2.id = lc2."clanId"
     WHERE m."leagueId" = ${league.id} AND m.origin = '3rd.supply'
       AND m."startAt" >= ${FROM} AND m."startAt" < ${TO}
       AND s."matchTimeLeagueClanId" IS NOT NULL
       AND s."matchTimeLeagueClanId" <> CASE WHEN s.side='red' THEN m."redLeagueClanId"
                                             ELSE m."blueLeagueClanId" END
     LIMIT 8`
  if (sample.length > 0) {
    console.log('용병 표본')
    console.table(sample)
  }
}

async function main(): Promise<void> {
  for (const slug of ['supply', 'sanply', 'daerule']) await analyse(slug)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
