/**
 * **조건 ①②③를 겹쳐 센다** — C4 설치·해체 + 전원 탈주 + 경기 길이 (2026-09-03 · 읽기 전용).
 *
 * 두 자료가 겹치는 경기가 6,633건 있다 (배틀로그 원문 ∩ 라인업).
 * ★그 안에서 「설치만 있고 해체 없음」과 「한 팀 전원 나감」이 같이 일어나는지★ 를 본다.
 *
 * 사장님 기준은 ★10판에 1판★ 이다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { planted: boolean | null; defused: boolean | null; whole: boolean; n: bigint; med: number | null }[]
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
    side_drop AS (
      SELECT s."matchId", s."side", count(*) AS n, count(*) FILTER (WHERE s."dropout" IS TRUE) AS d
        FROM "MatchPlayerStat" s GROUP BY 1, 2
    ),
    whole AS (SELECT DISTINCT "matchId" FROM side_drop WHERE n > 0 AND n = d)
    SELECT ev.planted, ev.defused,
           (w."matchId" IS NOT NULL) AS whole,
           count(DISTINCT m."id") AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (m."endAt" - m."startAt"))) AS med
      FROM ev
      JOIN "Match" m ON m."sourceMatchId" = ev."matchKey"
      JOIN "MatchPlayerStat" s2 ON s2."matchId" = m."id"
      LEFT JOIN whole w ON w."matchId" = m."id"
     GROUP BY 1, 2, 3 ORDER BY 4 DESC
  `
  console.info("배틀로그 ∩ 라인업 이 있는 경기 (경기 단위)")
  console.info('  설치  해체  전원탈주   경기수   중앙시간')
  for (const r of rows) {
    const m = r.med === null ? null : Math.round(Number(r.med))
    console.info(
      `  ${String(r.planted).padEnd(5)} ${String(r.defused).padEnd(5)} ${String(r.whole).padEnd(8)} ` +
        `${Number(r.n).toLocaleString().padStart(8)}  ${m === null ? '—' : `${Math.floor(m / 60)}분 ${m % 60}초`}`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
