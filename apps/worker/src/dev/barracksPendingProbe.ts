/**
 * **받을 것이 왜 0건인가** (O-051 · 2026-09-03 · ★읽기 전용★).
 *
 * `barracks-collect --dry-run` 이 ★0건★ 을 냈다. 원문이 20만 행인데 그럴 리가 없다.
 * ★질의가 틀렸는지 · 진짜 다 받았는지★ 를 가른다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const counts = await prisma.$queryRaw<
    { clanMatchRows: bigint; clanMatchKeys: bigint; logRows: bigint; logKeys: bigint }[]
  >`
    SELECT (SELECT count(*) FROM "BarracksClanMatchRaw")                          AS "clanMatchRows",
           (SELECT count(DISTINCT "matchKey") FROM "BarracksClanMatchRaw")        AS "clanMatchKeys",
           (SELECT count(*) FROM "BarracksBattleLogRaw")                          AS "logRows",
           (SELECT count(DISTINCT "matchKey") FROM "BarracksBattleLogRaw")        AS "logKeys"
  `
  const c = counts[0]!
  console.info('══ 표 크기 ══\n')
  console.info(`  BarracksClanMatchRaw  ${Number(c.clanMatchRows).toLocaleString()}행 · 고유 경기 ${Number(c.clanMatchKeys).toLocaleString()}`)
  console.info(`  BarracksBattleLogRaw  ${Number(c.logRows).toLocaleString()}행 · 고유 경기 ${Number(c.logKeys).toLocaleString()}`)

  console.info('\n══ status 값 ══\n')
  for (const t of ['BarracksClanMatchRaw', 'BarracksBattleLogRaw'] as const) {
    const rows =
      t === 'BarracksClanMatchRaw'
        ? await prisma.$queryRaw<{ status: string; n: bigint }[]>`
            SELECT "status", count(*) AS n FROM "BarracksClanMatchRaw" GROUP BY 1 ORDER BY 2 DESC`
        : await prisma.$queryRaw<{ status: string; n: bigint }[]>`
            SELECT "status", count(*) AS n FROM "BarracksBattleLogRaw" GROUP BY 1 ORDER BY 2 DESC`
    console.info(`  ${t}`)
    for (const r of rows) console.info(`    ${String(r.status).padEnd(12)} ${Number(r.n).toLocaleString()}`)
  }

  console.info('\n══ ★payload 에 clan_no 가 있나★ ══\n')
  const keys = await prisma.$queryRaw<{ k: string; n: bigint }[]>`
    SELECT k, count(*) AS n
      FROM "BarracksClanMatchRaw" c, LATERAL jsonb_object_keys(c."payload") k
     GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  `
  console.info('  payload 의 칸들: ' + keys.map((x) => x.k).join(' · '))

  const hasNo = await prisma.$queryRaw<{ withNo: bigint; total: bigint }[]>`
    SELECT count(*) FILTER (WHERE "payload"->>'clan_no' IS NOT NULL) AS "withNo",
           count(*)                                                  AS total
      FROM "BarracksClanMatchRaw"
  `
  const h = hasNo[0]!
  console.info(
    `  clan_no 가 있는 행 ★${Number(h.withNo).toLocaleString()}★ / ${Number(h.total).toLocaleString()}`,
  )

  console.info('\n══ ★차집합★ — 아직 배틀로그가 없는 경기 ══\n')
  const pend = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT c."matchKey") AS n
      FROM "BarracksClanMatchRaw" c
     WHERE NOT EXISTS (
       SELECT 1 FROM "BarracksBattleLogRaw" b WHERE b."matchKey" = c."matchKey"
     )
  `
  console.info(`  ★${Number(pend[0]!.n).toLocaleString()}건★  (status 조건 없이)`)

  const pendOk = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT c."matchKey") AS n
      FROM "BarracksClanMatchRaw" c
     WHERE c."status" = 'ok'
       AND c."payload"->>'clan_no' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "BarracksBattleLogRaw" b
          WHERE b."matchKey" = c."matchKey" AND b."status" = 'ok'
       )
  `
  console.info(`  ★${Number(pendOk[0]!.n).toLocaleString()}건★  (CLI 가 쓰는 조건 그대로)`)

  console.info('\n══ 표본 한 줄 ══\n')
  const one = await prisma.$queryRaw<{ matchKey: string; status: string; payload: unknown }[]>`
    SELECT "matchKey", "status", "payload" FROM "BarracksClanMatchRaw" LIMIT 1
  `
  if (one[0]) {
    console.info(`  matchKey=${one[0].matchKey} · status=${one[0].status}`)
    console.info(`  payload=${JSON.stringify(one[0].payload).slice(0, 400)}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
