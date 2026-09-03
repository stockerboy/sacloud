/**
 * **한 팀에 몇 명이 정상인가** (2026-09-04 · ★읽기 전용★).
 *
 * 20명짜리 경기를 펼쳤더니 ★blue 10명 · red 10명★ 인데 red 쪽에
 * ★킬·데스가 완전히 같은 쌍이 5쌍★ 이었다. ★같은 사람이 두 번 들어간 것으로 보인다.★
 *
 * ★그런데 「한 팀 10명이 정상인지 5명이 정상인지」를 모르면 판정할 수 없다.★
 * ★그래서 온전해 보이는 10명짜리 경기의 팀별 인원을 먼저 센다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ ★10명짜리 경기 — 팀별로 몇 명인가★ ══')
  console.info('')
  const ten = await prisma.$queryRaw<{ red: number; blue: number; games: bigint }[]>`
    SELECT r.red::int AS red, r.blue::int AS blue, count(*) AS games FROM (
      SELECT m."id",
             (SELECT count(*) FROM "MatchPlayerStat" p WHERE p."matchId" = m."id" AND p."side" = 'red') AS red,
             (SELECT count(*) FROM "MatchPlayerStat" p WHERE p."matchId" = m."id" AND p."side" = 'blue') AS blue
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
       WHERE (SELECT count(*) FROM "MatchPlayerStat" p WHERE p."matchId" = m."id") = 10
    ) r GROUP BY 1,2 ORDER BY 3 DESC
  `
  for (const r of ten) console.info(`  red ${r.red}명 · blue ${r.blue}명   ${Number(r.games).toLocaleString()}경기`)

  console.info('')
  console.info('══ ★킬·데스가 똑같은 쌍이 있는 경기★ — 같은 사람이 두 번 들어간 표시 ══')
  console.info('')
  const dup = await prisma.$queryRaw<{ n: number; games: bigint }[]>`
    SELECT t.n::int AS n, count(*) AS games FROM (
      SELECT m."id",
             (SELECT count(*) FROM "MatchPlayerStat" p WHERE p."matchId" = m."id") AS n
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
       WHERE EXISTS (
         SELECT 1 FROM "MatchPlayerStat" a
          WHERE a."matchId" = m."id"
          GROUP BY a."side", a."kill", a."death"
         HAVING count(*) > 1 AND a."kill" IS NOT NULL)
    ) t WHERE t.n > 0 GROUP BY 1 ORDER BY 1
  `
  let total = 0
  for (const r of dup) {
    total += Number(r.games)
    console.info(`  ${String(r.n).padStart(3)}명 경기 중 ★${Number(r.games).toLocaleString()}건★ 에 똑같은 쌍이 있다`)
  }
  console.info('')
  console.info(`  ★합계 ${total.toLocaleString()}경기★`)
  console.info('')
  console.info('  ⚠ ★킬·데스가 같다고 반드시 같은 사람은 아니다★ — 5킬 5데스는 흔하다.')
  console.info('    ★10명짜리 경기에도 같은 쌍이 많다면 그건 우연이라는 뜻이다.★')
  console.info('    ★10명에는 드물고 20명에만 몰려 있다면 그건 겹친 것이다.★')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
