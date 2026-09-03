/**
 * **IPL 경기가 전부 「래더 미반영」이다** (2026-09-04 · ★읽기 전용★).
 *
 * 폰 화면을 찍어 보니 ★IPL 경기 카드마다 「래더 미반영 · 알수없음」★ 이 붙어 있다.
 * ★SPL 은 「+8점」처럼 점수가 나온다.★ ★리그마다 다르다면 이유가 있어야 한다.★
 *
 * ⚠ 「알수없음」은 ★그 경기 때 클랜 점수를 모른다★ 는 뜻이고 (D-146),
 *   「래더 미반영」은 ★그 경기가 래더 계산에 안 들어갔다★ 는 뜻이다.
 *   ★0점으로 그리지 않는 것은 맞다★ — 없는 것을 0 으로 만들면 거짓말이다.
 *   ★그런데 IPL 만 전부 그렇다면 그건 화면 문제가 아니라 계산이 안 돈 것이다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { league: string; matches: bigint; rated: bigint; stats: bigint; stat_rated: bigint }[]
  >`
    SELECT l."slug" AS league,
           count(DISTINCT m."id") AS matches,
           count(DISTINCT m."id") FILTER (WHERE EXISTS (
             SELECT 1 FROM "MatchPlayerStat" x
              WHERE x."matchId" = m."id" AND x."ratingUpdate" IS NOT NULL)) AS rated,
           count(s."id") AS stats,
           count(s."id") FILTER (WHERE s."ratingUpdate" IS NOT NULL) AS stat_rated
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
      LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
     WHERE m."startAt" >= '2026-06-30T15:00:00Z'
     GROUP BY 1 ORDER BY 2 DESC
  `
  console.info('══ ★리그마다 래더가 반영됐나★ (시즌0 창 안 경기) ══')
  console.info('')
  console.info('  리그         경기      래더반영경기        참가기록     점수변동이 있는 기록')
  console.info('  ' + '─'.repeat(76))
  for (const r of rows) {
    const m = Number(r.matches)
    const rt = Number(r.rated)
    const st = Number(r.stats)
    const sr = Number(r.stat_rated)
    console.info(
      `  ${r.league.padEnd(10)} ${String(m).padStart(7)}   ${String(rt).padStart(7)} ` +
        `(${m ? ((100 * rt) / m).toFixed(0) : 0}%)   ${String(st).padStart(9)}   ` +
        `${String(sr).padStart(7)} (${st ? ((100 * sr) / st).toFixed(0) : 0}%)`,
    )
  }
  console.info('')
  console.info('  ★읽는 법★ — 어떤 리그는 되고 IPL 만 0% 면 ★IPL 에 래더 계산이 안 돈 것★ 이다.')
  console.info('  ★전부 0% 면 그 칸을 아무도 안 채우는 것★ 이고, 화면은 정직하게 그러고 있는 것이다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
