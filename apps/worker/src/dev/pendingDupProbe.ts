/**
 * **같은 경기를 두 번 부르고 있나** (2026-09-04 · ★읽기 전용★).
 *
 * 로그에서 ★같은 경기키가 두 번 406★ 인 것이 28건 나왔다.
 * `pendingPairs` 는 ★(경기, 클랜번호)★ 쌍을 내보내는데, ★같은 경기에 클랜번호가 둘이면 둘 다 나온다.★
 *
 * ⚠ ★그런데 배틀로그 하나에 열 명이 다 들어 있다★ (D-273 에서 확인).
 *   ★그러면 경기당 한 번이면 충분하다.★ 두 번 부르는 만큼이 ★그대로 낭비★ 다.
 *
 * ★얼마나 되는지 센다.★ 요청을 한 건도 보내지 않는다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<{ pairs: bigint; matches: bigint }[]>`
    WITH p AS (
      SELECT DISTINCT c."matchKey" AS k, c."payload"->>'clan_no' AS n
        FROM "BarracksClanMatchRaw" c
       WHERE c."status" = 'ok' AND c."payload"->>'clan_no' IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "BarracksBattleLogRaw" b
            WHERE b."matchKey" = c."matchKey" AND b."status" = 'ok')
    )
    SELECT count(*) AS pairs, count(DISTINCT k) AS matches FROM p
  `
  const r = rows[0]!
  const pairs = Number(r.pairs)
  const matches = Number(r.matches)
  console.info('══ ★목록에서 나온 「받을 것」 — 경기당 몇 번 부르나★ ══')
  console.info('')
  console.info(`  내보내는 쌍 (경기 · 클랜번호)   ★${pairs.toLocaleString()}★`)
  console.info(`  서로 다른 경기                 ★${matches.toLocaleString()}★`)
  console.info(
    `  ★한 경기를 평균 ${(pairs / Math.max(1, matches)).toFixed(2)}번 부른다★` +
      ` — ★남는 ${(pairs - matches).toLocaleString()}번이 낭비다★`,
  )
  console.info('')

  const dist = await prisma.$queryRaw<{ n: number; games: bigint }[]>`
    WITH p AS (
      SELECT DISTINCT c."matchKey" AS k, c."payload"->>'clan_no' AS n
        FROM "BarracksClanMatchRaw" c
       WHERE c."status" = 'ok' AND c."payload"->>'clan_no' IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "BarracksBattleLogRaw" b
            WHERE b."matchKey" = c."matchKey" AND b."status" = 'ok')
    )
    SELECT cnt::int AS n, count(*) AS games FROM (
      SELECT k, count(*) AS cnt FROM p GROUP BY k
    ) t GROUP BY 1 ORDER BY 1
  `
  console.info('  한 경기에 클랜번호가 몇 개인가')
  for (const d of dist) {
    console.info(`    ${d.n}개   ${Number(d.games).toLocaleString()}경기`)
  }
  console.info('')
  console.info('  ★읽는 법★ — ★배틀로그 하나에 열 명이 다 들어 있으므로 경기당 한 번이면 된다★ (D-273).')
  console.info('  ★2개짜리가 많으면 그만큼 요청이 두 배다.★ 줄이면 밤샘이 그만큼 빨라진다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
