/**
 * **설박튀 — 낱말 다시 세기** (2026-09-04 · ★읽기 전용★).
 *
 * ★event_text 는 깨진다★ — `C4 ��체` 가 실제로 있다. 한글로 세면 놓친다.
 * ASCII 칸이 따로 있다 —
 * ```
 * 설치  weapon = 'c4-install'   (event_type='bomb', event_category='mission')
 * 해체  target_weapon = 'c4-dismantle'
 * ```
 * ★그리고 win_team_no 는 아무 라운드에나 있지 않다.★ 어디에 붙는지 여기서 밝힌다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`

async function main(): Promise<void> {
  console.info('══ 1 · ★weapon / target_weapon 값★ ══\n')
  const w = await prisma.$queryRawUnsafe<{ col: string; v: string | null; n: bigint }[]>(`
    SELECT 'weapon' AS col, e->>'weapon' AS v, count(*) AS n
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} GROUP BY 1,2
    UNION ALL
    SELECT 'target_weapon', e->>'target_weapon', count(*)
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} GROUP BY 1,2
     ORDER BY 1, 3 DESC
  `)
  for (const x of w) console.info(`  ${x.col.padEnd(14)} ${(x.v === '' ? '(빈칸)' : (x.v ?? 'null')).padEnd(16)} ${Number(x.n).toLocaleString()}`)

  console.info('\n══ 2 · ★win_team_no 가 붙는 이벤트★ ══\n')
  const win = await prisma.$queryRawUnsafe<{ typ: string; tw: string; n: bigint }[]>(`
    SELECT COALESCE(NULLIF(e->>'event_type',''),'(빈칸)') AS typ,
           COALESCE(NULLIF(e->>'target_weapon',''),'(빈칸)') AS tw,
           count(*) AS n
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} AND COALESCE(e->>'win_team_no','') <> ''
     GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15
  `)
  for (const x of win) console.info(`  type=${x.typ.padEnd(10)} target_weapon=${x.tw.padEnd(16)} ${Number(x.n).toLocaleString()}`)

  console.info('\n══ 3 · ★ASCII 로 다시 센 라운드 분포★ ══\n')
  const r = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH pr AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             bool_or(e->>'weapon' = 'c4-install')          AS planted,
             bool_or(e->>'target_weapon' = 'c4-dismantle') AS defused,
             bool_or(e->>'event_type' = 'bomb')            AS bombtype,
             bool_or(e->>'event_text' = 'C4 설치')          AS txtplant,
             bool_or(e->>'event_text' = 'C4 해체')          AS txtdef
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> ''
       GROUP BY 1,2
    )
    SELECT '전체 라운드' AS label, count(*) AS n FROM pr
    UNION ALL SELECT 'weapon=c4-install 있는 라운드', count(*) FROM pr WHERE planted
    UNION ALL SELECT 'event_type=bomb 있는 라운드', count(*) FROM pr WHERE bombtype
    UNION ALL SELECT 'event_text=C4 설치 있는 라운드', count(*) FROM pr WHERE txtplant
    UNION ALL SELECT '★install 인데 bomb 아님★', count(*) FROM pr WHERE planted AND NOT bombtype
    UNION ALL SELECT '★bomb 인데 install 아님★', count(*) FROM pr WHERE bombtype AND NOT planted
    UNION ALL SELECT 'target_weapon=c4-dismantle 라운드', count(*) FROM pr WHERE defused
    UNION ALL SELECT 'event_text=C4 해체 라운드', count(*) FROM pr WHERE txtdef
    UNION ALL SELECT '★dismantle 인데 텍스트 없음(깨짐)★', count(*) FROM pr WHERE defused AND NOT txtdef
    UNION ALL SELECT '★해체만 있고 설치 없음 (있으면 안 됨)★', count(*) FROM pr WHERE defused AND NOT planted
  `)
  for (const x of r) console.info(`  ${x.label.padEnd(40)} ${Number(x.n).toLocaleString().padStart(9)}`)

  console.info('\n══ 4 · ★설치 라운드가 어떻게 끝나나 (승자 칸 기준)★ ══\n')
  const e4 = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH pr AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             bool_or(e->>'weapon' = 'c4-install')          AS planted,
             bool_or(e->>'target_weapon' = 'c4-dismantle') AS defused,
             max(NULLIF(e->>'team_no','')) FILTER (WHERE e->>'weapon' = 'c4-install') AS planter,
             max(NULLIF(e->>'win_team_no','')) AS winner
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> ''
       GROUP BY 1,2
    )
    SELECT CASE WHEN NOT planted THEN 'a 설치 없음'
                WHEN defused AND winner IS NULL THEN 'b 해체됨 · 승자칸 없음'
                WHEN defused AND winner = planter THEN 'c ★해체됐는데 설치팀 승★'
                WHEN defused THEN 'd 해체됨 · 수비팀 승 (정상)'
                WHEN winner IS NULL THEN 'e ★설치·해체X·승자칸 없음★'
                WHEN winner = planter THEN 'f 설치·해체X·설치팀 승 (터짐)'
                ELSE 'g ★설치·해체X·수비팀 승★' END AS label,
           count(*) AS n FROM pr GROUP BY 1 ORDER BY 1
  `)
  for (const x of e4) console.info(`  ${x.label.padEnd(34)} ${Number(x.n).toLocaleString().padStart(9)}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
