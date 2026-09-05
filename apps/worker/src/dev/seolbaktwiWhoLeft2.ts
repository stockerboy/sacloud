/**
 * ★★설박튀 — 「나간 팀이 설치한 팀인가」 (선수로 다리를 놓는다)★★
 * (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * ⚠ 앞 탐침에서 쓰려던 `BarracksClanNumber` 는 ★행이 0개다.★ 클랜번호 다리는 없다.
 * 대신 ★선수★ 로 잇는다 —
 * ```
 * 배틀로그  user_nexon_sn(팀 team_no)   ─┐
 * 우리 DB   Player.sourcePlayerId        ├→ MatchPlayerStat.side · dropout
 *          MatchPlayerStat.playerId    ─┘
 * ```
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

const BASE = `
  WITH ev AS (
    SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
           e->>'weapon' AS w, e->>'target_weapon' AS tw,
           NULLIF(e->>'team_no','') AS team, NULLIF(e->>'target_team_no','') AS tteam,
           NULLIF(e->>'user_nexon_sn','0')        AS usn,
           NULLIF(e->>'target_user_nexon_sn','0') AS tusn
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
  /* 선수 → 팀번호 (배틀로그 쪽) */
  ppl AS (
    SELECT k, usn AS sn, team FROM ev WHERE usn IS NOT NULL AND team IS NOT NULL
    UNION
    SELECT k, tusn, tteam FROM ev WHERE tusn IS NOT NULL AND tteam IS NOT NULL
  ),
  /* 선수 → side · dropout (우리 DB 쪽) */
  mps AS (
    SELECT m."sourceMatchId" AS k, l."slug" AS league, p."sourcePlayerId" AS sn,
           s."side", s."dropout"
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
      JOIN "Player" p ON p."id" = s."playerId"
     WHERE p."sourcePlayerId" IS NOT NULL
  ),
  /* team_no ↔ side 짝 (선수 다수결이 아니라 ★한 팀에 한 side 만 나올 때★ 만 인정) */
  pair AS (
    SELECT ppl.k, ppl.team, count(DISTINCT mps."side") AS nside, max(mps."side") AS side
      FROM ppl JOIN mps ON mps.k = ppl.k AND mps.sn = ppl.sn
     GROUP BY 1,2
  ),
  bridge AS (SELECT k, team, side FROM pair WHERE nside = 1),
  full2 AS (SELECT k FROM bridge GROUP BY 1 HAVING count(DISTINCT team) = 2),
  drop AS (
    SELECT k, league, "side", bool_and("dropout" IS TRUE) AS allout,
           count(*) AS n, count(*) FILTER (WHERE "dropout" IS NULL) AS unknown
      FROM mps GROUP BY 1,2,3
  )`

async function main(): Promise<void> {
  console.info('══ 1 · ★다리가 놓이는가★ ══\n')
  const a = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${BASE}
    SELECT '배틀로그 경기' AS label, count(DISTINCT k) AS n FROM ev
    UNION ALL SELECT '우리 Match 에도 있는 경기', count(DISTINCT k) FROM mps
    UNION ALL SELECT '선수로 team_no↔side 가 이어진 경기', count(DISTINCT k) FROM bridge
    UNION ALL SELECT '★두 팀 다 이어진 경기★', count(*) FROM full2
    UNION ALL SELECT '  그중 dropout 값이 실제로 있는 경기', count(DISTINCT drop.k)
      FROM drop JOIN full2 ON full2.k = drop.k WHERE drop.unknown = 0
  `)
  for (const x of a) console.info(`  ${x.label.padEnd(38)} ${Number(x.n).toLocaleString().padStart(7)}건`)

  console.info('\n══ 2 · ★★마지막 라운드 설치 · 해체X · 누가 나갔나★★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${BASE},
    j AS (
      SELECT lastr.k, lastr.planted, lastr.defused,
             bool_or(drop.allout) FILTER (WHERE drop."side" =  ps.side) AS "planterOut",
             bool_or(drop.allout) FILTER (WHERE drop."side" <> ps.side) AS "otherOut"
        FROM lastr
        JOIN full2 ON full2.k = lastr.k
        JOIN bridge ps ON ps.k = lastr.k AND ps.team = lastr.planter
        JOIN drop ON drop.k = lastr.k
       WHERE drop.unknown = 0
       GROUP BY 1,2,3
    )
    SELECT '판정 가능한 경기 (분모)' AS label, count(*) AS n FROM j
    UNION ALL SELECT '마지막 라운드 설치 · 해체 없음', count(*) FROM j WHERE planted AND NOT defused
    UNION ALL SELECT '★★그중 설치팀이 통째로 나감 = 설박튀★★', count(*) FROM j
       WHERE planted AND NOT defused AND "planterOut"
    UNION ALL SELECT '  그중 수비팀이 통째로 나감', count(*) FROM j
       WHERE planted AND NOT defused AND "otherOut" AND NOT COALESCE("planterOut", false)
    UNION ALL SELECT '  그중 아무도 안 나감', count(*) FROM j
       WHERE planted AND NOT defused AND NOT COALESCE("planterOut",false) AND NOT COALESCE("otherOut",false)
    UNION ALL SELECT '[대조] 마지막에 설치 없음 · 한 팀 통째 나감', count(*) FROM j
       WHERE NOT planted AND (COALESCE("planterOut",false) OR COALESCE("otherOut",false))
  `)
  const d = Number(b[0]!.n)
  for (const x of b) console.info(`  ${x.label.padEnd(42)} ${Number(x.n).toLocaleString().padStart(6)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 3 · ★리그별★ ══\n')
  const c = await prisma.$queryRawUnsafe<{ league: string; n: bigint; cand: bigint }[]>(`${BASE},
    j AS (
      SELECT lastr.k, drop.league, lastr.planted, lastr.defused,
             bool_or(drop.allout) FILTER (WHERE drop."side" = ps.side) AS "planterOut"
        FROM lastr
        JOIN full2 ON full2.k = lastr.k
        JOIN bridge ps ON ps.k = lastr.k AND ps.team = lastr.planter
        JOIN drop ON drop.k = lastr.k
       WHERE drop.unknown = 0
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
