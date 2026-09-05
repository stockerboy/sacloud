/**
 * ★★설박튀 — 「안 찍힌 라운드」를 직접 찾는다★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * ══ 이게 사장님 말씀 그대로다 ══
 *
 * > «레드가 설치하고 블루가 해체하기 전에 5명이 전부 나간다 → ★기록이 안 찍힌다★»
 *
 * 그러면 ★배틀로그에는 그 라운드가 있는데 점수표에는 안 들어 있어야★ 한다.
 * 우리는 둘을 다 갖고 있다 —
 * ```
 * 배틀로그   max(round)            실제로 벌어진 라운드 수
 * 경기 목록  red_win_cnt+blue_win_cnt  ★점수로 인정된 라운드 수★
 * ```
 * ★차이가 1 이면 「한 라운드가 안 찍혔다」는 뜻이다.★
 *
 * ⚠ 배틀로그가 잘릴 수 있으므로 ★점수 합이 17 이하인 경기★ 만 본다 (최대 18라운드 관측).
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

const BASE = `
  WITH sc AS (
    SELECT "matchKey" AS k,
           max(("payload"->>'red_win_cnt')::int)  AS r,
           max(("payload"->>'blue_win_cnt')::int) AS b
      FROM "BarracksClanMatchRaw"
     WHERE "status" = 'ok' AND "payload"->>'red_win_cnt' IS NOT NULL
     GROUP BY 1
  ),
  ev AS (
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
  bl AS (
    SELECT k, max(rnd) AS maxrnd, count(*) AS nrnd FROM pr GROUP BY 1
  ),
  lastr AS (
    SELECT k, planted, defused, planter FROM (
      SELECT pr.*, row_number() OVER (PARTITION BY k ORDER BY rnd DESC) AS rk FROM pr) z
     WHERE rk = 1
  ),
  j AS (
    SELECT sc.k, sc.r, sc.b, sc.r + sc.b AS scored, bl.maxrnd, bl.nrnd,
           bl.maxrnd - (sc.r + sc.b) AS gap,
           lastr.planted AS lastPlanted, lastr.defused AS lastDefused
      FROM sc JOIN bl ON bl.k = sc.k JOIN lastr ON lastr.k = sc.k
     WHERE sc.r + sc.b <= 17
  )`

async function main(): Promise<void> {
  console.info('══ 1 · ★배틀로그 라운드 수 − 점수로 인정된 라운드 수★ ══\n')
  const a = await prisma.$queryRawUnsafe<{ gap: number; n: bigint }[]>(`${BASE}
    SELECT gap, count(*) AS n FROM j GROUP BY 1 ORDER BY 1
  `)
  let tot = 0
  for (const x of a) tot += Number(x.n)
  for (const x of a) {
    const tag = x.gap === 0 ? ' ← 딱 맞음 (정상)' : x.gap === 1 ? ' ← ★한 라운드가 안 찍혔다★' : ''
    console.info(`  ${String(x.gap).padStart(4)}  ${Number(x.n).toLocaleString().padStart(7)}건  ${pc(Number(x.n), tot).padStart(6)}${tag}`)
  }

  console.info('\n══ 2 · ★★차이 1 인 경기의 마지막 라운드★★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${BASE}
    SELECT CASE WHEN gap = 1 THEN 'A ★안 찍힌 라운드 1개★'
                WHEN gap = 0 THEN 'B 딱 맞음' ELSE 'C 그 밖' END
           || ' · ' ||
           CASE WHEN lastPlanted AND NOT lastDefused THEN '마지막 ★설치·해체X★'
                WHEN lastPlanted THEN '마지막 설치+해체'
                ELSE '마지막 설치 없음' END AS label,
           count(*) AS n FROM j GROUP BY 1 ORDER BY 1
  `)
  for (const x of b) console.info(`  ${x.label.padEnd(44)} ${Number(x.n).toLocaleString().padStart(7)}건`)

  console.info('\n══ 3 · ★★설박튀 후보 = 안 찍힌 라운드 + 그 라운드에 설치 + 해체 없음★★ ══\n')
  const c = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${BASE}
    SELECT '맞대 볼 수 있는 경기 (분모)' AS label, count(*) AS n FROM j
    UNION ALL SELECT '★안 찍힌 라운드가 있다 (gap>=1)★', count(*) FROM j WHERE gap >= 1
    UNION ALL SELECT '★★설박튀 후보 (gap=1 · 설치 · 해체X)★★', count(*) FROM j
       WHERE gap = 1 AND lastPlanted AND NOT lastDefused
    UNION ALL SELECT '  (gap>=1 · 설치 · 해체X)', count(*) FROM j
       WHERE gap >= 1 AND lastPlanted AND NOT lastDefused
  `)
  const d = Number(c[0]!.n)
  for (const x of c) console.info(`  ${x.label.padEnd(40)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 4 · ★리그별★ ══\n')
  const e = await prisma.$queryRawUnsafe<{ league: string; n: bigint; cand: bigint; gap1: bigint }[]>(`${BASE}
    SELECT COALESCE(l."slug",'(Match 없음)') AS league, count(*) AS n,
           count(*) FILTER (WHERE j.gap = 1 AND j.lastPlanted AND NOT j.lastDefused) AS cand,
           count(*) FILTER (WHERE j.gap >= 1) AS gap1
      FROM j LEFT JOIN "Match" mm ON mm."sourceMatchId" = j.k
             LEFT JOIN "League" l ON l."id" = mm."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of e) {
    const n = Number(x.n)
    console.info(
      `  ${x.league.padEnd(14)} 경기 ${n.toLocaleString().padStart(6)}` +
        `  ★후보 ${Number(x.cand).toLocaleString().padStart(5)} (${pc(Number(x.cand), n)})★` +
        `  안찍힌라운드있음 ${Number(x.gap1).toLocaleString().padStart(6)} (${pc(Number(x.gap1), n)})`,
    )
  }

  console.info('\n══ 5 · ★후보 경기에서 전원 탈주가 실제로 있었나★ ══\n')
  const f = await prisma.$queryRawUnsafe<{ label: string; n: bigint; out: bigint }[]>(`${BASE},
    side AS (
      SELECT mm."sourceMatchId" AS k, s."side", bool_and(s."dropout" IS TRUE) AS allout
        FROM "Match" mm JOIN "MatchPlayerStat" s ON s."matchId" = mm."id"
       WHERE s."dropout" IS NOT NULL GROUP BY 1,2 HAVING count(*) >= 4
    ),
    per AS (SELECT k, bool_or(allout) AS "anyOut" FROM side GROUP BY 1)
    SELECT CASE WHEN j.gap = 1 AND j.lastPlanted AND NOT j.lastDefused THEN 'A ★설박튀 후보★'
                WHEN j.gap = 0 THEN 'B 딱 맞은 경기' ELSE 'C 그 밖' END AS label,
           count(*) AS n, count(*) FILTER (WHERE per."anyOut") AS out
      FROM j JOIN per ON per.k = j.k GROUP BY 1 ORDER BY 1
  `)
  for (const x of f) {
    const n = Number(x.n)
    console.info(`  ${x.label.padEnd(20)} ${n.toLocaleString().padStart(6)}건  한 팀 통째 탈주 ${Number(x.out).toLocaleString().padStart(5)} (${pc(Number(x.out), n)})`)
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
