/**
 * 중복 선수 행 · MVP 결측 · 래더 증감 표기 **진단** (읽기 전용).
 *
 * 아무것도 쓰지 않는다. 숫자만 뽑는다. 운영 DB 를 가리켜도 안전하다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/jobs/playerMergeDiag.ts --league supply --name huwho,Neronator
 * ```
 */
import { prisma } from '@sacloud/db'

const arg = (k: string): string | null =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ??
  (process.argv.includes(`--${k}`)
    ? (process.argv[process.argv.indexOf(`--${k}`) + 1] ?? null)
    : null)

const LEAGUE = arg('league') ?? 'supply'
const NAMES = (arg('name') ?? 'huwho,Neronator').split(',').map((s) => s.trim()).filter(Boolean)

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({ where: { slug: LEAGUE } })
  if (!league) throw new Error(`리그 없음: ${LEAGUE}`)
  console.log(`# 리그 ${LEAGUE} (${league.id})`)

  /* ---------------------------------------------------------------- 1. 중복 */
  console.log('\n## 1. 같은 이름 Player 중복')
  const dupNames = await prisma.$queryRaw<
    Array<{ name: string; rows: bigint; origins: string }>
  >`
    SELECT p.name, COUNT(*)::bigint AS rows, string_agg(DISTINCT p.origin, ',') AS origins
      FROM "Player" p
     WHERE EXISTS (SELECT 1 FROM "LeaguePlayer" lp WHERE lp."playerId" = p.id AND lp."leagueId" = ${league.id})
     GROUP BY p.name
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC
     LIMIT 20`
  const dupTotal = await prisma.$queryRaw<Array<{ groups: bigint; extra: bigint }>>`
    SELECT COUNT(*)::bigint AS groups, (SUM(c) - COUNT(*))::bigint AS extra FROM (
      SELECT p.name, COUNT(*) AS c FROM "Player" p
       WHERE EXISTS (SELECT 1 FROM "LeaguePlayer" lp WHERE lp."playerId" = p.id AND lp."leagueId" = ${league.id})
       GROUP BY p.name HAVING COUNT(*) > 1) t`
  console.log('중복 그룹/여분 행:', dupTotal[0])
  console.table(dupNames.map((d) => ({ ...d, rows: Number(d.rows) })))

  /* 지정 닉네임 상세 */
  for (const name of NAMES) {
    console.log(`\n### ${name}`)
    const rows = await prisma.$queryRaw<
      Array<{
        id: string
        origin: string
        sourcePlayerId: string | null
        nexonOuid: string | null
        lpid: string | null
        stats: bigint
      }>
    >`
      SELECT p.id, p.origin, p."sourcePlayerId", p."nexonOuid",
             lp.id AS lpid,
             (SELECT COUNT(*) FROM "MatchPlayerStat" s
                JOIN "Match" m ON m.id = s."matchId"
               WHERE s."playerId" = p.id AND m."leagueId" = ${league.id})::bigint AS stats
        FROM "Player" p
        LEFT JOIN "LeaguePlayer" lp ON lp."playerId" = p.id AND lp."leagueId" = ${league.id}
       WHERE p.name = ${name}
       ORDER BY 6 DESC`
    console.table(rows.map((r) => ({ ...r, stats: Number(r.stats) })))
  }

  /* ---------------------------------------------------------------- 2. MVP */
  console.log('\n## 2. MVP')
  const mvp = await prisma.$queryRaw<
    Array<{ origin: string; matches: bigint; withMvpId: bigint; statMvpTrue: bigint; statMvpNull: bigint }>
  >`
    SELECT m.origin,
           COUNT(*)::bigint AS matches,
           COUNT(m."mvpPlayerId")::bigint AS "withMvpId",
           (SELECT COUNT(*) FROM "MatchPlayerStat" s JOIN "Match" m2 ON m2.id = s."matchId"
             WHERE m2."leagueId" = ${league.id} AND m2.origin = m.origin AND s.mvp IS TRUE)::bigint AS "statMvpTrue",
           (SELECT COUNT(*) FROM "MatchPlayerStat" s JOIN "Match" m2 ON m2.id = s."matchId"
             WHERE m2."leagueId" = ${league.id} AND m2.origin = m.origin AND s.mvp IS NULL)::bigint AS "statMvpNull"
      FROM "Match" m
     WHERE m."leagueId" = ${league.id}
     GROUP BY m.origin`
  console.table(mvp.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))))

  /* mvpPlayerId 가 그 경기 라인업에 없는 경우 (중복 행 불일치) */
  const mvpOrphan = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM "Match" m
     WHERE m."leagueId" = ${league.id} AND m."mvpPlayerId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s
                        WHERE s."matchId" = m.id AND s."playerId" = m."mvpPlayerId")`
  console.log('mvpPlayerId 가 라인업에 없는 경기:', Number(mvpOrphan[0]!.n))

  /* ------------------------------------------------------- 3. 래더 증감 */
  console.log('\n## 3. 래더 증감 (미러 경기)')
  const delta = await prisma.$queryRaw<
    Array<{ origin: string; stats: bigint; srcDelta: bigint; ourDelta: bigint; bothDiff: bigint }>
  >`
    SELECT m.origin,
           COUNT(*)::bigint AS stats,
           COUNT(s."sourceRatingDelta")::bigint AS "srcDelta",
           COUNT(s."ratingUpdate")::bigint AS "ourDelta",
           COUNT(*) FILTER (WHERE s."sourceRatingDelta" IS NOT NULL AND s."ratingUpdate" IS NOT NULL
                              AND s."sourceRatingDelta" <> s."ratingUpdate")::bigint AS "bothDiff"
      FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
     WHERE m."leagueId" = ${league.id}
     GROUP BY m.origin`
  console.table(delta.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))))

  const clanDelta = await prisma.$queryRaw<
    Array<{ origin: string; matches: bigint; redSrc: bigint; redOur: bigint }>
  >`
    SELECT origin, COUNT(*)::bigint AS matches,
           COUNT("redSourceRatingUpdate")::bigint AS "redSrc",
           COUNT("redRatingUpdate")::bigint AS "redOur"
      FROM "Match" WHERE "leagueId" = ${league.id} GROUP BY origin`
  console.table(clanDelta.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))))

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
