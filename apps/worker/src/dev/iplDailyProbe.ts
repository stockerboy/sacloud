/** IPL 경기가 날짜별로 몇 건인가 — ★언제 멈췄나★ (KST · 읽기 전용) */
import { prisma } from '@sacloud/db'
async function main() {
  const r = await prisma.$queryRaw<{ d: string; n: bigint; wl: bigint }[]>`
    SELECT to_char(m."startAt" AT TIME ZONE 'Asia/Seoul','MM-DD') AS d,
           count(*) AS n,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")) AS wl
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     WHERE m."startAt" >= now() - interval '20 days'
     GROUP BY 1 ORDER BY 1
  `
  const max = Math.max(...r.map(x => Number(x.n)), 1)
  console.info('IPL 경기 · 최근 20일 (KST)\n')
  for (const x of r) {
    const v = Number(x.n)
    console.info(`  ${x.d}  ${v.toLocaleString().padStart(5)}건  (라인업 ${Number(x.wl)})  ${'#'.repeat(Math.round(v/max*40))}`)
  }
  console.info('\n★읽는 법★ — 갑자기 0 에 가까워진 날이 ★수집이 멈춘 날★ 이다')
}
main().catch(console.error).finally(() => prisma.$disconnect())
