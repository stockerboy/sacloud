/**
 * **설박튀 ① × ② 겹쳐 세기** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 빈 칸이 뭐였나 ══
 *
 * `bombQuitCountProbe` 는 ①(C4 설치·해체)과 ②(전원 탈주)를 ★따로만 셌다.★
 * 겹치는 경기가 6,633건 있는데 ★교집합을 안 셌다.★ 여기서 센다.
 *
 * ══ ★오늘 생긴 잣대★ ══
 *
 * 오늘 `dropoutMeaningProbe` 에서 확인한 것 —
 * ```
 * ★한 팀이 통째로 나간 경우, 그 팀의 100.0% 가 진 팀★ (95,488 + 62,226팀 · 예외 0)
 * ★이긴 팀이 나가는 일은 0.3~1.0% 뿐★
 * ```
 * ★그래서 「이긴 팀이 나갔다」가 아주 드문 사건이 됐고, 그게 잣대가 된다.★
 *
 * 설박튀는 ★설치해 놓고 나가는 것★ 이다 — 해체가 없으면 폭탄이 터져 ★설치한 쪽이 이긴다.★
 * 즉 설박튀가 진짜로 있다면 「설치만 있고 해체 없는 경기」에서
 * ★이긴 팀이 나간 비율이 평소(0.3~1%)보다 확 높아야 한다.★
 * ★안 높으면 ①과 ②는 서로 다른 것을 재고 있는 것이다.★
 *
 * ⚠ 그리고 먼저 확인할 것 — ★배틀로그는 IPL(nolink) 것인데 IPL 은 dropout 이 전부 null 이다.★
 *   그런데도 6,633건이 「라인업이 있다」고 나왔다. ★같은 경기가 다른 리그에도 있어서★ 다.
 *   ★어느 리그의 행과 겹치는지부터 밝힌다.★ 안 밝히면 교집합이 무슨 뜻인지 모른다.
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  /* ── 0 · 겹치는 행이 어느 리그 것인가 ────────────────────────── */
  console.info('══ 0 · ★배틀로그와 겹치는 Match 는 어느 리그 것인가★ ══\n')
  const where = await prisma.$queryRaw<{ league: string; matches: bigint; withDrop: bigint }[]>`
    WITH keys AS (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw" WHERE "status" = 'ok')
    SELECT l."slug" AS league,
           count(DISTINCT m."id")                                         AS matches,
           count(DISTINCT m."id") FILTER (WHERE s."dropout" IS NOT NULL)  AS "withDrop"
      FROM keys k
      JOIN "Match" m  ON m."sourceMatchId" = k."matchKey"
      JOIN "League" l ON l."id" = m."leagueId"
      LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const r of where) {
    console.info(
      `  ${r.league.padEnd(8)} 경기 ${Number(r.matches).toLocaleString().padStart(7)}건` +
        `  ★탈주 값이 있는 것 ${Number(r.withDrop).toLocaleString()}건★`,
    )
  }
  console.info(
    '\n  ⚠ ★nolink 는 탈주가 전부 null 이다★ — 겹치는 값은 ★다른 리그의 같은 경기★ 에서 온다',
  )

  /* ── 1 · ★교집합★ — C4 상태별로 「누가 나갔나」 ─────────────────── */
  console.info('\n══ 1 · ★★C4 상태별로 「나간 팀이 이긴 팀인가」★★ ══\n')
  console.info('  잣대 — 평소 ★이긴 팀이 통째로 나가는 일은 0.3~1%★ 뿐이다\n')
  const cross = await prisma.$queryRaw<
    {
      label: string
      league: string
      matches: bigint
      loserOut: bigint
      winnerOut: bigint
      bothOut: bigint
      medSec: number | null
    }[]
  >`
    WITH ev AS (
      SELECT r."matchKey",
             bool_or(e->>'event_text' = 'C4 설치') AS planted,
             bool_or(e->>'event_text' = 'C4 해체') AS defused
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok'
       GROUP BY 1
    ),
    side AS (
      SELECT m."id" AS "matchId", l."slug" AS league, m."sourceMatchId",
             m."endAt", m."startAt", s."side",
             bool_and(s."dropout" IS TRUE)      AS "allOut",
             bool_or(m."winnerSide" = s."side") AS won
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       WHERE s."dropout" IS NOT NULL
       GROUP BY 1, 2, 3, 4, 5, 6
      HAVING count(*) >= 4
    ),
    per AS (
      SELECT "matchId", league, "sourceMatchId", "endAt", "startAt",
             bool_or("allOut" AND NOT won) AS "loserOut",
             bool_or("allOut" AND won)     AS "winnerOut"
        FROM side GROUP BY 1, 2, 3, 4, 5
    )
    SELECT CASE WHEN ev.planted AND NOT ev.defused THEN 'A 설치만 (해체 없음)'
                WHEN ev.planted AND ev.defused     THEN 'B 설치 + 해체'
                ELSE                                    'C 설치 없음' END AS label,
           per.league,
           count(*)                                                    AS matches,
           count(*) FILTER (WHERE per."loserOut"  AND NOT per."winnerOut") AS "loserOut",
           count(*) FILTER (WHERE per."winnerOut" AND NOT per."loserOut")  AS "winnerOut",
           count(*) FILTER (WHERE per."winnerOut" AND per."loserOut")      AS "bothOut",
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (per."endAt" - per."startAt"))
           )::float                                                    AS "medSec"
      FROM per JOIN ev ON ev."matchKey" = per."sourceMatchId"
     GROUP BY 1, 2 ORDER BY 2, 1
  `
  if (cross.length === 0) {
    console.info('  ★겹치는 경기가 없다★')
  }
  for (const r of cross) {
    const n = Number(r.matches)
    const w = Number(r.winnerOut)
    console.info(
      `  ${r.league.padEnd(8)} ${r.label.padEnd(20)} ${n.toLocaleString().padStart(6)}건` +
        `  진 팀만 ${pc(Number(r.loserOut), n)}` +
        `  ★이긴 팀만 ${pc(w, n)}★` +
        `  양쪽 ${pc(Number(r.bothOut), n)}` +
        `  길이중앙 ${r.medSec === null ? '—' : `${Math.round(r.medSec / 60)}분`}`,
    )
  }

  console.info(
    '\n  ★읽는 법★ — A(설치만) 의 「이긴 팀만」이 C(설치없음) 보다 확 높으면 ★설박튀가 실재한다★.\n' +
      '            비슷하면 ★①과 ②는 서로 다른 것을 재고 있다★ (겹쳐 세면 안 된다)',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
