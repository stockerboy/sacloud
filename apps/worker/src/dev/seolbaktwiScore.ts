/**
 * ★배틀로그가 라운드를 다 주는가★ + ★경기 목록에 진짜 점수가 있는가★
 * (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * 「어중간하게 끝난 경기」를 세려면 ★정규 종료 점수★ 를 알아야 한다.
 * 그런데 배틀로그는 라운드를 다 안 줄 수 있다. 그러면 「어중간」은 로그 결손이지 설박튀가 아니다.
 * `BarracksClanMatchRaw`(GetClanMatchList) 에 라운드 스코어가 온다고 돼 있다 — 그걸 본다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`

async function main(): Promise<void> {
  console.info('══ 1 · ★경기당 라운드 수 분포★ (배틀로그) ══\n')
  const a = await prisma.$queryRawUnsafe<{ rounds: number; n: bigint }[]>(`
    WITH m AS (
      SELECT r."matchKey" AS k, count(DISTINCT (e->>'round')::int) AS rounds
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> '' GROUP BY 1
    )
    SELECT rounds, count(*) AS n FROM m GROUP BY 1 ORDER BY 1
  `)
  for (const x of a) console.info(`  ${String(x.rounds).padStart(3)}라운드  ${Number(x.n).toLocaleString().padStart(6)}건`)

  console.info('\n══ 2 · ★teamList 안에 무엇이 있나★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ k: string; n: bigint }[]>(`
    SELECT kk AS k, count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'teamList') t,
           LATERAL jsonb_object_keys(t) kk
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'teamList') = 'array'
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of b) console.info(`  ${x.k.padEnd(24)} ${Number(x.n).toLocaleString()}`)
  const b2 = await prisma.$queryRawUnsafe<{ t: unknown }[]>(`
    SELECT t FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'teamList') t
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'teamList') = 'array' LIMIT 3
  `)
  for (const x of b2) console.info(`    ${JSON.stringify(x.t)}`)

  console.info('\n══ 3 · ★BarracksClanMatchRaw payload 칸★ ══\n')
  const c = await prisma.$queryRawUnsafe<{ k: string; n: bigint }[]>(`
    SELECT kk AS k, count(*) AS n
      FROM "BarracksClanMatchRaw" r, LATERAL jsonb_object_keys(r."payload") kk
     WHERE r."status" = 'ok' GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of c) console.info(`  ${x.k.padEnd(24)} ${Number(x.n).toLocaleString()}`)
  const c2 = await prisma.$queryRawUnsafe<{ p: unknown }[]>(`
    SELECT r."payload" AS p FROM "BarracksClanMatchRaw" r WHERE r."status" = 'ok' LIMIT 2
  `)
  for (const x of c2) console.info(`    ${JSON.stringify(x.p)}`)

  console.info('\n══ 4 · ★목록 표의 크기★ ══\n')
  const d = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    SELECT '행' AS label, count(*) AS n FROM "BarracksClanMatchRaw" WHERE "status"='ok'
    UNION ALL SELECT '경기(고유)', count(DISTINCT "matchKey") FROM "BarracksClanMatchRaw" WHERE "status"='ok'
    UNION ALL SELECT '조회 클랜 수', count(DISTINCT "subject") FROM "BarracksClanMatchRaw" WHERE "status"='ok'
    UNION ALL SELECT '★양쪽 클랜이 다 준 경기★', count(*) FROM (
      SELECT "matchKey" FROM "BarracksClanMatchRaw" WHERE "status"='ok'
       GROUP BY 1 HAVING count(DISTINCT "subject") >= 2) z
  `)
  for (const x of d) console.info(`  ${x.label.padEnd(24)} ${Number(x.n).toLocaleString()}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
