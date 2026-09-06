/**
 * ★★자연 회차 뒤 — 화면/API 가 새 값을 보이나★★ (2026-09-06 · Part 9 ⑥·⑦).
 * ★읽기만 한다.★
 *
 * ```
 * pnpm exec tsx apps/web/scripts/part9Api.ts
 * ```
 *
 * ── 무엇을 보나
 *   ① 랭킹 표(`LeaguePlayer`)가 ★언제 채워졌나★
 *   ② 그 값이 ★그 자리에서 센 값과 같나★
 *   ③ ★화면이 부르는 함수★ 로 실제 순위·숫자가 나오나
 *   ④ 회귀 — 미러 신규 · 시즌7 · 시즌1~6 · 과거 경기 · 수집 임대
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'
import { getPlayerRanks, getClanRanks, ALL_DIVISIONS } from '../lib/server/queries/leagues'
import { getPlayerRanksByWeapon } from '../lib/server/queries/rankings'

const LEAGUES = ['nolink', 'supply', 'sanply'] as const
const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }
const line = (ok: boolean, label: string, detail: string) =>
  console.info(`  ${ok ? '✔' : '✘'} ${label.padEnd(44)} ${detail}`)

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]

  console.info('══ ① 집계 임대와 마지막 쓴 판 ══\n')
  const lease = await prisma.$queryRaw<
    Array<{
      ownerId: string; host: string; command: string | null
      acquiredAt: Date; releasedAt: Date | null; lastAppliedStartedAt: Date | null
    }>
  >`
    SELECT "ownerId", "host", "command", "acquiredAt", "releasedAt", "lastAppliedStartedAt"
      FROM "CollectorLease" WHERE "name" = 'season0-apply'
  `
  const l = lease[0]
  if (!l) console.info('  ★임대 행이 없다★')
  else
    console.info(
      `  주인 ${l.ownerId}\n  ${l.host} · ${l.command ?? '-'}\n` +
        `  잡은 때 ${l.acquiredAt.toISOString()} · 반납 ${l.releasedAt?.toISOString() ?? '(아직 쥐고 있다)'}\n` +
        `  ★마지막으로 쓴 판의 시작시각 ${l.lastAppliedStartedAt?.toISOString() ?? 'null'}★`,
    )

  console.info('\n══ ② 집계 표 vs 그 자리에서 센 값 ══\n')
  const cmp = await prisma.$queryRawUnsafe<
    Array<{ slug: string; ranked: number; live: number; same: number; diff: number; updated: Date | null }>
  >(`
    WITH live AS (
      SELECT m."leagueId", ps."playerId",
             COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int AS win,
             COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
             COALESCE(SUM(ps.kill),0)::int AS kill, COALESCE(SUM(ps.death),0)::int AS death
        FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
       WHERE m."startAt" >= $1 AND m."startAt" < $2 AND m."supersededAt" IS NULL
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
       GROUP BY 1,2
    )
    SELECT l.slug,
      COUNT(*) FILTER (WHERE NOT lp.placement)::int AS ranked,
      (SELECT COUNT(*)::int FROM live WHERE live."leagueId" = l.id) AS live,
      COUNT(*) FILTER (WHERE live."playerId" IS NOT NULL
                         AND lp.win = live.win AND lp.lose = live.lose
                         AND lp.kill = live.kill AND lp.death = live.death)::int AS same,
      COUNT(*) FILTER (WHERE live."playerId" IS NOT NULL
                         AND (lp.win <> live.win OR lp.lose <> live.lose
                              OR lp.kill <> live.kill OR lp.death <> live.death))::int AS diff,
      MAX(lp."updatedAt") AS updated
      FROM "League" l
      JOIN "LeaguePlayer" lp ON lp."leagueId" = l.id
      LEFT JOIN live ON live."leagueId" = l.id AND live."playerId" = lp."playerId"
     WHERE l.slug IN ('nolink','supply','sanply')
     GROUP BY 1, l.id ORDER BY 1`, from, to, origins)
  for (const c of cmp)
    line(
      c.diff === 0,
      `${LABEL[c.slug] ?? c.slug} — 값이 다른 선수`,
      `${c.diff}명 (랭킹 ${c.ranked} · 실측 ${c.live} · 같음 ${c.same} · 갱신 ${c.updated?.toISOString().slice(0, 19) ?? '-'})`,
    )

  console.info('\n══ ③ 화면이 부르는 함수로 실제 값 ══\n')
  for (const slug of LEAGUES) {
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue
    const ranks = await getPlayerRanks(league.id, null, 3)
    const clans = await getClanRanks(league.id, ALL_DIVISIONS, null, 1)
    const sniper = await getPlayerRanksByWeapon(league.id, 'sniper', null, 1)
    const top = ranks?.items[0]
    console.info(
      `  ${(LABEL[slug] ?? slug).padEnd(12)} 개인 1위 ${top?.player.name ?? '-'} (래더 ${top?.rating ?? '-'} · ` +
        `${top?.win ?? '-'}승 ${top?.lose ?? '-'}패) · 클랜 1위 ${clans?.items[0]?.clan.name ?? '-'} · ` +
        `스나 1위 ${sniper?.items[0]?.player.name ?? '-'}`,
    )
  }

  console.info('\n══ ④ 회귀 ══\n')
  const [g] = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(`
    SELECT (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply'
              AND "startAt" >= TIMESTAMP '2026-09-02 22:00:00')                       AS mirror,
           (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id=p."seasonId"
             WHERE s.number = -107)                                                    AS season7,
           (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id=p."seasonId"
             WHERE s.number < -100 AND s.number <> -107)                               AS season1_6,
           (SELECT COUNT(*)::int FROM "Match"
             WHERE "startAt" < TIMESTAMP '2026-09-02 22:00:00')                        AS past,
           (SELECT COUNT(*)::int FROM "Match" m
             WHERE m."lineupStatus"='incomplete'
               AND EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId"=m.id))   AS leaked`)
  line(g?.mirror === 261, '미러 신규 261 그대로', `${g?.mirror}`)
  line(g?.season7 === 10354, '시즌7 10,354장 그대로', `${g?.season7}`)
  line(g?.season1_6 === 10673, '시즌1~6 10,673장 그대로', `${g?.season1_6}`)
  line(g?.past === 389367, '과거 경기 389,367 그대로', `${g?.past}`)
  line(g?.leaked === 0, 'incomplete 개인 통계 누출', `${g?.leaked}건`)

  const collector = await prisma.$queryRaw<Array<{ ownerId: string; expiresAt: Date }>>`
    SELECT "ownerId", "expiresAt" FROM "CollectorLease" WHERE "name" = 'barracks-collect'
  `
  console.info(
    `\n  수집 임대(barracks-collect) — 주인 ${collector[0]?.ownerId ?? '-'} · ` +
      `만료 ${collector[0]?.expiresAt?.toISOString() ?? '-'} ★집계와 다른 줄이다★`,
  )
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
