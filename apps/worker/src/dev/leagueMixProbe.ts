/**
 * **IPL 경기가 왜 다른 리그로 들어갔나** (2026-09-04 · ★읽기 전용★).
 *
 * 받은 배틀로그 9,491건 중 ★3,566건이 「다른 리그 경기로는 있다」★ 였다 (D-271).
 * ★같은 경기가 리그를 잘못 타고 있으면 IPL 화면에서 그만큼이 빈다.★
 *
 * ══ 세 가지 중 무엇인가 ══
 * ```
 * ① ★진짜 다른 리그 경기다★      — IPL 클랜이 SPL·열산에서도 뛴다. ★정상이다★
 * ② ★같은 경기가 양쪽에 다 있다★  — 미러가 준 것과 병영수첩이 준 것. ★두 번 세면 안 된다★
 * ③ ★IPL 경기인데 리그가 틀렸다★  — ★이건 결함이다★
 * ```
 * ★①과 ③을 가르는 기준★ — 그 경기의 ★양쪽 클랜이 둘 다 IPL 등록 클랜인가.★
 * 둘 다 IPL 인데 리그가 IPL 이 아니면 ★③이다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { league: string; both_ipl: bigint; one_ipl: bigint; no_ipl: bigint }[]
  >`
    WITH b AS (
      SELECT DISTINCT "matchKey" AS k FROM "BarracksBattleLogRaw" WHERE "matchKey" ~ '^[0-9]{12}'
    ),
    /* IPL 에 등록된 클랜 id */
    ipl AS (
      SELECT lc."clanId" FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
    ),
    /* 배틀로그를 받았는데 IPL Match 가 없는 경기들이, 어느 리그의 Match 로 있나 */
    other AS (
      SELECT m."id", l2."slug" AS league,
             (rlc."clanId" IN (SELECT "clanId" FROM ipl)) AS red_ipl,
             (blc."clanId" IN (SELECT "clanId" FROM ipl)) AS blue_ipl
        FROM b
        JOIN "Match" m ON m."sourceMatchId" = b.k
        JOIN "League" l2 ON l2."id" = m."leagueId"
        JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
        JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
       WHERE l2."slug" <> 'nolink'
         AND NOT EXISTS (
           SELECT 1 FROM "Match" m2
             JOIN "League" l3 ON l3."id" = m2."leagueId" AND l3."slug" = 'nolink'
            WHERE m2."sourceMatchId" = b.k)
    )
    SELECT league,
           count(*) FILTER (WHERE red_ipl AND blue_ipl)         AS both_ipl,
           count(*) FILTER (WHERE red_ipl <> blue_ipl)          AS one_ipl,
           count(*) FILTER (WHERE NOT red_ipl AND NOT blue_ipl) AS no_ipl
      FROM other GROUP BY 1 ORDER BY 2 DESC
  `

  console.info('══ ★배틀로그는 받았는데 IPL 경기가 아닌 것 — 어느 리그에 있나★ ══')
  console.info('')
  console.info('  리그          ★양쪽 다 IPL★   한쪽만 IPL   양쪽 다 아님')
  console.info('  ' + '─'.repeat(62))
  let both = 0
  for (const r of rows) {
    both += Number(r.both_ipl)
    console.info(
      `  ${r.league.padEnd(12)}  ★${String(Number(r.both_ipl)).padStart(6)}★     ` +
        `${String(Number(r.one_ipl)).padStart(6)}     ${String(Number(r.no_ipl)).padStart(6)}`,
    )
  }
  console.info('  ' + '─'.repeat(62))
  console.info('')
  console.info(`  ★★양쪽 다 IPL 인데 IPL 경기가 아닌 것 ${both.toLocaleString()}건★★`)
  console.info('  ★이 몫이 「리그가 틀린 것」의 후보다★ — 한쪽만 IPL 이면 리그 밖 경기라 정상이다.')
  console.info('')
  console.info('  ⚠ ★후보지 확정이 아니다★ — 그 경기가 ★IPL 일정에 든 경기였는지★ 는')
  console.info('    맵·시각·부리그를 봐야 안다. ★여기서는 세기만 한다.★')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
