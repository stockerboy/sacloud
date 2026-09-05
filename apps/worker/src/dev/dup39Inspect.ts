/** ★기준시각 이후 중복 39개의 실제 모양★ (2026-09-05). 읽기만 한다 */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

const rows = await prisma.$queryRawUnsafe<
  Array<{
    sourceMatchId: string
    matchId: string
    leagueSlug: string
    origin: string
    startAt: Date
    redClan: string
    blueClan: string
    stats: number
    official: boolean
    seasonNo: number | null
  }>
>(`
WITH dup AS (
  SELECT "sourceMatchId" FROM "Match"
  WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL
  GROUP BY 1 HAVING COUNT(*) > 1)
SELECT m."sourceMatchId", m.id AS "matchId", l.slug AS "leagueSlug", m.origin, m."startAt",
       rc.name AS "redClan", bc.name AS "blueClan",
       (SELECT COUNT(*)::int FROM "MatchPlayerStat" s WHERE s."matchId" = m.id) AS stats,
       m.official, s2.number AS "seasonNo"
FROM "Match" m
JOIN dup ON dup."sourceMatchId" = m."sourceMatchId"
JOIN "League" l ON l.id = m."leagueId"
JOIN "LeagueClan" rl ON rl.id = m."redLeagueClanId"  JOIN "Clan" rc ON rc.id = rl."clanId"
JOIN "LeagueClan" bl ON bl.id = m."blueLeagueClanId" JOIN "Clan" bc ON bc.id = bl."clanId"
LEFT JOIN "Season" s2 ON s2.id = m."seasonId"
ORDER BY m."sourceMatchId", l.slug`)

const by = new Map<string, typeof rows>()
for (const r of rows) {
  const list = by.get(r.sourceMatchId) ?? []
  list.push(r)
  by.set(r.sourceMatchId, list)
}
console.info(`중복 경기번호 ${by.size}개 · 행 ${rows.length}개\n`)

const combos = new Map<string, number>()
let statsZero = 0
let statsBoth = 0
for (const [key, list] of by) {
  const combo = list.map((r) => `${r.leagueSlug}/${r.origin}`).sort().join(' + ')
  combos.set(combo, (combos.get(combo) ?? 0) + 1)
  const withStats = list.filter((r) => r.stats > 0).length
  if (withStats === 0) statsZero += 1
  if (withStats === list.length) statsBoth += 1
  if (by.size <= 45 && combos.size <= 99) {
    console.info(
      `${key}  ${list[0]?.redClan} vs ${list[0]?.blueClan}  (${list[0]?.startAt.toISOString().slice(0, 16)})`,
    )
    for (const r of list) {
      console.info(
        `    ${r.leagueSlug.padEnd(7)} ${r.origin.padEnd(15)} 라인업 ${String(r.stats).padStart(3)}명 · ` +
          `official=${r.official} · 시즌 ${r.seasonNo ?? '없음'} · id=${r.matchId}`,
      )
    }
  }
}
console.info('\n══ 조합별 ══')
for (const [c, n] of [...combos].sort((a, b) => b[1] - a[1])) console.info(`  ${c} — ${n}개`)
console.info(`\n라인업이 양쪽 다 0인 경기 ${statsZero}개 · 양쪽 다 있는 경기 ${statsBoth}개`)
await prisma.$disconnect()
