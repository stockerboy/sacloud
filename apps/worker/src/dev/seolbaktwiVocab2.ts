/**
 * **설박튀 — 낱말 확정** (2026-09-04 · ★읽기 전용★).
 *
 * `weapon='c4-install'`(설치 행동) 라운드가 22,350 인데
 * `event_text='C4 설치'` 라운드는 24,675 다. ★두 집합이 겹치는지부터 본다.★
 * 안 겹치면 「설치」를 두 번 다르게 세고 있는 것이다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`
const PR = `
  WITH pr AS (
    SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
           bool_or(e->>'weapon' = 'c4-install')            AS actInstall,
           bool_or(e->>'weapon' = 'c4-dismantle')          AS actDismantle,
           bool_or(e->>'target_weapon' = 'c4-install'
                   AND COALESCE(e->>'win_team_no','') <> '') AS endInstall,
           bool_or(e->>'target_weapon' = 'c4-dismantle'
                   AND COALESCE(e->>'win_team_no','') <> '') AS endDismantle,
           bool_or(COALESCE(e->>'win_team_no','') <> ''
                   AND COALESCE(e->>'target_weapon','') = '') AS endPlain
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} AND COALESCE(e->>'round','') <> ''
     GROUP BY 1,2
  )`

async function main(): Promise<void> {
  console.info('══ 1 · ★설치 행동 × 폭발 종료 겹침★ ══\n')
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${PR}
    SELECT CASE
      WHEN actInstall AND endInstall  THEN 'A 설치행동 + 폭발종료'
      WHEN actInstall AND endDismantle THEN 'B 설치행동 + 해체종료'
      WHEN actInstall AND endPlain     THEN 'C 설치행동 + 그냥종료'
      WHEN actInstall                  THEN 'D ★설치행동만 · 종료칸 없음★'
      WHEN endInstall                  THEN 'E ★폭발종료만 · 설치행동 없음★'
      WHEN endDismantle                THEN 'F ★해체종료만 · 설치행동 없음★'
      WHEN endPlain                    THEN 'G 그냥종료만'
      ELSE                                  'H 폭탄 흔적 없음' END AS label,
      count(*) AS n FROM pr GROUP BY 1 ORDER BY 1
  `)
  for (const x of a) console.info(`  ${x.label.padEnd(34)} ${Number(x.n).toLocaleString().padStart(9)}`)

  console.info('\n══ 2 · ★endpoint / subjectKind 별 낱말★ ══\n')
  const b = await prisma.$queryRawUnsafe<
    { ep: string; sk: string; rows: bigint; act: bigint; end: bigint }[]
  >(`
    SELECT r."endpoint" AS ep, r."subjectKind" AS sk, count(DISTINCT r."id") AS rows,
           count(*) FILTER (WHERE e->>'weapon' = 'c4-install')        AS act,
           count(*) FILTER (WHERE e->>'target_weapon' = 'c4-install') AS "end"
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} GROUP BY 1,2 ORDER BY 3 DESC
  `)
  for (const x of b) {
    console.info(
      `  ${x.ep.padEnd(26)} ${x.sk.padEnd(6)} 행 ${Number(x.rows).toLocaleString().padStart(7)}` +
        `  설치행동 ${Number(x.act).toLocaleString().padStart(7)}  폭발종료 ${Number(x.end).toLocaleString().padStart(7)}`,
    )
  }

  console.info('\n══ 3 · ★「설치행동만·종료칸 없음」 라운드 하나★ (D 유형) ══\n')
  const c = await prisma.$queryRawUnsafe<{ k: string; rnd: number; evs: unknown }[]>(`${PR},
    pick AS (SELECT k, rnd FROM pr WHERE actInstall AND NOT endInstall
                                      AND NOT endDismantle AND NOT endPlain LIMIT 1)
    SELECT pick.k, pick.rnd,
           jsonb_agg(jsonb_build_object('t', e->>'event_time', 'typ', e->>'event_type',
             'txt', e->>'event_text', 'w', e->>'weapon', 'tw', e->>'target_weapon',
             'team', e->>'team_no', 'usn', e->>'str_usn', 'nick', e->>'user_nick',
             'tteam', e->>'target_team_no', 'tusn', e->>'target_str_usn',
             'win', e->>'win_team_no', 'flag', e->>'win_flag') ORDER BY e->>'event_time') AS evs
      FROM pick JOIN "BarracksBattleLogRaw" r ON r."matchKey" = pick.k AND ${OK},
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE (e->>'round')::int = pick.rnd GROUP BY 1,2
  `)
  for (const o of c) {
    console.info(`  경기 ${o.k} · 라운드 ${o.rnd}`)
    for (const e of o.evs as Record<string, unknown>[]) console.info(`     ${JSON.stringify(e)}`)
  }

  console.info('\n══ 4 · ★그 경기의 마지막 라운드는 몇 번인가★ (D 유형이 마지막에 몰리나) ══\n')
  const d = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${PR},
    t AS (SELECT pr.*, max(rnd) OVER (PARTITION BY k) AS lastRnd FROM pr)
    SELECT CASE WHEN rnd = lastRnd THEN '마지막 라운드' ELSE '중간 라운드' END AS label,
           count(*) AS n
      FROM t WHERE actInstall AND NOT endInstall AND NOT endDismantle AND NOT endPlain
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of d) console.info(`  ${x.label.padEnd(20)} ${Number(x.n).toLocaleString()}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
