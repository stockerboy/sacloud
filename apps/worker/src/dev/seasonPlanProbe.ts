/**
 * **O-046 — 시즌 경계로 나누면 어디에 몇 건이 떨어지나** (2026-09-03 · 읽기 전용).
 *
 * 확정된 경계
 * ```
 * Beta    2026-03-05(목) ~ 2026-07-01
 * 시즌0   2026-07-02(목) ~ 현재
 * 시즌1   2026-10-01(목) 예정
 * 2025-12 ★버린다★
 * ```
 * ⚠ 확인 칸 1번은 「미분류 387,484 → ★0★」이다. 그런데 기록은 ★2024-05★ 부터 있다.
 *   ★Beta 앞의 경기를 어디에 넣을지가 지시서에 없다.★ 그 크기를 먼저 잰다.
 */
import { prisma } from '@sacloud/db'

const BETA_START = new Date('2026-03-05T00:00:00+09:00')
const S0_START = new Date('2026-07-02T00:00:00+09:00')
const S1_START = new Date('2026-10-01T00:00:00+09:00')

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<{ bucket: string; league: string; n: bigint }[]>`
    SELECT CASE
             WHEN m."startAt" <  ${BETA_START} THEN '① Beta 이전 (2024-05~2026-03-04)'
             WHEN m."startAt" <  ${S0_START}   THEN '② Beta (03-05~07-01)'
             WHEN m."startAt" <  ${S1_START}   THEN '③ 시즌0 (07-02~)'
             ELSE '④ 시즌1 이후'
           END AS bucket,
           l."slug" AS league, count(*) AS n
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1, 2 ORDER BY 1, 2
  `
  const byBucket = new Map<string, number>()
  console.info('구간별 · 리그별 경기 수\n')
  for (const r of rows) {
    console.info(`  ${r.bucket.padEnd(34)} ${r.league.padEnd(9)} ${Number(r.n).toLocaleString().padStart(9)}`)
    byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + Number(r.n))
  }
  console.info('\n구간 합계')
  let total = 0
  for (const [k, v] of byBucket) { console.info(`  ${k.padEnd(34)} ${v.toLocaleString().padStart(9)}`); total += v }
  console.info(`  ${'합계'.padEnd(34)} ${total.toLocaleString().padStart(9)}`)

  const beta = byBucket.get('② Beta (03-05~07-01)') ?? 0
  const pre = byBucket.get('① Beta 이전 (2024-05~2026-03-04)') ?? 0
  console.info(
    `\n  ★Beta 앞에 ${pre.toLocaleString()}건 (${((pre / total) * 100).toFixed(1)}%) 이 있다★ — 지시서에 갈 곳이 없다`,
  )
  console.info(`  ★Beta 창에는 ${beta.toLocaleString()}건★`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
