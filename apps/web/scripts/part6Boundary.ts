/**
 * ★★Part 6 — 경계 · 누출 · 모수★★ (2026-09-06 · 사장님 지시 5·6·7). ★읽기만 한다.★
 *
 * ★모든 숫자에 「무엇을 센 숫자인가」를 붙인다★ (사장님 지시 7).
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }
const line = (ok: boolean, label: string, detail: string) =>
  console.info(`  ${ok ? '✔' : '✘'} ${label.padEnd(52)} ${detail}`)

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]

  console.info('══ 창과 모집단이 무엇인가 ══\n')
  console.info(`  Cloud 0 창    ${from.toISOString()} ~ ${to.toISOString()}`)
  console.info(`                (= 2026-09-03 07:00 ~ 2026-10-01 00:00 KST)`)
  console.info(`  래더 경기 조건  redRatingUpdate 가 있거나 origin ∈ ${origins.join(' · ')}`)
  console.info(`  ★daerule 은 종료 리그라 아래 어느 셈에도 안 들어간다★\n`)

  console.info('══ ⑤ 경계 — Cloud 0 시작 ══\n')
  const [edge] = await prisma.$queryRawUnsafe<
    Array<{ before: number; justBefore: number; atStart: number; inside: number; after: number }>
  >(`
    SELECT
      COUNT(*) FILTER (WHERE m."startAt" <  $1)::int                        AS before,
      COUNT(*) FILTER (WHERE m."startAt" >= $1 - INTERVAL '1 hour'
                         AND m."startAt" <  $1)::int                        AS "justBefore",
      COUNT(*) FILTER (WHERE m."startAt" =  $1)::int                        AS "atStart",
      COUNT(*) FILTER (WHERE m."startAt" >= $1 AND m."startAt" < $2)::int    AS inside,
      COUNT(*) FILTER (WHERE m."startAt" >= $2)::int                        AS after
      FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
     WHERE l.slug IN ('nolink','supply','sanply') AND m."supersededAt" IS NULL`,
    from, to)
  console.info(`     세 리그의 살아 있는 Match 를 시각으로만 나눈 수`)
  console.info(`       기준시각 이전            ${edge?.before.toLocaleString()}건 (그중 직전 1시간 ${edge?.justBefore}건)`)
  console.info(`       기준시각 정각            ${edge?.atStart}건`)
  console.info(`       Cloud 0 창 안            ${edge?.inside.toLocaleString()}건`)
  console.info(`       10/1 이후                ${edge?.after}건`)

  const [inWindow] = await prisma.$queryRawUnsafe<Array<{ stat: number; past: number }>>(`
    SELECT
      (SELECT COUNT(*)::int FROM "MatchPlayerStat" s
         JOIN "Match" m ON m.id = s."matchId" JOIN "League" l ON l.id = m."leagueId"
        WHERE l.slug IN ('nolink','supply','sanply') AND m."supersededAt" IS NULL
          AND m."startAt" >= $1 AND m."startAt" < $2
          AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[])))          AS stat,
      (SELECT COUNT(*)::int FROM "MatchPlayerStat" s
         JOIN "Match" m ON m.id = s."matchId" JOIN "League" l ON l.id = m."leagueId"
        WHERE l.slug IN ('nolink','supply','sanply') AND m."supersededAt" IS NULL
          AND m."startAt" < $1
          AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[])))          AS past`,
    from, to, origins)
  console.info(
    `\n     Cloud 0 모집단(창 안 · 래더 경기)의 참가기록 ${inWindow?.stat.toLocaleString()}줄` +
      `\n     같은 조건에서 창 밖(기준시각 이전) 참가기록 ${inWindow?.past.toLocaleString()}줄 — ★이건 Cloud 0 통계에 안 들어간다★`,
  )

  console.info('\n══ Cloud 1 은 아직 0 이어야 한다 ══\n')
  const [c1] = await prisma.$queryRawUnsafe<Array<{ matches: number; stats: number }>>(`
    SELECT (SELECT COUNT(*)::int FROM "Match" m JOIN "Season" s ON s.id = m."seasonId"
             WHERE s.number = 1)                                            AS matches,
           (SELECT COUNT(*)::int FROM "MatchPlayerStat" ps
              JOIN "Match" m ON m.id = ps."matchId" JOIN "Season" s ON s.id = m."seasonId"
             WHERE s.number = 1)                                            AS stats`)
  line((c1?.matches ?? 1) === 0, 'Cloud 1 (시즌번호 1) 에 붙은 Match', `${c1?.matches}건`)
  line((c1?.stats ?? 1) === 0, 'Cloud 1 Match 에 달린 참가기록', `${c1?.stats}줄`)
  line(SEASON0_TO !== null, 'Cloud 0 창에 ★끝이 박혀 있다★ (없으면 10/1 뒤 섞인다)', String(SEASON0_TO?.toISOString()))

  console.info('\n══ ⑥ 불완전 경기가 개인 통계로 새는가 ══\n')
  const [inc] = await prisma.$queryRawUnsafe<
    Array<{ incomplete: number; withStat: number; leaked: number; complete: number }>
  >(`
    SELECT
      (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus" = 'incomplete')            AS incomplete,
      (SELECT COUNT(*)::int FROM "Match" m WHERE m."lineupStatus" = 'incomplete'
         AND EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id))        AS "withStat",
      (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
        WHERE m."lineupStatus" = 'incomplete'
          AND m."startAt" >= $1 AND m."startAt" < $2
          AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[])))           AS leaked,
      (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus" = 'complete')              AS complete`,
    from, to, origins)
  console.info(`     lineupStatus='incomplete' 인 Match                    ${inc?.incomplete}건`)
  console.info(`     lineupStatus='complete' 인 Match                      ${inc?.complete}건`)
  line((inc?.withStat ?? 1) === 0, 'incomplete 경기 중 참가기록이 있는 경기', `${inc?.withStat}건`)
  line((inc?.leaked ?? 1) === 0, '★Cloud 0 개인 통계로 새는 줄★', `${inc?.leaked}줄`)

  console.info('\n══ ⑦ 리그별 모수 (무엇을 센 숫자인지 붙인다) ══\n')
  /*
   * ⚠ ★처음엔 LeagueClan 을 같은 질의에 붙였다가 참가기록을 두 배로 셌다.★
   *   `lc.id IN (red, blue)` 는 경기마다 ★두 줄★ 을 만든다 — 그래서 12,880 이 25,760 이 됐다.
   *   ★조인 하나가 분모를 두 배로 만든다.★ 그래서 클랜은 따로 센다.
   */
  const per = await prisma.$queryRawUnsafe<
    Array<{ slug: string; matches: number; stats: number; players: number; clans: number }>
  >(`
    WITH m AS (
      SELECT m.id, l.slug, m."redLeagueClanId" AS red, m."blueLeagueClanId" AS blue
        FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
       WHERE l.slug IN ('nolink','supply','sanply') AND m."supersededAt" IS NULL
         AND m."startAt" >= $1 AND m."startAt" < $2
         AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($3::text[]))
    )
    SELECT m.slug,
           COUNT(DISTINCT m.id)::int                                        AS matches,
           (SELECT COUNT(*)::int FROM "MatchPlayerStat" ps
             WHERE ps."matchId" IN (SELECT id FROM m m2 WHERE m2.slug = m.slug)) AS stats,
           (SELECT COUNT(DISTINCT ps."playerId")::int FROM "MatchPlayerStat" ps
             WHERE ps."matchId" IN (SELECT id FROM m m2 WHERE m2.slug = m.slug)) AS players,
           COUNT(DISTINCT c.id)::int                                        AS clans
      FROM m, LATERAL (VALUES (m.red), (m.blue)) AS c(id)
     GROUP BY m.slug ORDER BY 1`, from, to, origins)
  console.info('  리그         Cloud 0 창 안 래더 경기   그 경기의 참가기록   그 줄에 나온 선수   그 경기에 나온 클랜')
  for (const r of per)
    console.info(
      `  ${(LABEL[r.slug] ?? r.slug).padEnd(12)} ${String(r.matches).padStart(14)}건 ` +
        `${String(r.stats).padStart(16)}줄 ${String(r.players).padStart(14)}명 ${String(r.clans).padStart(14)}곳`,
    )

  console.info('\n══ ② 리그 혼입 ══\n')
  /*
   * ★집계가 섞이는가★ 와 ★표시값이 어긋나는가★ 는 다른 질문이다.
   *   집계   `side` 와 `winnerSide` 로 센다. 경기의 `leagueId` 로 이미 갈려 있다
   *   표시   `matchTimeLeagueClanId` — 「그 경기에서 뛴 팀」을 가리키는 값
   */
  const [mixWindow] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
    SELECT COUNT(*)::int AS n
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "LeagueClan" lc ON lc.id = ps."matchTimeLeagueClanId"
     WHERE lc."leagueId" <> m."leagueId"
       AND m."startAt" >= $1 AND m."startAt" < $2`, from, to)
  const [mixAll] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
    SELECT COUNT(*)::int AS n
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "LeagueClan" lc ON lc.id = ps."matchTimeLeagueClanId"
     WHERE lc."leagueId" <> m."leagueId"`)
  line(
    (mixWindow?.n ?? 1) === 0,
    '★Cloud 0 창 안★ 에서 소속 표시가 다른 리그인 줄',
    `${mixWindow?.n}줄`,
  )
  console.info(
    `     참고 — 전 기간으로 넓히면 ${mixAll?.n}줄 있다. ★전부 과거 미러 경기다★\n` +
      `            (supply 경기에 sanply 소속 197줄 · sanply 경기에 supply 소속 110줄 ·\n` +
      `             2024-05-26 ~ 2026-06-01 · origin 전부 3rd.supply)\n` +
      `            ★두 리그에 다 등록된 클랜을 미러가 반대쪽 등록으로 박아 둔 것이다.★\n` +
      `            ★승패·킬데스는 side/winnerSide 로 세므로 이 칸을 쓰지 않는다 — 집계 영향 0.★`,
  )

  const [dae] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
    SELECT COUNT(*)::int AS n FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
     WHERE l.slug = 'daerule' AND m."startAt" >= $1 AND m."startAt" < $2`, from, to)
  console.info(`     참고 — daerule 의 Cloud 0 창 안 경기 ${dae?.n}건 (★위 셈에는 안 넣었다★)`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
