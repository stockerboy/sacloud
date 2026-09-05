/**
 * ★★설박튀 — 「나간 팀이 설치한 팀인가」★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * 사장님 조건 ③ 은 ★「레드(설치한 팀) 전원이 나갔다」★ 다.
 * 배틀로그에 ★퇴장 이벤트는 없다.★ 그래서 우리가 가진 유일한 퇴장 근거는
 * `MatchPlayerStat.dropout` 이다 (supply·sanply·daerule 만 값이 있다. nolink 는 전부 null).
 *
 * ★그런데 dropout 은 red/blue 「자리」로 오고 배틀로그는 team_no 로 온다.★ 이어 붙인다 —
 * ```
 * teamList(team_no, clan_no) → BarracksClanNumber(clanNo→clanId)
 *   → LeagueClan.clanId → Match.redLeagueClanId / blueLeagueClanId → side
 * ```
 * ★이 다리가 몇 % 놓이는지부터 적는다.★ 안 놓이면 「모른다」다.
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

const BASE = `
  WITH ev AS (
    SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
           e->>'weapon' AS w, e->>'target_weapon' AS tw,
           NULLIF(e->>'team_no','') AS team, NULLIF(e->>'target_team_no','') AS tteam
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'
       AND COALESCE(e->>'round','') <> ''
  ),
  pr AS (
    SELECT k, rnd,
           bool_or(w = 'c4-install'   OR tw = 'c4-install')   AS planted,
           bool_or(w = 'c4-dismantle' OR tw = 'c4-dismantle') AS defused,
           max(COALESCE(CASE WHEN w  = 'c4-install' THEN team  END,
                        CASE WHEN tw = 'c4-install' THEN tteam END)) AS planter
      FROM ev GROUP BY 1,2
  ),
  lastr AS (
    SELECT k, planted, defused, planter FROM (
      SELECT pr.*, row_number() OVER (PARTITION BY k ORDER BY rnd DESC) AS rk FROM pr) z
     WHERE rk = 1
  ),
  /* team_no → side 다리 */
  tl AS (
    SELECT DISTINCT r."matchKey" AS k, t->>'team_no' AS team_no, t->>'clan_no' AS clan_no
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'teamList') t
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'teamList') = 'array'
       AND COALESCE(t->>'clan_no','') <> ''
  ),
  bridge AS (
    SELECT tl.k, tl.team_no,
           CASE WHEN lcr."clanId" = bn."clanId" THEN 'red'
                WHEN lcb."clanId" = bn."clanId" THEN 'blue' END AS side
      FROM tl
      JOIN "BarracksClanNumber" bn ON bn."clanNo" = tl.clan_no
      JOIN "Match" m       ON m."sourceMatchId" = tl.k
      JOIN "LeagueClan" lcr ON lcr."id" = m."redLeagueClanId"
      JOIN "LeagueClan" lcb ON lcb."id" = m."blueLeagueClanId"
  ),
  drop AS (
    SELECT m."sourceMatchId" AS k, l."slug" AS league, s."side",
           bool_and(s."dropout" IS TRUE) AS allout
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
     WHERE s."dropout" IS NOT NULL
     GROUP BY 1,2,3 HAVING count(*) >= 4
  )`

async function main(): Promise<void> {
  console.info('══ 1 · ★다리가 놓이는가★ (team_no → side) ══\n')
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${BASE}
    SELECT 'teamList 이 있는 경기' AS label, count(DISTINCT k) AS n FROM tl
    UNION ALL SELECT 'Match·클랜번호까지 이어진 경기', count(DISTINCT k) FROM bridge
    UNION ALL SELECT '★두 팀 다 side 를 안 경기★', count(*) FROM (
      SELECT k FROM bridge WHERE side IS NOT NULL GROUP BY 1 HAVING count(DISTINCT team_no) = 2) z
    UNION ALL SELECT 'dropout 값이 있는 경기', count(DISTINCT k) FROM drop
  `)
  for (const x of a) console.info(`  ${x.label.padEnd(34)} ${Number(x.n).toLocaleString().padStart(7)}건`)

  console.info('\n══ 2 · ★★나간 팀이 설치한 팀인가★★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${BASE},
    ok AS (
      SELECT bridge.k, bridge.team_no, bridge.side FROM bridge WHERE bridge.side IS NOT NULL
    ),
    full2 AS (SELECT k FROM ok GROUP BY 1 HAVING count(DISTINCT team_no) = 2),
    j AS (
      SELECT lastr.k, lastr.planted, lastr.defused,
             pside.side AS "planterSide",
             bool_or(drop.allout) FILTER (WHERE drop."side" = pside.side) AS "planterOut",
             bool_or(drop.allout) FILTER (WHERE drop."side" <> pside.side) AS "otherOut"
        FROM lastr
        JOIN full2 ON full2.k = lastr.k
        JOIN ok pside ON pside.k = lastr.k AND pside.team_no = lastr.planter
        JOIN drop ON drop.k = lastr.k
       GROUP BY 1,2,3,4
    )
    SELECT '판정 가능한 경기 (분모)' AS label, count(*) AS n FROM j
    UNION ALL SELECT '마지막 라운드에 설치 있음', count(*) FROM j WHERE planted
    UNION ALL SELECT '마지막 라운드 설치 · 해체 없음', count(*) FROM j WHERE planted AND NOT defused
    UNION ALL SELECT '★★그중 설치팀이 통째로 나감 = 설박튀★★', count(*) FROM j
       WHERE planted AND NOT defused AND "planterOut"
    UNION ALL SELECT '  그중 상대(수비팀)가 통째로 나감', count(*) FROM j
       WHERE planted AND NOT defused AND "otherOut" AND NOT COALESCE("planterOut", false)
    UNION ALL SELECT '  그중 아무도 안 나감', count(*) FROM j
       WHERE planted AND NOT defused AND NOT COALESCE("planterOut",false) AND NOT COALESCE("otherOut",false)
  `)
  const d = Number(b[0]!.n)
  for (const x of b) console.info(`  ${x.label.padEnd(40)} ${Number(x.n).toLocaleString().padStart(6)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 3 · ★리그별★ ══\n')
  const c = await prisma.$queryRawUnsafe<{ league: string; n: bigint; cand: bigint }[]>(`${BASE},
    ok AS (SELECT bridge.k, bridge.team_no, bridge.side FROM bridge WHERE bridge.side IS NOT NULL),
    full2 AS (SELECT k FROM ok GROUP BY 1 HAVING count(DISTINCT team_no) = 2),
    j AS (
      SELECT lastr.k, drop.league, lastr.planted, lastr.defused,
             bool_or(drop.allout) FILTER (WHERE drop."side" = pside.side) AS "planterOut"
        FROM lastr
        JOIN full2 ON full2.k = lastr.k
        JOIN ok pside ON pside.k = lastr.k AND pside.team_no = lastr.planter
        JOIN drop ON drop.k = lastr.k
       GROUP BY 1,2,3,4
    )
    SELECT league, count(*) AS n,
           count(*) FILTER (WHERE planted AND NOT defused AND "planterOut") AS cand
      FROM j GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of c) {
    const n = Number(x.n)
    console.info(`  ${x.league.padEnd(12)} 경기 ${n.toLocaleString().padStart(6)}  ★후보 ${Number(x.cand).toLocaleString().padStart(5)} (${pc(Number(x.cand), n)})★`)
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
