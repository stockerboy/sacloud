/**
 * **IPL 에 MVP 가 하나도 없나** (2026-09-03 · 읽기 전용).
 *
 * IPL 상위 5명이 ★전부 MVP 0회★ 였다. ★우연이면 그럴 리가 없다.★
 * 「원본이 안 준다」인지 「우리가 안 넣는다」인지 가른다 — ★사장님께 드릴 말이 다르다★.
 */
import { prisma } from '@sacloud/db'
async function main() {
  const r = await prisma.$queryRaw<{ league: string; n: bigint; known: bigint; t: bigint }[]>`
    SELECT l."slug" AS league, count(*) AS n,
           count(s."mvp") AS known,
           count(*) FILTER (WHERE s."mvp" IS TRUE) AS t
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  console.info('리그      전체행        mvp 아는 행      mvp=true')
  for (const x of r) {
    const n = Number(x.n), k = Number(x.known), t = Number(x.t)
    console.info(
      `  ${x.league.padEnd(8)} ${n.toLocaleString().padStart(10)}  ` +
        `${((100 * k) / n).toFixed(1).padStart(6)}%  ` +
        `${t.toLocaleString().padStart(8)}${k === 0 ? '  ★전부 모른다★' : ''}`,
    )
  }
  console.info('\n★읽는 법★ — 아는 행이 0% 면 ★원본이 안 준 것★ 이고 화면은 「알수없음」이어야 한다.')
  console.info('           아는 행이 있는데 true 가 0 이면 ★우리가 판정을 안 한 것★ 이다.')
}
main().catch(console.error).finally(() => prisma.$disconnect())
