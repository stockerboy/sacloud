/**
 * **킬·데스가 없는 참가자 224명은 어디서 왔나** — 읽기 전용 (2026-09-03 · O-047).
 *
 * ══ 왜 ══
 *
 * 사장님: «어시스트기록은 모르면 0으로하고 알면 적어라. **킬과데스는 절대 모르면 안된다**»
 *
 * `lineup-gap` 으로 세니 **supply 에 224명**이 있다. 어시스트가 없는 것은 사장님이
 * 허락하셨으니 위반이 아니고, ★킬·데스가 없는 이 224명만★ 이 조건에 걸린다.
 *
 * ══ 무엇을 가르나 ══
 *
 * ```
 * (가) 원본에 안 온다        → ★우리가 못 고친다★
 * (나) 우리가 병합하다 잃는다 → ★고칠 수 있다★ (D-148 「3rd.supply 라인업 + 넥슨 KDA 병합」)
 * ```
 * 갈라 내는 실마리 —
 *   · 그 224명이 **몇 경기에 몰려 있나** (한두 경기면 원본 사고, 흩어져 있으면 규칙 문제)
 *   · 같은 경기의 **다른 참가자는 킬·데스가 있나** (있으면 원본은 줬다는 뜻)
 *   · 그 경기가 **언제 것인가** · `origin` 이 무엇인가
 *
 * ⚠ **읽기만 한다.**
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 1 · 224명이 몇 경기에 몰려 있나 ══\n')
  const spread = await prisma.$queryRaw<
    { matches: bigint; players: bigint; per: number }[]
  >`
    SELECT count(DISTINCT s."matchId") AS matches,
           count(*) AS players,
           round(count(*)::numeric / nullif(count(DISTINCT s."matchId"),0), 2) AS per
      FROM "MatchPlayerStat" s
     WHERE s."kill" IS NULL OR s."death" IS NULL
  `
  const sp = spread[0]!
  console.info(
    `  참가자 ${Number(sp.players)}명 · 경기 ${Number(sp.matches)}건 · 경기당 ${sp.per}명`,
  )

  console.info('\n══ 2 · ★같은 경기의 다른 참가자는 킬·데스가 있나★ ══\n')
  /* 있으면 ★원본은 줬다★ 는 뜻이고, 그러면 (나) 쪽이다 */
  const mixed = await prisma.$queryRaw<
    { total: bigint; all_null: bigint; partial: bigint }[]
  >`
    WITH bad AS (
      SELECT DISTINCT "matchId" FROM "MatchPlayerStat"
       WHERE "kill" IS NULL OR "death" IS NULL
    ),
    counted AS (
      SELECT s."matchId",
             count(*) AS n,
             count(*) FILTER (WHERE s."kill" IS NULL OR s."death" IS NULL) AS nulls
        FROM "MatchPlayerStat" s
        JOIN bad ON bad."matchId" = s."matchId"
       GROUP BY s."matchId"
    )
    SELECT count(*) AS total,
           count(*) FILTER (WHERE n = nulls) AS all_null,
           count(*) FILTER (WHERE n > nulls) AS partial
      FROM counted
  `
  const mx = mixed[0]!
  console.info(`  그 경기들 ${Number(mx.total)}건 중`)
  console.info(`    ★참가자 전원이 null★      ${Number(mx.all_null)}건  ← 원본이 통째로 안 준 모양`)
  console.info(`    ★일부만 null★             ${Number(mx.partial)}건  ← ★원본은 줬는데 일부를 잃은 모양★`)

  console.info('\n══ 3 · 그 경기가 언제·어디서 온 것인가 ══\n')
  const where = await prisma.$queryRaw<
    { league: string; origin: string; ym: string; games: bigint }[]
  >`
    SELECT l."slug" AS league, m."origin" AS origin,
           to_char(m."startAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS ym,
           count(DISTINCT m."id") AS games
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE s."kill" IS NULL OR s."death" IS NULL
     GROUP BY 1, 2, 3 ORDER BY 3
  `
  for (const w of where) {
    console.info(
      `  ${w.ym}  ${w.league.padEnd(9)} ${w.origin.padEnd(16)} ${Number(w.games)}건`,
    )
  }

  console.info('\n══ 4 · ★그 참가자들이 다른 값은 갖고 있나★ ══\n')
  /* 딜량·헤드샷·원본증감이 있으면 ★그 행이 원본에서 오긴 왔다★ 는 뜻이다 */
  const cols = await prisma.$queryRaw<
    { n: bigint; dmg: bigint; hs: bigint; srd: bigint; asst: bigint }[]
  >`
    SELECT count(*) AS n,
           count("damage") AS dmg,
           count("headshot") AS hs,
           count("sourceRatingDelta") AS srd,
           count("assist") AS asst
      FROM "MatchPlayerStat"
     WHERE "kill" IS NULL OR "death" IS NULL
  `
  const c = cols[0]!
  console.info(`  참가자 ${Number(c.n)}명 중 값이 있는 칸`)
  console.info(`    딜량 ${Number(c.dmg)} · 헤드샷 ${Number(c.hs)} · 원본증감 ${Number(c.srd)} · 어시스트 ${Number(c.asst)}`)
  console.info(
    '\n  ⚠ 다른 칸이 다 비었으면 ★원본이 그 사람을 통째로 안 준 것★ 이고,\n' +
      '    다른 칸은 있는데 킬·데스만 없으면 ★우리가 그 두 칸만 잃은 것★ 이다',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
