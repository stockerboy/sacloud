/**
 * ★★설박튀 — 진짜 점수로 센다★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * ══ 여기서 길이 열렸다 ══
 *
 * 배틀로그(`BarracksBattleLogRaw`)는 ★라운드를 다 주지 않는다★ — 경기당 최대 18라운드고
 * 승패를 다 아는 경기가 15% 뿐이다. 그걸로 「어중간하게 끝났다」를 판정하면 ★로그 결손을
 * 설박튀로 세게 된다.★
 *
 * 그런데 ★경기 목록(`BarracksClanMatchRaw`)에 최종 점수가 통째로 있다★ —
 * ```
 * red_win_cnt · blue_win_cnt   양 팀 라운드 승수
 * is_broken_table              ★「깨진 대진」 표시★
 * result_wdl                   조회 클랜 기준 승/패
 * ```
 * ★정상 경기는 한 쪽이 정규 승수를 채우고 끝난다.★
 * ★설박튀는 한 팀이 사라져 그 자리에서 끊긴다 → 아무도 못 채운 채 끝난다.★
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

const M = `
  WITH m AS (
    SELECT "matchKey" AS k,
           max(("payload"->>'red_win_cnt')::int)  AS r,
           max(("payload"->>'blue_win_cnt')::int) AS b,
           bool_or(("payload"->>'is_broken_table')::boolean) AS broken,
           count(DISTINCT "subject") AS subs
      FROM "BarracksClanMatchRaw"
     WHERE "status" = 'ok' AND "payload"->>'red_win_cnt' IS NOT NULL
     GROUP BY 1
  )`

async function main(): Promise<void> {
  console.info('══ 1 · ★최종 점수 분포★ (이긴 쪽 승수) ══\n')
  const a = await prisma.$queryRawUnsafe<{ hi: number; n: bigint }[]>(`${M}
    SELECT greatest(r,b) AS hi, count(*) AS n FROM m GROUP BY 1 ORDER BY 1
  `)
  let tot = 0
  for (const x of a) tot += Number(x.n)
  for (const x of a) {
    console.info(`  ${String(x.hi).padStart(3)}승  ${Number(x.n).toLocaleString().padStart(7)}건  ${pc(Number(x.n), tot)}`)
  }

  console.info('\n══ 2 · ★★정규 종료를 못 채운 경기 = 끊긴 경기★★ ══\n')
  const b = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${M}
    SELECT '경기 (분모)' AS label, count(*) AS n FROM m
    UNION ALL SELECT '★10승을 채우고 끝난 경기 (정상)★', count(*) FROM m WHERE greatest(r,b) >= 10
    UNION ALL SELECT '★★아무도 10승을 못 채우고 끝남★★', count(*) FROM m WHERE greatest(r,b) < 10
    UNION ALL SELECT '  그중 0:0', count(*) FROM m WHERE r = 0 AND b = 0
    UNION ALL SELECT '  그중 한 쪽 0승', count(*) FROM m WHERE greatest(r,b) < 10 AND least(r,b) = 0 AND greatest(r,b) > 0
    UNION ALL SELECT 'is_broken_table = true', count(*) FROM m WHERE broken
  `)
  const d = Number(b[0]!.n)
  for (const x of b) console.info(`  ${x.label.padEnd(34)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 3 · ★끊긴 경기의 점수★ (상위 25) ══\n')
  const c = await prisma.$queryRawUnsafe<{ hi: number; lo: number; n: bigint }[]>(`${M}
    SELECT greatest(r,b) AS hi, least(r,b) AS lo, count(*) AS n
      FROM m WHERE greatest(r,b) < 10 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 25
  `)
  for (const x of c) console.info(`  ${x.hi}:${x.lo}`.padEnd(10) + `${Number(x.n).toLocaleString().padStart(6)}건`)

  /* ── 4 · ★끊긴 경기에서 마지막에 폭탄이 설치돼 있었나★ ────────── */
  console.info('\n══ 4 · ★★끊긴 경기 × 배틀로그 마지막 라운드★★ ══\n')
  const e = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${M},
    ev AS (
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
    SELECT CASE WHEN greatest(m.r,m.b) < 10 THEN 'A ★끊긴 경기★' ELSE 'B 정상 종료' END
             || ' · ' ||
           CASE WHEN lastr.planted AND NOT lastr.defused THEN '마지막 라운드 ★설치·해체X★'
                WHEN lastr.planted THEN '마지막 라운드 설치+해체'
                ELSE '마지막 라운드 설치 없음' END AS label,
           count(*) AS n
      FROM m JOIN lastr ON lastr.k = m.k GROUP BY 1 ORDER BY 1
  `)
  for (const x of e) console.info(`  ${x.label.padEnd(46)} ${Number(x.n).toLocaleString().padStart(6)}건`)

  /* ── 5 · ★끊긴 경기 × dropout★ ─────────────────────────────── */
  console.info('\n══ 5 · ★★끊긴 경기 × 전원 탈주 (리그별)★★ ══\n')
  const f = await prisma.$queryRawUnsafe<
    { league: string; label: string; matches: bigint; out: bigint }[]
  >(`${M},
    side AS (
      SELECT mm."sourceMatchId" AS k, l."slug" AS league, s."side",
             bool_and(s."dropout" IS TRUE) AS allout
        FROM "Match" mm
        JOIN "League" l ON l."id" = mm."leagueId"
        JOIN "MatchPlayerStat" s ON s."matchId" = mm."id"
       WHERE s."dropout" IS NOT NULL
       GROUP BY 1,2,3 HAVING count(*) >= 4
    ),
    per AS (SELECT k, league, bool_or(allout) AS "anyOut" FROM side GROUP BY 1,2)
    SELECT per.league,
           CASE WHEN greatest(m.r,m.b) < 10 THEN 'A ★끊김★' ELSE 'B 정상' END AS label,
           count(*) AS matches, count(*) FILTER (WHERE per."anyOut") AS out
      FROM m JOIN per ON per.k = m.k GROUP BY 1,2 ORDER BY 1,2
  `)
  for (const x of f) {
    const n = Number(x.matches)
    console.info(
      `  ${x.league.padEnd(10)} ${x.label.padEnd(12)} ${n.toLocaleString().padStart(6)}건` +
        `  한 팀 통째 탈주 ${Number(x.out).toLocaleString().padStart(6)} (${pc(Number(x.out), n)})`,
    )
  }

  /* ── 6 · ★리그별 끊긴 비율★ ─────────────────────────────────── */
  console.info('\n══ 6 · ★리그별 「끊긴 경기」 비율★ ══\n')
  const g = await prisma.$queryRawUnsafe<{ league: string; n: bigint; cut: bigint }[]>(`${M}
    SELECT COALESCE(l."slug",'(Match 없음)') AS league, count(*) AS n,
           count(*) FILTER (WHERE greatest(m.r,m.b) < 10) AS cut
      FROM m
      LEFT JOIN "Match" mm ON mm."sourceMatchId" = m.k
      LEFT JOIN "League" l ON l."id" = mm."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of g) {
    const n = Number(x.n)
    console.info(`  ${x.league.padEnd(14)} 경기 ${n.toLocaleString().padStart(7)}  ★끊김 ${Number(x.cut).toLocaleString().padStart(6)} (${pc(Number(x.cut), n)})★`)
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
