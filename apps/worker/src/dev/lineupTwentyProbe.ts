/**
 * **20명짜리 경기 안에 무엇이 들어 있나** (2026-09-04 · ★읽기 전용★).
 *
 * `lineupTenProbe` 가 ★20명 경기 561건★ 을 찾아냈다. ★한 경기에 10명이어야 한다.★
 * ★같은 사람이 두 번인가, 진짜 다른 20명인가★ — 그 답에 따라 원인이 다르다.
 * ```
 * 같은 사람이 두 번   → ★적·청 배틀로그를 둘 다 넣으면서 겹쳤다★
 * 다른 20명          → ★두 경기가 한 경기로 뭉쳤다★ (경기키가 겹친다)
 * ```
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const one = await prisma.$queryRaw<{ id: string; key: string }[]>`
    SELECT m."id", m."sourceMatchId" AS key
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     WHERE (SELECT count(*) FROM "MatchPlayerStat" p WHERE p."matchId" = m."id") = 20
     ORDER BY m."startAt" DESC LIMIT 1
  `
  if (one.length === 0) {
    console.info('20명짜리 경기가 없다')
    return
  }
  const m = one[0]!
  console.info(`══ 20명짜리 한 경기를 펼친다 — 경기키 ★${m.key}★ ══`)
  console.info('')
  const rows = await prisma.$queryRaw<
    { name: string; side: string; clanName: string | null; kill: number | null; death: number | null }[]
  >`
    SELECT pl."name", s."side"::text AS side,
           coalesce(pl."origin",'-') || ' / ' || coalesce(pl."sourcePlayerId",'-') AS "clanName",
           s."kill", s."death"
      FROM "MatchPlayerStat" s
      JOIN "Player" pl ON pl."id" = s."playerId"
     WHERE s."matchId" = ${m.id}
     ORDER BY s."side", s."kill" DESC, pl."name"
  `
  for (const r of rows) {
    console.info(
      `  ${r.side.padEnd(5)} ${r.name.padEnd(18)} ${(r.clanName ?? '-').padEnd(40)} ` +
        `${String(r.kill ?? '-').padStart(3)}킬 ${String(r.death ?? '-').padStart(3)}데스`,
    )
  }
  const names = rows.map((r) => r.name)
  const uniq = new Set(names)
  console.info('')
  console.info(`  기록 ${rows.length}건 · ★서로 다른 사람 ${uniq.size}명★`)
  console.info(
    uniq.size === rows.length
      ? '  → ★같은 사람이 두 번 들어간 게 아니다.★ ★두 경기가 한 경기로 뭉친 것이다★'
      : '  → ★같은 사람이 두 번 들어갔다.★ ★적·청 배틀로그가 겹친 것이다★',
  )

  /* 전체에서 「같은 사람 두 번」이 몇 건인지 */
  const dup = await prisma.$queryRaw<{ games: bigint }[]>`
    SELECT count(*) AS games FROM (
      SELECT m."id"
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
        JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       GROUP BY m."id"
      HAVING count(*) <> count(DISTINCT s."playerId")
    ) t
  `
  console.info('')
  console.info(
    `  ★전체에서 「한 경기에 같은 사람이 두 번」인 경기 ${Number(dup[0]!.games).toLocaleString()}건★`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
