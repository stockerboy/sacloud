/**
 * ★★Part 6 — 클랜 통계가 원본과 맞는가★★ (2026-09-06 · 사장님 지시). ★읽기만 한다.★
 *
 * ```
 * pnpm exec tsx apps/web/scripts/part6ClanVerify.ts [리그당 표본수]
 * ```
 *
 * ── ★분모를 먼저 못박는다★ (사장님 지시 4)
 *   클랜 화면의 「전적 요약」은 ★시즌 전체가 아니다.★ 코드가 정한 분모는 이렇다 —
 *   ```
 *   모집단   그 클랜이 red 또는 blue 인 Match
 *            AND 래더 경기 (redRatingUpdate 가 있거나 origin ∈ 3rd.supply·nexon·nexon_barracks)
 *            AND Cloud 0 창 (2026-09-03 07:00 ~ 2026-10-01 KST)
 *   자르기   ★그중 최근 20경기★ (`RECENT_MATCH_COUNT = 20` · startAt 내림차순, 동시각이면 id 내림차순)
 *   ```
 *   ★그래서 「20전 12승 8패」는 시즌 통산이 아니라 최근 20경기다.★
 *   클랜 지표(`leagueClanMetrics`)는 자르지 않고 최대 4,000건까지 훑는다 — ★분모가 다르다.★
 *
 * ── 무엇을 맞대나
 *   ① 화면이 쓰는 그 함수  `getLeagueClanShow(리그slug, 클랜slug)`
 *   ② 원본 줄을 직접 합산  `Match` 를 받아 ★JS 가 센다★ (같은 모집단 · 같은 20건)
 */
import { prisma } from '@sacloud/db'
import { withLadderMatch } from '../lib/server/queries/ladderScope'
import { seasonWindowWhere, SEASON0_FROM, SEASON0_TO } from '../lib/server/queries/season0Scope'
import { getLeagueClanShow } from '../lib/server/queries/records'

const PER_LEAGUE = Number(process.argv[2] ?? 3)
const LEAGUES = ['nolink', 'supply', 'sanply'] as const
const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }
const RECENT = 20

async function main(): Promise<void> {
  console.info('══ Part 6 · 클랜 통계 대조 ══')
  console.info(`  창 ${SEASON0_FROM.toISOString()} ~ ${SEASON0_TO?.toISOString() ?? '(끝 없음)'}`)
  console.info(`  ★요약의 분모 = 그 모집단의 최근 ${RECENT}경기★\n`)

  let checked = 0
  let bad = 0
  for (const slug of LEAGUES) {
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue

    /* 표본 — Cloud 0 창 안에서 경기가 많은 클랜부터 */
    const picks = await prisma.$queryRawUnsafe<
      Array<{ leagueClanId: string; clanSlug: string; name: string; games: number }>
    >(`
      SELECT lc.id AS "leagueClanId", c.slug AS "clanSlug", c.name, COUNT(*)::int AS games
        FROM "Match" m
        JOIN "LeagueClan" lc ON lc.id IN (m."redLeagueClanId", m."blueLeagueClanId")
        JOIN "Clan" c ON c.id = lc."clanId"
       WHERE m."leagueId" = $1 AND lc."leagueId" = $1
         AND m."startAt" >= $2 AND m."startAt" < $3
         AND (m."redRatingUpdate" IS NOT NULL
              OR m.origin IN ('3rd.supply','nexon','nexon_barracks'))
       GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT ${PER_LEAGUE}`,
      league.id, SEASON0_FROM, SEASON0_TO ?? new Date('2100-01-01'))

    console.info(`── ${LABEL[slug]} (${slug}) · 표본 ${picks.length}곳 ──`)
    for (const p of picks) {
      const show = await getLeagueClanShow(slug, p.clanSlug)
      if (!show) {
        console.info(`  ✘ ${p.name} — ★화면 질의가 null 을 냈다★`)
        bad += 1
        checked += 1
        continue
      }

      /* ── ② 손으로 센다 — 같은 모집단 · 같은 20건 ── */
      const rows = await prisma.match.findMany({
        where: withLadderMatch({
          AND: [
            { OR: [{ redLeagueClanId: p.leagueClanId }, { blueLeagueClanId: p.leagueClanId }] },
            seasonWindowWhere(),
          ],
        }),
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        take: RECENT,
        select: {
          id: true, startAt: true, winnerSide: true, leagueId: true,
          redLeagueClanId: true, blueLeagueClanId: true,
        },
      })
      let win = 0
      let lose = 0
      let outWindow = 0
      let otherLeague = 0
      let bothSides = 0
      const seen = new Set<string>()
      let dup = 0
      for (const m of rows) {
        const mine = m.redLeagueClanId === p.leagueClanId ? 'red' : 'blue'
        if (m.redLeagueClanId === p.leagueClanId && m.blueLeagueClanId === p.leagueClanId) bothSides += 1
        if (m.winnerSide === mine) win += 1
        else lose += 1
        if (m.startAt < SEASON0_FROM) outWindow += 1
        if (SEASON0_TO && m.startAt >= SEASON0_TO) outWindow += 1
        if (m.leagueId !== league.id) otherLeague += 1
        if (seen.has(m.id)) dup += 1
        seen.add(m.id)
      }

      const s = show.match_summary
      const same =
        s.recent_count === rows.length &&
        s.win === win &&
        s.lose === lose &&
        outWindow === 0 &&
        otherLeague === 0 &&
        dup === 0 &&
        bothSides === 0
      checked += 1
      if (!same) bad += 1
      const wr = rows.length === 0 ? '-' : ((win / rows.length) * 100).toFixed(1)
      console.info(
        `  ${same ? '✔' : '✘'} ${p.name.padEnd(16)} (창 안 총 ${p.games}경기 · 요약 분모는 최근 ${RECENT})\n` +
          `      화면  ${s.recent_count}전 ${s.win}승 ${s.lose}패 (승률 ${s.win_rate ?? '-'}%) · 상대 ${s.opponents.length}팀\n` +
          `      손셈  ${rows.length}전 ${win}승 ${lose}패 (승률 ${wr}%)\n` +
          `      ★창 밖 ${outWindow} · 다른 리그 ${otherLeague} · 같은 경기 두 번 ${dup} · 양쪽이 같은 클랜 ${bothSides}★`,
      )
    }
    console.info('')
  }
  console.info(`  표본 ${checked}곳 중 ★어긋난 클랜 ${bad}곳★`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
