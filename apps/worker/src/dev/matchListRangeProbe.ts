/**
 * **병영수첩 매치목록이 과거를 얼마나 주나** (2026-09-04 · 읽기 전용).
 *
 * ★사장님: «3월부터 9월초까지 경기만 잘 채워놔»★
 * 그런데 ★매치목록 원문이 8/28 부터뿐★ 이다. 그게
 *   ★「병영수첩이 최근 것만 준다」★ 인지 ★「우리가 그만큼만 받았다」★ 인지 갈라야 한다.
 * ★목록이 안 오면 그 기간 경기 자체가 안 생긴다.★
 */
import { prisma } from '@sacloud/db'
async function main() {
  const r = await prisma.$queryRaw<{ yymmdd: string; n: bigint }[]>`
    SELECT substring("matchKey" from 1 for 4) AS yymmdd, count(DISTINCT "matchKey") AS n
      FROM "BarracksClanMatchRaw" WHERE "status" = 'ok'
     GROUP BY 1 ORDER BY 1
  `
  console.info('매치목록 원문의 경기 키 (YYMM · 병영수첩 키 규칙)\n')
  const max = Math.max(...r.map(x => Number(x.n)), 1)
  for (const x of r) {
    const v = Number(x.n)
    console.info(`  ${x.yymmdd}  ${v.toLocaleString().padStart(6)}건  ${'#'.repeat(Math.round(v/max*36))}`)
  }
  const b = await prisma.$queryRaw<{ yymmdd: string; n: bigint }[]>`
    SELECT substring("matchKey" from 1 for 4) AS yymmdd, count(DISTINCT "matchKey") AS n
      FROM "BarracksBattleLogRaw" WHERE "status" = 'ok'
     GROUP BY 1 ORDER BY 1
  `
  console.info('\n배틀로그 원문의 경기 키 (YYMM)\n')
  const bmax = Math.max(...b.map(x => Number(x.n)), 1)
  for (const x of b) {
    const v = Number(x.n)
    console.info(`  ${x.yymmdd}  ${v.toLocaleString().padStart(6)}건  ${'#'.repeat(Math.round(v/bmax*36))}`)
  }
  console.info('\n★읽는 법★ — 매치목록이 최근 몇 달치뿐이면 ★그 앞은 목록으로 못 받는다.★')
  console.info('           배틀로그에 더 옛날 것이 있으면 ★그건 다른 경로로 들어온 것★ 이다')
}
main().catch(console.error).finally(() => prisma.$disconnect())
