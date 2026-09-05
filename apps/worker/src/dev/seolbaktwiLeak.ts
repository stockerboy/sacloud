/**
 * ★★설박튀 — 「우리가 놓치는 기록」을 잰다★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * ══ 목표가 바뀌었다 (사장님 2026-09-04) ══
 * > «설박튀를 ★세는 게 목적이 아니라★ ★누락되는 기록을 놓치지 않고 붙잡는 게 목표★»
 *
 * 그래서 세는 자리를 옮긴다 —
 * ```
 * 전  「설박튀가 몇 건인가」
 * 후  ★「병영수첩에는 있는데 우리 Match 표에는 없는 경기가 몇 건인가」★
 *     ★「있어도 승패·라인업이 맞게 붙었는가」★
 * ```
 *
 * 우리가 가진 두 우물 —
 * ```
 * BarracksClanMatchRaw   병영수첩 ★경기 목록★  54,235경기 · 조회 클랜 95개
 *                        red_win_cnt / blue_win_cnt / red_clan_name / blue_clan_name
 * BarracksBattleLogRaw   병영수첩 ★배틀로그★    19,824경기 · teamList 로 양 팀 clan_no
 * Match / MatchPlayerStat  ★우리 기록★
 * ```
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

const LIST = `
  WITH lst AS (
    SELECT "matchKey" AS k,
           max(("payload"->>'red_win_cnt')::int)  AS r,
           max(("payload"->>'blue_win_cnt')::int) AS b,
           max("payload"->>'red_clan_name')       AS "redName",
           max("payload"->>'blue_clan_name')      AS "blueName",
           count(DISTINCT "subject")              AS subs,
           left("matchKey", 6)                    AS ymd
      FROM "BarracksClanMatchRaw"
     WHERE "status" = 'ok' AND "payload"->>'red_win_cnt' IS NOT NULL
     GROUP BY 1
  )`

async function main(): Promise<void> {
  /* ── 1 · 병영수첩에 있는데 우리 Match 에 없는 경기 ─────────────── */
  console.info('══ 1 · ★★병영수첩 목록에 있는데 우리 Match 표에 없는 경기★★ ══\n')
  const a = await prisma.$queryRawUnsafe<{ ym: string; n: bigint; miss: bigint }[]>(`${LIST}
    SELECT left(lst.k, 4) AS ym, count(*) AS n,
           count(*) FILTER (WHERE m."id" IS NULL) AS miss
      FROM lst LEFT JOIN "Match" m ON m."sourceMatchId" = lst.k
     GROUP BY 1 ORDER BY 1
  `)
  let tn = 0
  let tm = 0
  for (const x of a) {
    const n = Number(x.n)
    const miss = Number(x.miss)
    tn += n
    tm += miss
    console.info(`  ${x.ym}  경기 ${n.toLocaleString().padStart(7)}  ★없음 ${miss.toLocaleString().padStart(7)} (${pc(miss, n)})★`)
  }
  console.info(`  ${'합계'.padEnd(6)} 경기 ${tn.toLocaleString().padStart(7)}  ★없음 ${tm.toLocaleString().padStart(7)} (${pc(tm, tn)})★`)

  /* ── 2 · 배틀로그 기준 ────────────────────────────────────── */
  console.info('\n══ 2 · ★배틀로그가 있는 경기 기준★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    WITH bl AS (SELECT DISTINCT "matchKey" AS k FROM "BarracksBattleLogRaw" WHERE "status" = 'ok')
    SELECT '배틀로그 경기' AS label, count(*) AS n FROM bl
    UNION ALL SELECT '  우리 Match 에 있음', count(*) FROM bl JOIN "Match" m ON m."sourceMatchId" = bl.k
    UNION ALL SELECT '★  우리 Match 에 없음★', count(*) FROM bl
      LEFT JOIN "Match" m ON m."sourceMatchId" = bl.k WHERE m."id" IS NULL
  `)
  for (const x of b) console.info(`  ${x.label.padEnd(26)} ${Number(x.n).toLocaleString().padStart(7)}건`)

  /* ── 3 · ★없는 경기가 설박튀 모양인가★ ──────────────────────── */
  console.info('\n══ 3 · ★★없는 경기가 설박튀 모양인가★★ ══\n')
  console.info('  설박튀 모양 = 마지막 라운드에 설치가 있고 해체가 없다\n')
  const c = await prisma.$queryRawUnsafe<{ label: string; n: bigint; miss: bigint }[]>(`
    WITH ev AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             e->>'weapon' AS w, e->>'target_weapon' AS tw
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'
         AND COALESCE(e->>'round','') <> ''
    ),
    pr AS (
      SELECT k, rnd,
             bool_or(w = 'c4-install'   OR tw = 'c4-install')   AS planted,
             bool_or(w = 'c4-dismantle' OR tw = 'c4-dismantle') AS defused
        FROM ev GROUP BY 1,2
    ),
    lastr AS (
      SELECT k, planted, defused FROM (
        SELECT pr.*, row_number() OVER (PARTITION BY k ORDER BY rnd DESC) AS rk FROM pr) z
       WHERE rk = 1
    )
    SELECT CASE WHEN planted AND NOT defused THEN 'A ★마지막 설치·해체X★'
                WHEN planted THEN 'B 마지막 설치+해체'
                ELSE 'C 마지막 설치 없음' END AS label,
           count(*) AS n, count(*) FILTER (WHERE m."id" IS NULL) AS miss
      FROM lastr LEFT JOIN "Match" m ON m."sourceMatchId" = lastr.k
     GROUP BY 1 ORDER BY 1
  `)
  for (const x of c) {
    const n = Number(x.n)
    console.info(`  ${x.label.padEnd(26)} ${n.toLocaleString().padStart(6)}건  ★우리에게 없음 ${Number(x.miss).toLocaleString().padStart(6)} (${pc(Number(x.miss), n)})★`)
  }
  console.info('\n  ★읽는 법★ — A 의 「없음」이 C 보다 확 높으면 ★설박튀 때문에 새는 것★ 이다.\n            비슷하면 ★그냥 아직 안 가져온 것★ 이다')

  /* ── 4 · ★있는 경기의 승패가 맞는가★ ────────────────────────── */
  console.info('\n══ 4 · ★★우리가 적은 승패가 병영수첩과 같은가★★ ══\n')
  const d = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${LIST},
    ours AS (
      SELECT m."sourceMatchId" AS k, m."winnerSide",
             cr."name" AS "ourRed", cb."name" AS "ourBlue"
        FROM "Match" m
        JOIN "LeagueClan" lr ON lr."id" = m."redLeagueClanId"
        JOIN "LeagueClan" lb ON lb."id" = m."blueLeagueClanId"
        JOIN "Clan" cr ON cr."id" = lr."clanId"
        JOIN "Clan" cb ON cb."id" = lb."clanId"
    ),
    j AS (
      SELECT lst.k,
             CASE WHEN lst.r > lst.b THEN lst."redName"
                  WHEN lst.b > lst.r THEN lst."blueName" END AS "barracksWinner",
             CASE WHEN ours."winnerSide" = 'red' THEN ours."ourRed" ELSE ours."ourBlue" END AS "ourWinner",
             ours."ourRed", ours."ourBlue", lst.r, lst.b
        FROM lst JOIN ours ON ours.k = lst.k
    )
    SELECT '병영수첩·우리 둘 다 있는 경기' AS label, count(*) AS n FROM j
    UNION ALL SELECT '  병영수첩 점수가 동점이라 승자 모름', count(*) FROM j WHERE "barracksWinner" IS NULL
    UNION ALL SELECT '  클랜명이 양쪽 어느 쪽과도 안 맞음', count(*) FROM j
      WHERE "barracksWinner" IS NOT NULL AND "barracksWinner" <> "ourRed" AND "barracksWinner" <> "ourBlue"
    UNION ALL SELECT '★  승자 일치★', count(*) FROM j
      WHERE "barracksWinner" IS NOT NULL AND "barracksWinner" = "ourWinner"
    UNION ALL SELECT '★★  승자 불일치 (우리가 틀렸다)★★', count(*) FROM j
      WHERE "barracksWinner" IS NOT NULL AND "barracksWinner" <> "ourWinner"
        AND ("barracksWinner" = "ourRed" OR "barracksWinner" = "ourBlue")
  `)
  const dn = Number(d[0]!.n)
  for (const x of d) console.info(`  ${x.label.padEnd(40)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), dn)}`)

  /* ── 5 · ★라인업이 붙었는가★ ────────────────────────────────── */
  console.info('\n══ 5 · ★★있는 경기에 라인업이 붙었는가★★ ══\n')
  const e = await prisma.$queryRawUnsafe<{ league: string; n: bigint; empty: bigint; thin: bigint }[]>(`${LIST}
    SELECT COALESCE(l."slug",'(리그없음)') AS league, count(*) AS n,
           count(*) FILTER (WHERE s.cnt = 0)              AS empty,
           count(*) FILTER (WHERE s.cnt > 0 AND s.cnt < 10) AS thin
      FROM lst
      JOIN "Match" m  ON m."sourceMatchId" = lst.k
      JOIN "League" l ON l."id" = m."leagueId"
      LEFT JOIN LATERAL (
        SELECT count(*) AS cnt FROM "MatchPlayerStat" ss WHERE ss."matchId" = m."id"
      ) s ON true
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of e) {
    const n = Number(x.n)
    console.info(
      `  ${x.league.padEnd(12)} 경기 ${n.toLocaleString().padStart(6)}` +
        `  ★라인업 0명 ${Number(x.empty).toLocaleString().padStart(5)} (${pc(Number(x.empty), n)})★` +
        `  10명 미만 ${Number(x.thin).toLocaleString().padStart(5)} (${pc(Number(x.thin), n)})`,
    )
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
