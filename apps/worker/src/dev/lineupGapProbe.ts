/**
 * **경기 상세가 얼마나 비어 있나** — 읽기 전용 (2026-09-03).
 *
 * ══ 왜 ══
 *
 * 사장님:
 * > «경기상세에 **아이템쓰고 탈주한 사람은 0/0/0 으로 찍히는 문제**를 해결했냐.
 * >  **모든 10명이 아이템 사용여부와 관계 없이 기록이 전부와야한다.**
 * >  그리고 **어시스트기록은 모르면 0으로하고 알면 적어라. 킬과데스는 절대 모르면 안된다**»
 *
 * ★조건이 둘로 갈린다★
 * ```
 * 어시스트  모르면 0 이어도 된다
 * 킬·데스   ★절대 모르면 안 된다★
 * ```
 * 그래서 **어시스트와 킬/데스를 갈라서 센다.** 한 덩어리로 세면 답이 안 나온다.
 *
 * ⚠ **읽기만 한다. 고치지 않는다.**
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 1 · ★참가자가 10명이 안 되는 경기★ ══\n')
  const size = await prisma.$queryRaw<{ league: string; n: bigint; games: bigint }[]>`
    SELECT l."slug" AS league, cnt AS n, count(*) AS games FROM (
      SELECT m."id", m."leagueId", count(s."id") AS cnt
        FROM "Match" m
        LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       GROUP BY m."id", m."leagueId"
    ) t
    JOIN "League" l ON l."id" = t."leagueId"
    GROUP BY 1, 2 ORDER BY 1, 2
  `
  const byLeague = new Map<string, { total: number; full: number; zero: number }>()
  for (const r of size) {
    const cur = byLeague.get(r.league) ?? { total: 0, full: 0, zero: 0 }
    const games = Number(r.games)
    cur.total += games
    if (Number(r.n) === 10) cur.full += games
    if (Number(r.n) === 0) cur.zero += games
    byLeague.set(r.league, cur)
  }
  for (const [lg, v] of byLeague) {
    console.info(
      `  ${lg.padEnd(9)} 경기 ${v.total.toLocaleString().padStart(8)} · ` +
        `10명 ${v.full.toLocaleString().padStart(8)} (${((v.full / v.total) * 100).toFixed(1)}%) · ` +
        `★라인업 0명 ${v.zero.toLocaleString()}★`,
    )
  }

  console.info('\n══ 2 · ★0/0/0 인 참가자★ (사장님 질문) ══\n')
  const kda = await prisma.$queryRaw<
    { league: string; total: bigint; zero3: bigint; kd_null: bigint; a_null: bigint }[]
  >`
    SELECT l."slug" AS league,
           count(*) AS total,
           count(*) FILTER (WHERE s."kill" = 0 AND s."death" = 0 AND coalesce(s."assist",0) = 0) AS zero3,
           count(*) FILTER (WHERE s."kill" IS NULL OR s."death" IS NULL) AS kd_null,
           count(*) FILTER (WHERE s."assist" IS NULL) AS a_null
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 1
  `
  for (const r of kda) {
    const t = Number(r.total)
    console.info(
      `  ${r.league.padEnd(9)} 참가자 ${t.toLocaleString().padStart(9)} · ` +
        `0/0/0 ${Number(r.zero3).toLocaleString().padStart(7)} (${((Number(r.zero3) / t) * 100).toFixed(1)}%)`,
    )
    console.info(
      `  ${''.padEnd(9)} ★킬·데스가 없는(null) 참가자 ${Number(r.kd_null).toLocaleString()}★ · ` +
        `어시스트 null ${Number(r.a_null).toLocaleString()}`,
    )
  }

  console.info('\n══ 3 · ★0/0/0 이 탈주인가★ ══\n')
  /* `dropout` 칸이 있으면 「아이템 쓰고 탈주」와 이어지는지 본다 */
  const drop = await prisma.$queryRaw<{ zero3: bigint; zero3_drop: bigint; drop: bigint }[]>`
    SELECT count(*) FILTER (WHERE "kill" = 0 AND "death" = 0 AND coalesce("assist",0) = 0) AS zero3,
           count(*) FILTER (WHERE "kill" = 0 AND "death" = 0 AND coalesce("assist",0) = 0
                              AND "dropout" IS TRUE) AS zero3_drop,
           count(*) FILTER (WHERE "dropout" IS TRUE) AS drop
      FROM "MatchPlayerStat"
  `
  const d = drop[0]!
  console.info(`  0/0/0 참가자            ${Number(d.zero3).toLocaleString()}명`)
  console.info(`  그중 탈주 표시가 있는 사람 ${Number(d.zero3_drop).toLocaleString()}명`)
  console.info(`  탈주 표시 전체           ${Number(d.drop).toLocaleString()}명`)
  console.info(
    '\n  ⚠ ★`dropout` 은 3rd.supply 가 주는 값이다★ (`supplyMirrorParse.ts:510` — 그대로 넣는다).
    ⚠ 여기 「넥슨이 안 주는 값」이라고 적었는데 ★그건 넥슨 이야기였다.★ 이 칸은 미러에서 온다 (2026-09-03 정정)',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
