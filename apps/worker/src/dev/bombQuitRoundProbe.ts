/**
 * **라운드 단위로 설박튀를 가려낸다** (2026-09-03 · 읽기 전용 · 콜 0개).
 *
 * ══ 「C4 폭발」 이벤트는 ★없다★ ══
 *
 * 배틀로그 낱말은 `C4 설치`(12,349) · `C4 해체`(1,983) · `자살` · `낙사` 뿐이다.
 * ★그런데 폭발을 몰라도 된다 — 더 좋은 칸이 있다.★
 * ```
 * round         라운드 번호
 * win_team_no   ★그 라운드를 이긴 팀★
 * team_no       그 이벤트를 낸 사람의 팀
 * ```
 *
 * ══ 그래서 이렇게 가른다 ══
 *
 * ```
 * 정상   설치 → 해체 안 됨 → 터진다 → ★설치한 팀이 그 라운드를 이긴다★
 * 설박튀 설치 → 해체 안 됨 → ★그런데 설치한 팀이 그 라운드를 진다★
 *        = 터지기 전에 나갔다는 뜻이다 (사장님: 인게임은 블루 승리가 맞다)
 * ```
 * ★폭발 이벤트가 없어도 「설치했는데 그 라운드를 졌다」로 잡힌다.★
 *
 * ⚠ **읽기만 한다.**
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 1 · 라운드 단위 — 설치했는데 그 라운드를 졌는가 ══\n')
  const rows = await prisma.$queryRaw<{ label: string; rounds: bigint; matches: bigint }[]>`
    WITH ev AS (
      SELECT r."matchKey",
             (e->>'round')::int        AS rnd,
             e->>'event_text'          AS txt,
             e->>'team_no'             AS team_no,
             e->>'win_team_no'         AS win_team_no
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok'
    ),
    per_round AS (
      SELECT "matchKey", rnd,
             max(NULLIF(win_team_no, '')) AS winner,
             max(NULLIF(team_no, '')) FILTER (WHERE txt = 'C4 설치') AS planter,
             bool_or(COALESCE(txt, '') = 'C4 설치') AS planted,
             bool_or(COALESCE(txt, '') = 'C4 해체') AS defused
        FROM ev GROUP BY 1, 2
    )
    SELECT CASE
             WHEN NOT planted THEN '설치 없음'
             WHEN defused THEN '설치 + 해체됨'
             WHEN winner IS NULL THEN '설치 · 해체X · ★승자 모름★'
             WHEN winner = planter THEN '설치 · 해체X · 설치팀 승 (정상=터짐)'
             ELSE '★설치 · 해체X · 설치팀 패★ (설박튀 모양)'
           END AS label,
           count(*) AS rounds,
           count(DISTINCT "matchKey") AS matches
      FROM per_round GROUP BY 1 ORDER BY 2 DESC
  `
  for (const r of rows) {
    console.info(
      `  ${r.label.padEnd(38)} 라운드 ${Number(r.rounds).toLocaleString().padStart(8)} · 경기 ${Number(r.matches).toLocaleString().padStart(6)}`,
    )
  }

  console.info('\n══ 2 · ★그 모양이 「마지막 라운드」에 있는 경기★ ══\n')
  /* 설박튀는 경기가 그때 끝난다. 마지막 라운드여야 말이 된다 */
  const last = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH ev AS (
      SELECT r."matchKey", (e->>'round')::int AS rnd, e->>'event_text' AS txt,
             e->>'team_no' AS team_no, e->>'win_team_no' AS win_team_no
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok'
    ),
    per_round AS (
      SELECT "matchKey", rnd,
             max(NULLIF(win_team_no, '')) AS winner,
             max(NULLIF(team_no, '')) FILTER (WHERE txt = 'C4 설치') AS planter,
             bool_or(COALESCE(txt, '') = 'C4 설치') AS planted,
             bool_or(COALESCE(txt, '') = 'C4 해체') AS defused
        FROM ev GROUP BY 1, 2
    ),
    tagged AS (
      SELECT p.*, (p.rnd = max(p.rnd) OVER (PARTITION BY p."matchKey")) AS is_last
        FROM per_round p
    )
    SELECT '전체 경기' AS label, count(DISTINCT "matchKey") AS n FROM tagged
    UNION ALL
    SELECT '★마지막 라운드가 「설치·해체X·설치팀 패」★',
           count(DISTINCT "matchKey")
      FROM tagged
     WHERE is_last AND planted AND NOT defused AND winner IS NOT NULL AND winner <> planter
    UNION ALL
    SELECT '  (아무 라운드나 그 모양)',
           count(DISTINCT "matchKey")
      FROM tagged
     WHERE planted AND NOT defused AND winner IS NOT NULL AND winner <> planter
  `
  const base = Number(last.find((r) => r.label === '전체 경기')!.n)
  for (const r of last) {
    console.info(
      `  ${r.label.padEnd(40)} ${Number(r.n).toLocaleString().padStart(6)}건  ${((Number(r.n) / base) * 100).toFixed(1)}%`,
    )
  }
  console.info('\n  ⚠ 사장님 기준 ★10판에 1판(10%)★ 과 견준다')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
