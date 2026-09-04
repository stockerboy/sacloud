/**
 * **설치행동 행과 폭발종료 행이 왜 안 겹치나** (2026-09-04 · ★읽기 전용★).
 * 경기 단위로 갈리는지, 시기로 갈리는지 본다. 안 밝히면 설치를 두 번 다르게 센다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`

async function main(): Promise<void> {
  console.info('══ 1 · ★경기 단위로 어느 행을 갖고 있나★ ══\n')
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH m AS (
      SELECT r."matchKey" AS k,
             bool_or(e->>'weapon' = 'c4-install')        AS act,
             bool_or(e->>'target_weapon' = 'c4-install') AS fin,
             count(DISTINCT r."subject")                 AS subs
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} GROUP BY 1
    )
    SELECT CASE WHEN act AND fin THEN '둘 다 있는 경기'
                WHEN act THEN '★설치행동만 있는 경기★'
                WHEN fin THEN '★폭발종료만 있는 경기★'
                ELSE '폭탄 없는 경기' END AS label, count(*) AS n
      FROM m GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of a) console.info(`  ${x.label.padEnd(26)} ${Number(x.n).toLocaleString()}`)

  console.info('\n══ 2 · ★시기별★ (matchKey 앞 4자리 = YYMM) ══\n')
  const b = await prisma.$queryRawUnsafe<{ ym: string; matches: bigint; act: bigint; fin: bigint }[]>(`
    WITH m AS (
      SELECT r."matchKey" AS k, left(r."matchKey",4) AS ym,
             bool_or(e->>'weapon' = 'c4-install')        AS act,
             bool_or(e->>'target_weapon' = 'c4-install') AS fin
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} GROUP BY 1,2
    )
    SELECT ym, count(*) AS matches, count(*) FILTER (WHERE act) AS act,
           count(*) FILTER (WHERE fin) AS fin
      FROM m GROUP BY 1 ORDER BY 1
  `)
  for (const x of b) {
    console.info(
      `  ${x.ym}  경기 ${Number(x.matches).toLocaleString().padStart(6)}` +
        `  설치행동 ${Number(x.act).toLocaleString().padStart(6)}  폭발종료 ${Number(x.fin).toLocaleString().padStart(6)}`,
    )
  }

  console.info('\n══ 3 · ★같은 경기 안에서 라운드가 갈리나★ (둘 다 있는 경기만) ══\n')
  const c = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH pr AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             bool_or(e->>'weapon' = 'c4-install')        AS act,
             bool_or(e->>'target_weapon' = 'c4-install') AS fin
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> '' GROUP BY 1,2
    ),
    good AS (SELECT k FROM pr GROUP BY 1 HAVING bool_or(act) AND bool_or(fin))
    SELECT CASE WHEN act AND fin THEN '한 라운드에 둘 다'
                WHEN act THEN '설치행동만인 라운드'
                WHEN fin THEN '폭발종료만인 라운드'
                ELSE '폭탄 없는 라운드' END AS label, count(*) AS n
      FROM pr JOIN good ON good.k = pr.k GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of c) console.info(`  ${x.label.padEnd(26)} ${Number(x.n).toLocaleString()}`)

  console.info('\n══ 4 · ★「폭발종료만」 라운드 하나를 펼친다★ ══\n')
  const d = await prisma.$queryRawUnsafe<{ k: string; rnd: number; evs: unknown }[]>(`
    WITH pr AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             bool_or(e->>'weapon' = 'c4-install')        AS act,
             bool_or(e->>'target_weapon' = 'c4-install') AS fin
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> '' GROUP BY 1,2
    ),
    pick AS (SELECT k, rnd FROM pr WHERE fin AND NOT act LIMIT 1)
    SELECT pick.k, pick.rnd,
           jsonb_agg(jsonb_build_object('t', e->>'event_time', 'typ', e->>'event_type',
             'txt', e->>'event_text', 'w', e->>'weapon', 'tw', e->>'target_weapon',
             'team', e->>'team_no', 'nick', e->>'user_nick', 'tteam', e->>'target_team_no',
             'tnick', e->>'target_user_nick', 'win', e->>'win_team_no',
             'flag', e->>'win_flag') ORDER BY e->>'event_time') AS evs
      FROM pick JOIN "BarracksBattleLogRaw" r ON r."matchKey" = pick.k AND ${OK},
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE (e->>'round')::int = pick.rnd GROUP BY 1,2
  `)
  for (const o of d) {
    console.info(`  경기 ${o.k} · 라운드 ${o.rnd}`)
    for (const e of o.evs as Record<string, unknown>[]) console.info(`     ${JSON.stringify(e)}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
