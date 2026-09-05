/** ★리그별 신규 경기 표본★ — 올바른 리그에 들어갔나 (2026-09-05). 읽기만 한다 */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

for (const slug of ['nolink', 'supply', 'sanply']) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      matchId: string; src: string; startAt: Date; map: string
      redName: string; redLeague: string; blueName: string; blueLeague: string
      copies: number
    }>
  >(`
    SELECT m.id AS "matchId", m."sourceMatchId" AS src, m."startAt", g.name AS map,
           rc.name AS "redName", rl2.slug AS "redLeague",
           bc.name AS "blueName", bl2.slug AS "blueLeague",
           (SELECT COUNT(*)::int FROM "Match" x
             WHERE x."sourceMatchId"=m."sourceMatchId" AND x."supersededAt" IS NULL) AS copies
    FROM "Match" m
    JOIN "League" l ON l.id=m."leagueId" AND l.slug=$1
    JOIN "GameMap" g ON g.id=m."mapId"
    JOIN "LeagueClan" rl ON rl.id=m."redLeagueClanId"  JOIN "Clan" rc ON rc.id=rl."clanId"
    JOIN "League" rl2 ON rl2.id=rl."leagueId"
    JOIN "LeagueClan" bl ON bl.id=m."blueLeagueClanId" JOIN "Clan" bc ON bc.id=bl."clanId"
    JOIN "League" bl2 ON bl2.id=bl."leagueId"
    WHERE m."startAt" >= ${CUT} AND m.origin='nexon_barracks' AND m."supersededAt" IS NULL
    ORDER BY m."startAt" DESC LIMIT 4`, slug)

  console.info(`\n══ ${slug} 표본 ${rows.length}건 ══`)
  for (const r of rows) {
    const ok = r.redLeague === slug && r.blueLeague === slug && r.copies === 1
    console.info(
      `  ${ok ? '✔' : '✘'} ${r.src} · ${r.startAt.toISOString().slice(0, 16)} · ${r.map}\n` +
        `      ${r.redName}(${r.redLeague}) vs ${r.blueName}(${r.blueLeague}) · 활성 사본 ${r.copies}개`,
    )
  }
}

const bad = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
  SELECT COUNT(*)::int AS n FROM "Match" m
  JOIN "League" l ON l.id=m."leagueId"
  JOIN "LeagueClan" rl ON rl.id=m."redLeagueClanId"
  JOIN "LeagueClan" bl ON bl.id=m."blueLeagueClanId"
  WHERE m."startAt" >= ${CUT} AND m.origin='nexon_barracks' AND m."supersededAt" IS NULL
    AND (rl."leagueId" <> m."leagueId" OR bl."leagueId" <> m."leagueId")`)
console.info(`\n★양쪽 클랜의 리그가 경기 리그와 다른 경우★ ${bad[0]?.n}건 (0이어야 한다)`)
await prisma.$disconnect()
