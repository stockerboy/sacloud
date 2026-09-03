/**
 * **배틀로그에 무슨 이벤트가 있나** — 낱말 목록을 먼저 본다 (2026-09-03 · 읽기 전용).
 *
 * ★「C4 폭발」이 찍히는지 먼저 봐야 한다.★ 있으면 그것으로 갈리고,
 * 없으면 라운드 승패로 ★유추★ 해야 하는데 그건 한 단계 약한 증거다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { et: string | null; ec: string | null; txt: string | null; n: bigint }[]
  >`
    SELECT e->>'event_type' AS et, e->>'event_category' AS ec, e->>'event_text' AS txt,
           count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok'
     GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 30
  `
  console.info('event_type / event_category / event_text · 건수')
  for (const r of rows) {
    console.info(
      `  ${String(r.et ?? '—').padEnd(10)} ${String(r.ec ?? '—').padEnd(10)} ${String(r.txt ?? '—').padEnd(16)} ${Number(r.n).toLocaleString()}`,
    )
  }

  console.info('\n── 배틀로그 한 건의 키 전부 ──')
  const one = await prisma.$queryRaw<{ k: string }[]>`
    SELECT DISTINCT jsonb_object_keys(e) AS k
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok' LIMIT 40
  `
  console.info('  ' + one.map((x) => x.k).join(', '))

  console.info('\n── payload 최상위 키 ──')
  const top = await prisma.$queryRaw<{ k: string }[]>`
    SELECT DISTINCT jsonb_object_keys("payload") AS k
      FROM "BarracksBattleLogRaw" WHERE "status" = 'ok' LIMIT 20
  `
  console.info('  ' + top.map((x) => x.k).join(', '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
