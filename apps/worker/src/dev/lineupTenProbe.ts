/**
 * **경기 상세에 10명이 다 보이나** (2026-09-04 · ★읽기 전용★).
 *
 * 사장님 요구: ★«경기 상세에 10명 다 보여야 한다»★
 * ★「라인업이 있다」와 「10명이 다 있다」는 다르다.★ 3명만 있어도 「있다」다.
 * ★그래서 인원수로 센다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<{ n: number; games: bigint }[]>`
    SELECT s.n::int AS n, count(*) AS games
      FROM (
        SELECT m."id", (SELECT count(*) FROM "MatchPlayerStat" p WHERE p."matchId" = m."id") AS n
          FROM "Match" m
          JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      ) s
     WHERE s.n > 0
     GROUP BY 1 ORDER BY 1
  `
  const total = rows.reduce((a, r) => a + Number(r.games), 0)
  console.info('══ ★IPL 경기 · 라인업 인원수별★ ══')
  console.info('')
  for (const r of rows) {
    const g = Number(r.games)
    const mark = r.n === 10 ? '  ★10명 — 온전하다★' : r.n > 10 ? '  ⚠ ★10명을 넘는다★' : ''
    console.info(`  ${String(r.n).padStart(3)}명   ${String(g).padStart(6)}경기  (${((100 * g) / total).toFixed(1)}%)${mark}`)
  }
  const ten = Number(rows.find((r) => r.n === 10)?.games ?? 0)
  const over = rows.filter((r) => r.n > 10).reduce((a, r) => a + Number(r.games), 0)
  console.info('')
  console.info(`  라인업이 붙은 경기 ★${total.toLocaleString()}★건 중 ★10명 정확히 ${ten.toLocaleString()}건 (${((100 * ten) / total).toFixed(1)}%)★`)
  if (over > 0) {
    console.info(`  ⚠ ★10명을 넘는 경기 ${over.toLocaleString()}건★ — ★같은 경기에 두 번 넣었을 수 있다★`)
  }
  console.info('')
  console.info('  ★읽는 법★ — 10 이 아닌 칸은 ★한쪽 클랜 배틀로그만 받은 것★ 이다.')
  console.info('  병영수첩 배틀로그는 ★클랜 하나당 하나★ 라, ★적·청 둘 다 받아야 10명★ 이 된다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
