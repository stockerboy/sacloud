/**
 * **IPL 에 딜량·어시·헤드샷이 있는가** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 보나 ══
 *
 * `dropoutScope.ts` 는 ★`damage > 0` 으로 탈주 행을 걸러낸다.★ 그 근거는 —
 * > «damage = 0 이고 dropout = true 122,200행 · dropout = false 1,976행 → 98.4% 일치»
 *
 * ★그런데 그 실측은 미러(supply·sanply)에서 잰 것이다.★
 * IPL(`nolink`)은 ★병영수첩에서 오고 `dropout` 이 전부 null★ 인 것을 방금 확인했다.
 * 그러면 ★`damage` 도 없을 수 있다.★ 그런데 그 조건을 거는 자리는 리그를 안 가린다 —
 * ```
 * playedGamesWhere()  샷싸움 축 (판당 평균 딜량)
 * notZeroedWhere()    누적 어시 · 헤드샷
 * ```
 * ★없는데 `damage > 0` 을 걸면 IPL 선수는 그 축이 통째로 사라진다.★
 * ★0 인데 안 걸면 IPL 선수의 딜량이 0 으로 평균에 들어간다.★ 둘 다 조용히 틀린다.
 *
 * ⚠ ★고치지 않는다.★ 무엇인지만 밝힌다.
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  console.info('══ 리그별 칸 채움 — ★null 인가 · 0 인가 · 값이 있나★ ══\n')
  const rows = await prisma.$queryRaw<
    {
      league: string
      n: bigint
      dmgNull: bigint
      dmgZero: bigint
      dmgPos: bigint
      asNull: bigint
      asZero: bigint
      hsNull: bigint
      hsZero: bigint
      wpNull: bigint
    }[]
  >`
    SELECT l."slug" AS league, count(*) AS n,
           count(*) FILTER (WHERE s."damage"   IS NULL) AS "dmgNull",
           count(*) FILTER (WHERE s."damage"   = 0)     AS "dmgZero",
           count(*) FILTER (WHERE s."damage"   > 0)     AS "dmgPos",
           count(*) FILTER (WHERE s."assist"   IS NULL) AS "asNull",
           count(*) FILTER (WHERE s."assist"   = 0)     AS "asZero",
           count(*) FILTER (WHERE s."headshot" IS NULL) AS "hsNull",
           count(*) FILTER (WHERE s."headshot" = 0)     AS "hsZero",
           count(*) FILTER (WHERE s."weapon"   IS NULL) AS "wpNull"
      FROM "MatchPlayerStat" s
      JOIN "Match" m  ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const r of rows) {
    const n = Number(r.n)
    console.info(`  ★${r.league}★  ${n.toLocaleString()}행`)
    console.info(
      `      딜량    null ${pc(Number(r.dmgNull), n)}  0 ${pc(Number(r.dmgZero), n)}` +
        `  ★값 있음 ${pc(Number(r.dmgPos), n)}★`,
    )
    console.info(
      `      어시    null ${pc(Number(r.asNull), n)}  0 ${pc(Number(r.asZero), n)}` +
        `      헤드샷  null ${pc(Number(r.hsNull), n)}  0 ${pc(Number(r.hsZero), n)}`,
    )
    console.info(`      무기    null ${pc(Number(r.wpNull), n)}  ← 스나/라플을 아는가`)
  }

  /* IPL 에 킬은 있는데 딜이 없나 — 「모르는 값」인지 「진짜 0」인지 가른다 */
  console.info('\n══ ★킬을 냈는데 딜이 0/없다면 그건 「모르는 값」이다★ ══\n')
  const contra = await prisma.$queryRaw<{ league: string; killNoDmg: bigint; kills: bigint }[]>`
    SELECT l."slug" AS league,
           count(*) FILTER (WHERE s."kill" > 0
                              AND (s."damage" IS NULL OR s."damage" = 0)) AS "killNoDmg",
           count(*) FILTER (WHERE s."kill" > 0)                           AS kills
      FROM "MatchPlayerStat" s
      JOIN "Match" m  ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 1
  `
  for (const r of contra) {
    console.info(
      `  ${r.league.padEnd(8)} 킬 낸 행 ${Number(r.kills).toLocaleString().padStart(9)}` +
        `  그중 ★딜이 0/없음 ${Number(r.killNoDmg).toLocaleString()}★` +
        ` ${pc(Number(r.killNoDmg), Number(r.kills))}`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
