/**
 * **라운드 승자를 win_flag 로 읽을 수 있는가** (2026-09-04 · ★읽기 전용★).
 *
 * `win_team_no` 는 ★폭탄으로 끝난 라운드에만★ 붙는다 (전체 라운드의 14%).
 * 그런데 모든 이벤트에 `win_flag`("win"|"lose") 가 있다. 표본에서 보면
 * ★그 이벤트를 낸 사람의 팀(team_no)이 그 라운드를 이겼는지★ 로 보인다.
 * ★맞는지 win_team_no 와 대조해서 확인한다.★ 틀리면 안 쓴다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`

async function main(): Promise<void> {
  console.info('══ 0 · ★설치행동 × 종료칸 겹침★ (앞 탐침에서 잘린 표) ══\n')
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH pr AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             bool_or(e->>'weapon' = 'c4-install')   AS ai,
             bool_or(e->>'target_weapon' = 'c4-install'   AND COALESCE(e->>'win_team_no','') <> '') AS ei,
             bool_or(e->>'target_weapon' = 'c4-dismantle' AND COALESCE(e->>'win_team_no','') <> '') AS ed,
             bool_or(COALESCE(e->>'win_team_no','') <> '' AND COALESCE(e->>'target_weapon','') = '') AS ep
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> '' GROUP BY 1,2
    )
    SELECT CASE WHEN ai AND ei THEN 'A 설치행동 + 폭발종료'
                WHEN ai AND ed THEN 'B 설치행동 + 해체종료'
                WHEN ai AND ep THEN 'C 설치행동 + 그냥종료'
                WHEN ai        THEN 'D ★설치행동만 · 종료칸 없음★'
                WHEN ei        THEN 'E ★폭발종료만 · 설치행동 없음★'
                WHEN ed        THEN 'F ★해체종료만 · 설치행동 없음★'
                WHEN ep        THEN 'G 그냥종료만'
                ELSE                'H 폭탄 흔적 없음' END AS label,
           count(*) AS n FROM pr GROUP BY 1 ORDER BY 1
  `)
  for (const x of a) console.info(`  ${x.label.padEnd(34)} ${Number(x.n).toLocaleString().padStart(9)}`)

  console.info('\n══ 1 · ★win_flag 로 뽑은 승자 vs win_team_no★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH ev AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             NULLIF(e->>'team_no','') AS team, e->>'win_flag' AS flag,
             NULLIF(e->>'win_team_no','') AS wtn
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE ${OK} AND COALESCE(e->>'round','') <> ''
    ),
    pr AS (
      SELECT k, rnd,
             count(DISTINCT team) FILTER (WHERE flag = 'win'  AND team IS NOT NULL) AS nwin,
             max(team)            FILTER (WHERE flag = 'win'  AND team IS NOT NULL) AS byflag,
             count(DISTINCT team) FILTER (WHERE flag = 'lose' AND team IS NOT NULL) AS nlose,
             max(wtn) AS wtn
        FROM ev GROUP BY 1,2
    )
    SELECT '전체 라운드' AS label, count(*) AS n FROM pr
    UNION ALL SELECT 'win_flag 로 승자 하나로 정해짐', count(*) FROM pr WHERE nwin = 1
    UNION ALL SELECT '★win_flag 로 두 팀 다 win★ (모순)', count(*) FROM pr WHERE nwin > 1
    UNION ALL SELECT 'win_flag 로 아무도 win 아님', count(*) FROM pr WHERE nwin = 0
    UNION ALL SELECT 'win_team_no 도 있는 라운드', count(*) FROM pr WHERE wtn IS NOT NULL
    UNION ALL SELECT '★둘 다 있고 일치★', count(*) FROM pr WHERE wtn IS NOT NULL AND nwin = 1 AND byflag = wtn
    UNION ALL SELECT '★둘 다 있고 불일치★', count(*) FROM pr WHERE wtn IS NOT NULL AND nwin = 1 AND byflag <> wtn
  `)
  for (const x of b) console.info(`  ${x.label.padEnd(36)} ${Number(x.n).toLocaleString().padStart(9)}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
