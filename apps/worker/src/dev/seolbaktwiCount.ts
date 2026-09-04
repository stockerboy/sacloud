/**
 * ★★설박튀 — 라운드 단위로 센다★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * ══ 낱말을 바로잡았다 (2026-09-04) ══
 *
 * 폭탄 행은 ★두 가지 모양★ 으로 온다. 같은 사건을 보는 자리가 다를 뿐이다.
 * ```
 * 모양1  조회 클랜 선수가 한 것
 *        event_type='bomb' · weapon='c4-install'|'c4-dismantle' · team_no=행위자 팀
 *        win_team_no 없음 · win_flag 가 team_no 의 승패
 * 모양2  상대 클랜 선수가 한 것
 *        event_text='C4 설치'|'C4 해체' · target_weapon='c4-install'|'c4-dismantle'
 *        target_team_no=행위자 팀 · ★win_team_no 가 그 라운드 승자★
 * ```
 * ★그래서 설치를 세려면 weapon 과 target_weapon 을 ★둘 다★ 봐야 한다.★
 *
 * 앞선 조사가 틀린 곳 —
 * ```
 * ✗ event_text='C4 설치' 만 센다        → 모양1(상대편 아닌 쪽)을 통째로 놓친다
 * ✗ event_type='bomb' = 설치            → ★bomb 에는 해체도 들어 있다★ (weapon 으로 갈린다)
 * ✗ event_text 로 한글 비교              → ★'C4 ��체' 로 깨진 행이 실재한다★
 * ```
 *
 * ══ 세는 조건 (사장님 2026-09-04) ══
 * ```
 * ① 그 라운드에 폭탄이 설치됐다
 * ② 그 라운드에 해체 기록이 없다
 * ③ ★설치한 팀이 그 라운드를 졌다★
 *    해체가 없으면 폭탄은 터진다 → 설치팀이 이겨야 정상.
 *    ★진 것은 「터지기 전에 사라졌다」는 뜻이다.★
 * ```
 * ★③ 이 「레드 전원 퇴장」의 대리 지표다.★ 퇴장 이벤트 자체는 배틀로그에 ★없다★.
 * 그래서 아래 4장에서 `MatchPlayerStat.dropout` 과 맞대 본다.
 */
import { prisma } from '@sacloud/db'

const OK = `r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'`

