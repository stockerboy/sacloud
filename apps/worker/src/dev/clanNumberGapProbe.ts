/**
 * **못 이은 3,043건은 버려지나, 이을 수 있나** (O-051 ⑥ · 2026-09-03 · ★읽기 전용★).
 *
 * `battlelog-lineup` 이 ★clan_unmapped 3,043건★ 을 건너뛴다.
 * 그 자리의 코드는 ★`resolveClanNo(clanNo)` 가 null 이면 건너뛴다★ 이다 —
 * 즉 ★「클랜번호 ↔ 우리 클랜」 표에 그 번호가 없다★ 는 뜻이지
 * ★「원문이 없다」가 아니다.★
 *
 * ★그 둘은 사장님께 드릴 말이 다르다★
 * ```
 * 버려지는 것    → «IPL 기록 일부가 안 들어옵니다» 를 알려야 한다
 * 이을 수 있는 것 → 표만 채우면 된다. 알릴 일이 아니다
 * ```
 * ★그래서 센다.★
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  console.info('══ 1 · ★클랜번호 표는 몇 줄인가★ ══\n')
  const tbl = await prisma.$queryRaw<{ n: bigint; withClan: bigint }[]>`
    SELECT count(*) AS n, count(DISTINCT "clanId") AS "withClan"
      FROM "BarracksClanNumber"
  `
  const t = tbl[0]!
  console.info(
    `  BarracksClanNumber ★${Number(t.n).toLocaleString()}줄★ · 우리 클랜에 이어진 것 ${Number(t.withClan).toLocaleString()}`,
  )

  console.info('\n══ 2 · ★배틀로그에 나오는 클랜번호는 몇 개인가★ ══\n')
  const seen = await prisma.$queryRaw<{ nos: bigint; mapped: bigint }[]>`
    WITH nums AS (
      SELECT DISTINCT jsonb_array_elements(b."payload"->'teamList')->>'clan_no' AS clan_no
        FROM "BarracksBattleLogRaw" b
       WHERE b."status" = 'ok'
         AND jsonb_typeof(b."payload"->'teamList') = 'array'
    )
    SELECT count(*) FILTER (WHERE clan_no IS NOT NULL)                          AS nos,
           count(*) FILTER (WHERE clan_no IS NOT NULL AND EXISTS (
             SELECT 1 FROM "BarracksClanNumber" n
              WHERE n."clanNo" = nums.clan_no
           ))                                                                   AS mapped
      FROM nums
  `
  const s = seen[0]!
  const nos = Number(s.nos)
  const mapped = Number(s.mapped)
  console.info(`  배틀로그에 나오는 클랜번호 ★${nos.toLocaleString()}개★`)
  console.info(`  그중 우리 클랜에 이어진 것 ★${mapped.toLocaleString()}★ ${pc(mapped, nos)}`)
  console.info(`  ★못 이은 번호 ${(nos - mapped).toLocaleString()}개★`)

  console.info('\n══ 3 · ★못 이은 번호가 어느 클랜인가★ (원문의 이름으로 본다) ══\n')
  const names = await prisma.$queryRaw<{ clanNo: string; clanName: string; n: bigint }[]>`
    WITH tl AS (
      SELECT jsonb_array_elements(b."payload"->'teamList') AS t
        FROM "BarracksBattleLogRaw" b
       WHERE b."status" = 'ok' AND jsonb_typeof(b."payload"->'teamList') = 'array'
    )
    SELECT t->>'clan_no' AS "clanNo", t->>'clan_name' AS "clanName", count(*) AS n
      FROM tl
     WHERE t->>'clan_no' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "BarracksClanNumber" n
          WHERE n."clanNo" = t->>'clan_no'
       )
     GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12
  `
  if (names.length === 0) console.info('  ★없다★')
  for (const r of names) {
    console.info(
      `  ${String(r.clanNo).padEnd(14)} ${String(r.clanName ?? '(이름없음)').padEnd(20)} ${Number(r.n).toLocaleString()}회`,
    )
  }

  console.info('\n══ 4 · ★그 이름이 우리 클랜 표에 있나★ ══\n')
  const matchable = await prisma.$queryRaw<{ total: bigint; known: bigint }[]>`
    WITH tl AS (
      SELECT DISTINCT t->>'clan_no' AS clan_no, t->>'clan_name' AS clan_name
        FROM (
          SELECT jsonb_array_elements(b."payload"->'teamList') AS t
            FROM "BarracksBattleLogRaw" b
           WHERE b."status" = 'ok' AND jsonb_typeof(b."payload"->'teamList') = 'array'
        ) x
       WHERE t->>'clan_no' IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "BarracksClanNumber" n
            WHERE n."clanNo" = t->>'clan_no'
         )
    )
    SELECT count(*) AS total,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Clan" c WHERE c."name" = tl.clan_name
           )) AS known
      FROM tl
  `
  const m = matchable[0]!
  console.info(
    `  못 이은 번호 ${Number(m.total).toLocaleString()}개 중` +
      ` ★이름이 우리 클랜 표에 있는 것 ${Number(m.known).toLocaleString()}개★` +
      ` ${pc(Number(m.known), Number(m.total))}`,
  )
  console.info(
    '\n★읽는 법★ — 이름이 우리 표에 있으면 ★이을 수 있다★ (번호만 채우면 된다).\n' +
      '           없으면 ★그 클랜이 우리 리그에 없는 것★ 이라 원래 안 들어오는 게 맞다',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
