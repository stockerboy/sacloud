/**
 * **병영수첩이 얼마나 오래된 배틀로그까지 주나** (2026-09-04 · ★읽기 전용★).
 *
 * 3~6월을 받다 보니 ★6월 하순은 오는데 6월 초는 `406`★ 이 난다.
 * ★가설 — 병영수첩이 최근 몇 달치만 보관한다.★
 * 그렇다면 ★3~5월은 아무리 돌려도 못 받는다.★ ★사장님께 알려야 할 사실이다.★
 *
 * ★받은 것의 날짜 분포★ 로 경계를 본다. 요청을 한 건도 보내지 않는다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<{ d: string; n: bigint }[]>`
    SELECT substr("matchKey", 1, 6) AS d, count(*) AS n
      FROM "BarracksBattleLogRaw"
     WHERE "matchKey" ~ '^[0-9]{12}' AND substr("matchKey", 1, 4) IN ('2603','2604','2605','2606','2607')
     GROUP BY 1 ORDER BY 1
  `
  console.info('══ ★받아 놓은 배틀로그 — 날짜별★ (3~7월) ══')
  console.info('')
  let first: string | null = null
  for (const r of rows) {
    const n = Number(r.n)
    if (first === null && n > 0) first = r.d
    const bar = '█'.repeat(Math.min(40, Math.ceil(n / 5)))
    console.info(`  ${r.d}  ${String(n).padStart(5)}  ${bar}`)
  }
  console.info('')
  console.info(`  ★제일 오래된 것 — ${first ?? '(없다)'}★`)
  console.info('')
  console.info('  ★읽는 법★ — 어느 날짜 앞으로 뚝 끊기면 ★병영수첩이 거기까지만 준다★ 는 뜻이다.')
  console.info('  ★그 앞은 아무리 돌려도 못 받는다.★ 「안 받은 것」이 아니라 「없는 것」이다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