/** 라운드마다 설치·해체·설치팀·승자를 뽑아 둔다 */
const ROUNDS = `
  WITH ev AS (
    SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
           e->>'weapon' AS w, e->>'target_weapon' AS tw,
           NULLIF(e->>'team_no','')        AS team,
           NULLIF(e->>'target_team_no','') AS tteam,
           NULLIF(e->>'win_team_no','')    AS wtn,
           e->>'win_flag' AS flag
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE ${OK} AND COALESCE(e->>'round','') <> ''
  ),
  pr AS (
    SELECT k, rnd,
           bool_or(w = 'c4-install'   OR tw = 'c4-install')   AS planted,
           bool_or(w = 'c4-dismantle' OR tw = 'c4-dismantle') AS defused,
           /* 설치한 팀 — 모양1 이면 team_no, 모양2 면 target_team_no */
           max(COALESCE(CASE WHEN w  = 'c4-install' THEN team  END,
                        CASE WHEN tw = 'c4-install' THEN tteam END))          AS planter,
           /* 승자 — 모양2 의 win_team_no 가 직접 준다 */
           max(wtn)                                                            AS winByNo,
           /* 승자 — win_flag='win' 인 행의 팀 (모양1 대비) */
           max(CASE WHEN flag = 'win' THEN team END)                           AS winByFlag,
           count(DISTINCT CASE WHEN flag = 'win' THEN team END)                AS nWinFlag
      FROM ev GROUP BY 1,2
  ),
  pr2 AS (
    SELECT pr.*,
           COALESCE(winByNo, CASE WHEN nWinFlag = 1 THEN winByFlag END) AS winner,
           max(rnd) OVER (PARTITION BY k) AS lastRnd
      FROM pr
  )`

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  /* ── 1 · 바탕 숫자 ─────────────────────────────────────────── */
  console.info('══ 1 · ★바탕 (낱말 바로잡은 뒤)★ ══\n')
  const base = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${ROUNDS}
    SELECT '경기' AS label, count(DISTINCT k) AS n FROM pr2
    UNION ALL SELECT '라운드', count(*) FROM pr2
    UNION ALL SELECT '★설치된 라운드★', count(*) FROM pr2 WHERE planted
    UNION ALL SELECT '해체된 라운드', count(*) FROM pr2 WHERE defused
    UNION ALL SELECT '설치·해체X 라운드', count(*) FROM pr2 WHERE planted AND NOT defused
    UNION ALL SELECT '설치팀을 아는 라운드', count(*) FROM pr2 WHERE planted AND planter IS NOT NULL
    UNION ALL SELECT '승자를 아는 라운드', count(*) FROM pr2 WHERE winner IS NOT NULL
    UNION ALL SELECT '설치 · 설치팀·승자 둘 다 앎', count(*) FROM pr2
       WHERE planted AND planter IS NOT NULL AND winner IS NOT NULL
  `)
  for (const x of base) console.info(`  ${x.label.padEnd(30)} ${Number(x.n).toLocaleString().padStart(9)}`)

  /* ── 2 · ★설치 라운드가 어떻게 끝났나★ ─────────────────────── */
  console.info('\n══ 2 · ★★설치된 라운드의 결말★★ ══\n')
  const end = await prisma.$queryRawUnsafe<{ label: string; rounds: bigint; matches: bigint }[]>(`${ROUNDS}
    SELECT CASE
      WHEN planter IS NULL OR winner IS NULL THEN 'x 설치팀/승자 모름'
      WHEN defused AND winner <> planter THEN 'a 해체됨 · 수비팀 승 (정상)'
      WHEN defused                       THEN 'b ★해체됐는데 설치팀 승★'
      WHEN winner = planter              THEN 'c 해체X · 설치팀 승 (터짐 · 정상)'
      ELSE                                    'd ★★해체X · 설치팀 패 = 설박튀 후보★★'
      END AS label,
      count(*) AS rounds, count(DISTINCT k) AS matches
      FROM pr2 WHERE planted GROUP BY 1 ORDER BY 1
  `)
  let tr = 0
  for (const x of end) tr += Number(x.rounds)
  for (const x of end) {
    console.info(
      `  ${x.label.padEnd(38)} 라운드 ${Number(x.rounds).toLocaleString().padStart(7)} ${pc(Number(x.rounds), tr).padStart(6)}` +
        `  경기 ${Number(x.matches).toLocaleString().padStart(6)}`,
    )
  }

  /* ── 3 · ★후보가 전체 경기의 몇 %인가★ ─────────────────────── */
  console.info('\n══ 3 · ★★후보 경기 비율★★ ══\n')
  const share = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`${ROUNDS}
    SELECT '배틀로그 있는 경기 (분모)' AS label, count(DISTINCT k) AS n FROM pr2
    UNION ALL SELECT '★후보가 한 라운드라도 있는 경기★', count(DISTINCT k) FROM pr2
      WHERE planted AND NOT defused AND planter IS NOT NULL AND winner IS NOT NULL AND winner <> planter
    UNION ALL SELECT '  그중 ★마지막 라운드★ 에서 난 경기', count(DISTINCT k) FROM pr2
      WHERE planted AND NOT defused AND planter IS NOT NULL AND winner IS NOT NULL
        AND winner <> planter AND rnd = lastRnd
  `)
  const denom = Number(share[0]!.n)
  for (const x of share) {
    console.info(`  ${x.label.padEnd(38)} ${Number(x.n).toLocaleString().padStart(7)}건  ${pc(Number(x.n), denom)}`)
  }
  console.info('\n  ⚠ 사장님 기준 ★10판에 1판(10%)★')

  /* ── 4 · ★리그별★ ────────────────────────────────────────── */
  console.info('\n══ 4 · ★리그별★ ══\n')
  const lg = await prisma.$queryRawUnsafe<{ league: string; matches: bigint; cand: bigint; last: bigint }[]>(`${ROUNDS},
    cand AS (
      SELECT k,
             bool_or(planted AND NOT defused AND planter IS NOT NULL
                     AND winner IS NOT NULL AND winner <> planter) AS c,
             bool_or(planted AND NOT defused AND planter IS NOT NULL
                     AND winner IS NOT NULL AND winner <> planter AND rnd = lastRnd) AS cl
        FROM pr2 GROUP BY 1
    )
    SELECT COALESCE(l."slug",'(Match 없음)') AS league,
           count(DISTINCT cand.k) AS matches,
           count(DISTINCT cand.k) FILTER (WHERE cand.c)  AS cand,
           count(DISTINCT cand.k) FILTER (WHERE cand.cl) AS last
      FROM cand
      LEFT JOIN "Match" m  ON m."sourceMatchId" = cand.k
      LEFT JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `)
  for (const x of lg) {
    const n = Number(x.matches)
    console.info(
      `  ${x.league.padEnd(14)} 경기 ${n.toLocaleString().padStart(7)}` +
        `  ★후보 ${Number(x.cand).toLocaleString().padStart(6)} (${pc(Number(x.cand), n)})★` +
        `  마지막라운드 ${Number(x.last).toLocaleString().padStart(6)} (${pc(Number(x.last), n)})`,
    )
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
