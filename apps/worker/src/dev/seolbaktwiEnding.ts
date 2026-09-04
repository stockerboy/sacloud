/**
 * ★★설박튀 — 「경기가 어떻게 끝났나」로 찾는다★★ (2026-09-04 · ★읽기 전용★).
 *
 * ══ 왜 다른 길로 가나 ══
 *
 * 라운드 결과로는 ★한 건도 안 나왔다★ —
 * 설치 44,378라운드 중 「해체X 인데 설치팀 패」가 ★1개★ 다.
 * 넥슨 배틀로그는 ★폭탄 논리를 어기는 라운드를 아예 안 적는다.★
 * 즉 설박튀 라운드는 ★이상하게 적히는 게 아니라 안 적히거나 정상처럼 적힌다.★
 *
 * 그래서 ★라운드가 아니라 「경기의 끝」★ 을 본다.
 * ```
 * 정상   한 팀이 승리 라운드 수를 채우고 끝난다 (점수가 정해진 곳에서 멈춘다)
 * 설박튀 ★한 팀이 통째로 사라져서 그 자리에서 끊긴다★ → ★점수가 어중간하다★
 * ```
 * 여기서는 ★판정하지 않고★ 분포만 낸다. 그리고 `MatchPlayerStat.dropout` 과 맞대 본다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`

const SCORE = `
  WITH ev AS (
    SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
           NULLIF(e->>'team_no','')     AS team,
           NULLIF(e->>'win_team_no','') AS wtn,
           e->>'win_flag' AS flag,
           e->>'weapon' AS w, e->>'target_weapon' AS tw,
           NULLIF(e->>'target_team_no','') AS tteam
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} AND COALESCE(e->>'round','') <> ''
  ),
  pr AS (
    SELECT k, rnd,
           COALESCE(max(wtn),
                    CASE WHEN count(DISTINCT CASE WHEN flag='win' THEN team END) = 1
                         THEN max(CASE WHEN flag='win' THEN team END) END) AS winner,
           bool_or(w = 'c4-install'   OR tw = 'c4-install')   AS planted,
           bool_or(w = 'c4-dismantle' OR tw = 'c4-dismantle') AS defused
      FROM ev GROUP BY 1,2
  ),
  mt AS (
    SELECT k,
           count(*)                                   AS rounds,
           count(*) FILTER (WHERE winner IS NOT NULL) AS known,
           count(*) FILTER (WHERE winner = '0')       AS w0,
           count(*) FILTER (WHERE winner = '1')       AS w1,
           max(rnd)                                   AS lastRnd,
           bool_or(rnd = mx AND planted AND NOT defused) AS lastPlantNoDef,
           bool_or(rnd = mx AND winner IS NULL)          AS lastUnknown
      FROM (SELECT pr.*, max(rnd) OVER (PARTITION BY k) AS mx FROM pr) pr
     GROUP BY 1
  )`

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  console.info('══ 1 · ★경기의 최종 라운드 점수 분포★ (승패를 다 아는 경기만) ══\n')
  const s = await prisma.$queryRawUnsafe<{ hi: number; lo: number; n: bigint }[]>(`${SCORE}
    SELECT greatest(w0,w1) AS hi, least(w0,w1) AS lo, count(*) AS n
      FROM mt WHERE known = rounds
     GROUP BY 1,2 ORDER BY 3 DESC LIMIT 25
  `)
  let tot = 0
  for (const x of s) tot += Number(x.n)
  for (const x of s) {
    console.info(`  ${x.hi}:${x.lo}`.padEnd(10) + `${Number(x.n).toLocaleString().padStart(7)}건  ${pc(Number(x.n), tot)}`)
  }

  console.info('\n══ 2 · ★이긴 쪽 라운드 수★ — 어디서 끝나는 게 정상인가 ══\n')
  const h = await prisma.$queryRawUnsafe<{ hi: number; n: bigint; matches: bigint }[]>(`${SCORE}
    SELECT greatest(w0,w1) AS hi, count(*) AS n, count(*) AS matches
      FROM mt WHERE known = rounds GROUP BY 1 ORDER BY 1
  `)
  for (const x of h) console.info(`  ${String(x.hi).padStart(3)}승에서 끝남   ${Number(x.n).toLocaleString().padStart(7)}건`)

  console.info('\n══ 3 · ★끝이 이상한 경기★ ══\n')
  const w = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${SCORE}
    SELECT '배틀로그 경기 (분모)' AS label, count(*) AS n FROM mt
    UNION ALL SELECT '라운드 승패를 전부 아는 경기', count(*) FROM mt WHERE known = rounds
    UNION ALL SELECT '★이긴 쪽이 정규 승수(7 이상)에 못 미침★', count(*) FROM mt
       WHERE known = rounds AND greatest(w0,w1) < 7
    UNION ALL SELECT '★마지막 라운드가 설치·해체X★', count(*) FROM mt WHERE lastPlantNoDef
    UNION ALL SELECT '★마지막 라운드 승자를 모름★', count(*) FROM mt WHERE lastUnknown
    UNION ALL SELECT '★둘 다 (마지막 설치·해체X + 승자모름)★', count(*) FROM mt
       WHERE lastPlantNoDef AND lastUnknown
  `)
  const d = Number(w[0]!.n)
  for (const x of w) console.info(`  ${x.label.padEnd(40)} ${Number(x.n).toLocaleString().padStart(7)}건 ${pc(Number(x.n), d)}`)

  console.info('\n══ 4 · ★dropout 과 맞대기★ — 끝이 이상한 경기에서 전원 탈주가 더 잦은가 ══\n')
  const dr = await prisma.$queryRawUnsafe<
    { league: string; label: string; matches: bigint; teamOut: bigint }[]
  >(`${SCORE},
    side AS (
      SELECT m."sourceMatchId" AS k, l."slug" AS league, s."side",
             bool_and(s."dropout" IS TRUE) AS allOut
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       WHERE s."dropout" IS NOT NULL
       GROUP BY 1,2,3 HAVING count(*) >= 4
    ),
    per AS (SELECT k, league, bool_or(allOut) AS "anyTeamOut" FROM side GROUP BY 1,2)
    SELECT per.league,
           CASE WHEN mt.known = mt.rounds AND greatest(mt.w0,mt.w1) < 7
                THEN 'A ★어중간하게 끝남★' ELSE 'B 정상 종료' END AS label,
           count(*) AS matches,
           count(*) FILTER (WHERE per."anyTeamOut") AS "teamOut"
      FROM mt JOIN per ON per.k = mt.k
     GROUP BY 1,2 ORDER BY 1,2
  `)
  for (const x of dr) {
    const n = Number(x.matches)
    console.info(
      `  ${x.league.padEnd(10)} ${x.label.padEnd(22)} ${n.toLocaleString().padStart(6)}건` +
        `  ★한 팀 통째 탈주 ${Number(x.teamOut).toLocaleString().padStart(6)} (${pc(Number(x.teamOut), n)})★`,
    )
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
