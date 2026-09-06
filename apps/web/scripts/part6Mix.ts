/**
 * ★참가기록의 소속 클랜이 경기와 다른 리그인 307줄 — 무엇인가★ (2026-09-06 · Part 6 ⑧).
 * ★읽기만 한다. 고치지 않는다.★
 *
 * > «오류가 있으면 바로 대규모 수정하지 마라. 먼저 원인·영향 범위·몇 건·어떤 리그·
 * >  어떤 화면/API· ★실제 데이터가 틀린 건지 계산만 틀린 건지★ 를 증명해서 보고한다»
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]

  console.info('══ 어떤 줄인가 — 경기 리그 vs 기록에 박힌 소속 클랜의 리그 ══\n')
  const rows = await prisma.$queryRawUnsafe<
    Array<{ matchLeague: string; clanLeague: string; origin: string; n: number; first: Date; last: Date }>
  >(`
    SELECT ml.slug AS "matchLeague", cl.slug AS "clanLeague", m.origin,
           COUNT(*)::int AS n, MIN(m."startAt") AS first, MAX(m."startAt") AS last
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "League" ml ON ml.id = m."leagueId"
      JOIN "LeagueClan" lc ON lc.id = ps."matchTimeLeagueClanId"
      JOIN "League" cl ON cl.id = lc."leagueId"
     WHERE lc."leagueId" <> m."leagueId"
     GROUP BY 1,2,3 ORDER BY 4 DESC`)
  console.info('  경기 리그   기록의 클랜 리그   origin            줄수    처음 ~ 마지막')
  for (const r of rows)
    console.info(
      `  ${r.matchLeague.padEnd(10)} ${r.clanLeague.padEnd(16)} ${r.origin.padEnd(16)} ${String(r.n).padStart(5)}` +
        `   ${r.first.toISOString().slice(0, 10)} ~ ${r.last.toISOString().slice(0, 10)}`,
    )

  console.info('\n══ Cloud 0 창 안에도 있나 (지금 통계에 영향이 있나) ══\n')
  const [scope] = await prisma.$queryRawUnsafe<Array<{ inWindow: number; past: number; ladder: number }>>(`
    SELECT
      COUNT(*) FILTER (WHERE m."startAt" >= $1 AND m."startAt" < $2)::int AS "inWindow",
      COUNT(*) FILTER (WHERE m."startAt" <  $1)::int                     AS past,
      COUNT(*) FILTER (WHERE m."startAt" >= $1 AND m."startAt" < $2
                         AND (m."redRatingUpdate" IS NOT NULL
                              OR m.origin = ANY($3::text[])))::int       AS ladder
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "LeagueClan" lc ON lc.id = ps."matchTimeLeagueClanId"
     WHERE lc."leagueId" <> m."leagueId"`, from, to, origins)
  console.info(`  Cloud 0 창 안 ${scope?.inWindow}줄 (그중 래더 경기 ${scope?.ladder}줄) · 창 밖(과거) ${scope?.past}줄`)

  console.info('\n══ 표본 3줄을 펼쳐 본다 ══\n')
  const smp = await prisma.$queryRawUnsafe<
    Array<{
      matchId: string; startAt: Date; matchLeague: string; origin: string
      player: string; clanName: string; clanLeague: string
      redClan: string; blueClan: string; side: string
    }>
  >(`
    SELECT m.id AS "matchId", m."startAt", ml.slug AS "matchLeague", m.origin,
           p.name AS player, c.name AS "clanName", cl.slug AS "clanLeague",
           rc.name AS "redClan", bc.name AS "blueClan", ps.side
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "League" ml ON ml.id = m."leagueId"
      JOIN "Player" p ON p.id = ps."playerId"
      JOIN "LeagueClan" lc ON lc.id = ps."matchTimeLeagueClanId"
      JOIN "Clan" c ON c.id = lc."clanId"
      JOIN "League" cl ON cl.id = lc."leagueId"
      JOIN "LeagueClan" rl ON rl.id = m."redLeagueClanId"  JOIN "Clan" rc ON rc.id = rl."clanId"
      JOIN "LeagueClan" bl ON bl.id = m."blueLeagueClanId" JOIN "Clan" bc ON bc.id = bl."clanId"
     WHERE lc."leagueId" <> m."leagueId"
     ORDER BY m."startAt" DESC LIMIT 3`)
  for (const s of smp)
    console.info(
      `  ${s.matchId} · ${s.startAt.toISOString().slice(0, 16)} · 경기리그 ${s.matchLeague} · origin ${s.origin}\n` +
        `     ${s.redClan} vs ${s.blueClan}\n` +
        `     선수 ${s.player} (${s.side}) · 기록에 박힌 소속 ★${s.clanName}★ — 그 등록은 ★${s.clanLeague}★ 리그다`,
    )

  console.info('\n══ 이 값을 화면이 쓰나 ══\n')
  const [use] = await prisma.$queryRawUnsafe<Array<{ n: number; withName: number }>>(`
    SELECT COUNT(*)::int AS n,
           COUNT(ps."matchTimeClanName")::int AS "withName"
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
     WHERE m."startAt" >= $1 AND m."startAt" < $2`, from, to)
  console.info(`  Cloud 0 창 안 참가기록 ${use?.n.toLocaleString()}줄 · 그중 소속 이름이 박힌 줄 ${use?.withName.toLocaleString()}줄`)
  console.info('  ★matchTimeLeagueClanId 는 「그 경기에서 뛴 팀」을 가리키는 표시값이다.★')
  console.info('  승패·킬데스 집계는 `side` 와 `winnerSide` 로 센다 — ★이 칸을 쓰지 않는다.★')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
