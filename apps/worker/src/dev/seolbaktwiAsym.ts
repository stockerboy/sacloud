/**
 * ★★설박튀 — 「한쪽 클랜에만 남은 경기」를 찾는다★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * 사장님 말씀 —
 * > «설박튀를 해도 ★이긴팀 병영에는 무조건 남는다.★ 반면 ★레드팀(도망간팀) 기록에는 안남는다★»
 *
 * ★그러면 양쪽 클랜을 다 조회한 경기에서 「한쪽에만 있는 경기」가 나와야 한다.★
 * 우리는 클랜 95개의 목록을 갖고 있다. ★두 클랜이 다 우리 조회 대상인 경기★ 만 골라
 * 양쪽에 다 있는지 본다. 그게 아니면 「우리가 한쪽만 조회해서」일 뿐이다.
 *
 * 상대 클랜 번호는 ★배틀로그 teamList★ 가 준다 (목록 응답에는 상대 clan_no 가 없다).
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  console.info('══ 1 · ★양쪽 클랜을 다 조회한 경기가 몇 건인가★ ══\n')
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH polled AS (SELECT DISTINCT "payload"->>'clan_no' AS cno FROM "BarracksClanMatchRaw"
                       WHERE "status" = 'ok' AND COALESCE("payload"->>'clan_no','') <> ''),
    tl AS (
      SELECT DISTINCT r."matchKey" AS k, t->>'clan_no' AS cno
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'teamList') t
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'teamList') = 'array'
         AND COALESCE(t->>'clan_no','') <> ''
    ),
    per AS (
      SELECT tl.k, count(*) AS teams,
             count(*) FILTER (WHERE polled.cno IS NOT NULL) AS polledTeams
        FROM tl LEFT JOIN polled ON polled.cno = tl.cno GROUP BY 1
    )
    SELECT '배틀로그 · teamList 가 있는 경기' AS label, count(*) AS n FROM per
    UNION ALL SELECT '  두 클랜 번호를 다 아는 경기', count(*) FROM per WHERE teams = 2
    UNION ALL SELECT '★  두 클랜을 다 조회한 경기★', count(*) FROM per WHERE teams = 2 AND polledTeams = 2
    UNION ALL SELECT '  한쪽만 조회한 경기', count(*) FROM per WHERE teams = 2 AND polledTeams = 1
    UNION ALL SELECT '  둘 다 조회 안 한 경기', count(*) FROM per WHERE teams = 2 AND polledTeams = 0
  `)
  for (const x of a) console.info(`  ${x.label.padEnd(34)} ${Number(x.n).toLocaleString().padStart(7)}건`)

  console.info('\n══ 2 · ★★그 경기가 양쪽 목록에 다 있는가★★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH polled AS (SELECT DISTINCT "payload"->>'clan_no' AS cno FROM "BarracksClanMatchRaw"
                       WHERE "status" = 'ok' AND COALESCE("payload"->>'clan_no','') <> ''),
    tl AS (
      SELECT DISTINCT r."matchKey" AS k, t->>'clan_no' AS cno
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'teamList') t
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'teamList') = 'array'
         AND COALESCE(t->>'clan_no','') <> ''
    ),
    pair AS (
      SELECT tl.k FROM tl JOIN polled ON polled.cno = tl.cno
       GROUP BY 1 HAVING count(*) = 2
    ),
    have AS (
      SELECT pair.k, tl.cno,
             EXISTS (SELECT 1 FROM "BarracksClanMatchRaw" c
                      WHERE c."status" = 'ok' AND c."matchKey" = pair.k AND c."payload"->>'clan_no' = tl.cno) AS present
        FROM pair JOIN tl ON tl.k = pair.k
    ),
    per AS (SELECT k, count(*) FILTER (WHERE present) AS n FROM have GROUP BY 1)
    SELECT '두 클랜 다 조회한 경기 (분모)' AS label, count(*) AS n FROM per
    UNION ALL SELECT '  양쪽 목록에 다 있음', count(*) FROM per WHERE n = 2
    UNION ALL SELECT '★★  한쪽 목록에만 있음 = 설박튀 후보★★', count(*) FROM per WHERE n = 1
    UNION ALL SELECT '  양쪽 다 없음', count(*) FROM per WHERE n = 0
  `)
  const d = Number(b[0]!.n)
  for (const x of b) console.info(`  ${x.label.padEnd(38)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 3 · ★한쪽에만 있는 경기가 설박튀 모양인가★ ══\n')
  const c = await prisma.$queryRawUnsafe<{ label: string; one: bigint; n: bigint }[]>(`
    WITH polled AS (SELECT DISTINCT "payload"->>'clan_no' AS cno FROM "BarracksClanMatchRaw"
                       WHERE "status" = 'ok' AND COALESCE("payload"->>'clan_no','') <> ''),
    tl AS (
      SELECT DISTINCT r."matchKey" AS k, t->>'clan_no' AS cno
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'teamList') t
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'teamList') = 'array'
         AND COALESCE(t->>'clan_no','') <> ''
    ),
    pair AS (SELECT tl.k FROM tl JOIN polled ON polled.cno = tl.cno GROUP BY 1 HAVING count(*) = 2),
    have AS (
      SELECT pair.k, tl.cno,
             EXISTS (SELECT 1 FROM "BarracksClanMatchRaw" c
                      WHERE c."status" = 'ok' AND c."matchKey" = pair.k AND c."payload"->>'clan_no' = tl.cno) AS present
        FROM pair JOIN tl ON tl.k = pair.k
    ),
    per AS (SELECT k, count(*) FILTER (WHERE present) AS npresent FROM have GROUP BY 1),
    ev AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             e->>'weapon' AS w, e->>'target_weapon' AS tw
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'
         AND COALESCE(e->>'round','') <> ''
    ),
    pr AS (
      SELECT k, rnd, bool_or(w = 'c4-install' OR tw = 'c4-install') AS planted,
             bool_or(w = 'c4-dismantle' OR tw = 'c4-dismantle') AS defused
        FROM ev GROUP BY 1,2
    ),
    lastr AS (
      SELECT k, planted, defused FROM (
        SELECT pr.*, row_number() OVER (PARTITION BY k ORDER BY rnd DESC) AS rk FROM pr) z WHERE rk = 1
    )
    SELECT CASE WHEN lastr.planted AND NOT lastr.defused THEN 'A ★마지막 설치·해체X★'
                WHEN lastr.planted THEN 'B 마지막 설치+해체'
                ELSE 'C 마지막 설치 없음' END AS label,
           count(*) FILTER (WHERE per.npresent = 1) AS one, count(*) AS n
      FROM per JOIN lastr ON lastr.k = per.k GROUP BY 1 ORDER BY 1
  `)
  for (const x of c) {
    const n = Number(x.n)
    console.info(`  ${x.label.padEnd(26)} ${n.toLocaleString().padStart(6)}건  ★한쪽에만 ${Number(x.one).toLocaleString().padStart(5)} (${pc(Number(x.one), n)})★`)
  }

  /* ── 4 · 누락 경기가 「우리 리그 클랜의 경기」이긴 한가 ────────── */
  console.info('\n══ 4 · ★우리 Match 에 없는 경기가 「우리 클랜의 경기」인가★ ══\n')
  const e = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH lst AS (
      SELECT "matchKey" AS k, max("payload"->>'red_clan_name') AS rn,
             max("payload"->>'blue_clan_name') AS bn
        FROM "BarracksClanMatchRaw" WHERE "status" = 'ok' GROUP BY 1
    ),
    miss AS (
      SELECT lst.* FROM lst LEFT JOIN "Match" m ON m."sourceMatchId" = lst.k WHERE m."id" IS NULL
    )
    SELECT '우리 Match 에 없는 목록 경기 (분모)' AS label, count(*) AS n FROM miss
    UNION ALL SELECT '★  양 팀 다 우리 Clan 표에 있는 클랜★', count(*) FROM miss
      WHERE EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = miss.rn)
        AND EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = miss.bn)
    UNION ALL SELECT '  한쪽만 우리 클랜', count(*) FROM miss
      WHERE (EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = miss.rn))
         <> (EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = miss.bn))
    UNION ALL SELECT '  둘 다 우리 클랜 아님', count(*) FROM miss
      WHERE NOT EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = miss.rn)
        AND NOT EXISTS (SELECT 1 FROM "Clan" c WHERE c."name" = miss.bn)
  `)
  const en = Number(e[0]!.n)
  for (const x of e) console.info(`  ${x.label.padEnd(38)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), en)}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
