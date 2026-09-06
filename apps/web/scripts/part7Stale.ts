/**
 * ★★어긋난 193명 — 배치가 밀린 건가, 계산이 틀린 건가★★ (2026-09-06 · Part 7 조사).
 * ★읽기만 한다. 안 고친다.★
 *
 * > «계산식 문제인지 · 데이터 문제인지 · 화면 정렬 문제인지 를 구분해서 보고한다»
 *
 * 가르는 법 —
 *   ★밀린 것이라면★  어긋난 선수의 ★마지막 경기가 집계 시각보다 뒤★ 에 있어야 한다
 *   ★계산이 틀렸다면★ 집계 시각 ★이전★ 경기만 가진 선수도 어긋나야 한다
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      slug: string
      name: string
      aggUpdated: Date
      lastMatch: Date | null
      aggWin: number; aggLose: number; aggKill: number; aggDeath: number
      liveWin: number; liveLose: number; liveKill: number; liveDeath: number
      afterBatch: boolean
    }>
  >(`
    WITH live AS (
      SELECT m."leagueId", ps."playerId",
             COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int  AS win,
             COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
             COALESCE(SUM(ps.kill),0)::int  AS kill,
             COALESCE(SUM(ps.death),0)::int AS death,
             MAX(m."startAt") AS "lastMatch"
        FROM "MatchPlayerStat" ps
        JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2 AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    )
    SELECT l.slug, p.name,
           lp."updatedAt" AS "aggUpdated", live."lastMatch",
           lp.win AS "aggWin", lp.lose AS "aggLose", lp.kill AS "aggKill", lp.death AS "aggDeath",
           live.win AS "liveWin", live.lose AS "liveLose", live.kill AS "liveKill", live.death AS "liveDeath",
           (live."lastMatch" > lp."updatedAt") AS "afterBatch"
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l.id = lp."leagueId"
      JOIN "Player" p ON p.id = lp."playerId"
      JOIN live ON live."leagueId" = lp."leagueId" AND live."playerId" = lp."playerId"
     WHERE l.slug IN ('nolink','supply','sanply')
       AND (lp.win <> live.win OR lp.lose <> live.lose
            OR lp.kill <> live.kill OR lp.death <> live.death)`, from, to, origins)

  console.info(`══ 어긋난 선수 ${rows.length}명 — 마지막 경기가 집계보다 뒤인가 ══\n`)
  const after = rows.filter((r) => r.afterBatch)
  const before = rows.filter((r) => !r.afterBatch)
  console.info(`  ★마지막 경기가 집계 시각보다 뒤★ (= 밀린 것)      ${after.length}명`)
  console.info(`  ★집계 시각 이전 경기만 있는데 어긋남★ (= 계산 의심) ${before.length}명`)

  const byLeague = new Map<string, { after: number; before: number }>()
  for (const r of rows) {
    const b = byLeague.get(r.slug) ?? { after: 0, before: 0 }
    if (r.afterBatch) b.after += 1
    else b.before += 1
    byLeague.set(r.slug, b)
  }
  console.info('\n  리그별')
  for (const [slug, b] of [...byLeague].sort())
    console.info(`    ${(LABEL[slug] ?? slug).padEnd(12)} 밀림 ${String(b.after).padStart(4)}명 · ★계산 의심 ${String(b.before).padStart(4)}명★`)

  console.info('\n══ 표본 6명 ══\n')
  for (const r of rows.slice(0, 6))
    console.info(
      `  ${(LABEL[r.slug] ?? r.slug).padEnd(11)} ${r.name.padEnd(14)} ${r.afterBatch ? '★밀림★' : '★계산 의심★'}\n` +
        `      집계 ${r.aggWin}승 ${r.aggLose}패 ${r.aggKill}킬 ${r.aggDeath}데스 (집계 시각 ${r.aggUpdated.toISOString().slice(0, 16)})\n` +
        `      실측 ${r.liveWin}승 ${r.liveLose}패 ${r.liveKill}킬 ${r.liveDeath}데스 (마지막 경기 ${r.lastMatch?.toISOString().slice(0, 16) ?? '-'})`,
    )

  /* 표에만 있고 창 안 경기가 0인 선수 (열산 56명) */
  console.info('\n══ 랭킹표에 있는데 창 안 경기가 0인 선수 ══\n')
  const ghost = await prisma.$queryRawUnsafe<
    Array<{ slug: string; n: number; lastUpdated: Date | null; anyMatch: number }>
  >(`
    WITH live AS (
      SELECT m."leagueId", ps."playerId"
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2 AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    )
    SELECT l.slug, COUNT(*)::int AS n, MAX(lp."updatedAt") AS "lastUpdated",
           COUNT(*) FILTER (WHERE lp."placementPlayed" > 0)::int AS "anyMatch"
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l.id = lp."leagueId"
      LEFT JOIN live ON live."leagueId" = lp."leagueId" AND live."playerId" = lp."playerId"
     WHERE l.slug IN ('nolink','supply','sanply') AND NOT lp.placement AND live."playerId" IS NULL
     GROUP BY 1 ORDER BY 1`, from, to, origins)
  if (ghost.length === 0) console.info('  ★0명★')
  for (const g of ghost)
    console.info(
      `  ${(LABEL[g.slug] ?? g.slug).padEnd(12)} ${g.n}명 · 집계 시각 ${g.lastUpdated?.toISOString().slice(0, 16) ?? '-'} · placementPlayed>0 인 선수 ${g.anyMatch}명`,
    )
  console.info('  ★창을 9/3 으로 옮기기 전(7/1~) 기록으로 랭킹에 올라와 있는 선수일 수 있다 — 아래에서 확인★')

  const [old] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
    WITH live AS (
      SELECT m."leagueId", ps."playerId"
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2 AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    ), oldwin AS (
      SELECT m."leagueId", ps."playerId"
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= TIMESTAMP '2026-06-30 15:00:00' AND m."startAt" < $1
       GROUP BY 1,2
    )
    SELECT COUNT(*)::int AS n
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l.id = lp."leagueId"
      LEFT JOIN live ON live."leagueId" = lp."leagueId" AND live."playerId" = lp."playerId"
      JOIN oldwin ON oldwin."leagueId" = lp."leagueId" AND oldwin."playerId" = lp."playerId"
     WHERE l.slug IN ('nolink','supply','sanply') AND NOT lp.placement AND live."playerId" IS NULL`,
    from, to, origins)
  console.info(`  → 그중 ★옛 창(7/1~9/3)에는 경기가 있던 선수 ${old?.n}명★`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
