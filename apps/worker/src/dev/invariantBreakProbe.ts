/**
 * **불변식이 어긋난 12명이 누구인가** (2026-09-04 · ★읽기 전용★).
 *
 * `season0-apply` 가 끝에 이렇게 찍었다 —
 * ```
 * 불변식(통합 = 기본 + 스나 + 라플) 어긋난 선수: ★12★ ✗
 * ```
 * ★화면의 통합 킬뎃이 스나+라플 합과 안 맞으면 사장님이 볼 때 이상하다.★
 *
 * ★짐작★ — 병영수첩 라인업은 무기를 ★킬 기록에서 더 많이 쓴 쪽★ 으로 정하고
 * ★동률이면 아예 안 넣는다(`null`)★. 그 경기의 점수는 ★통합에는 들어가고 무기별에는 안 들어간다.★
 * ★짐작이 맞는지 센다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; rating: number; base: number; d: number; nullw: bigint; all: bigint }[]
  >`
    SELECT lp."id", pl."name", lp."rating", lp."baseRating" AS base,
           coalesce(sum(ws."ratingDelta"), 0) AS d,
           (SELECT count(*) FROM "MatchPlayerStat" s
              JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
             WHERE s."playerId" = lp."playerId" AND s."weapon" IS NULL) AS nullw,
           (SELECT count(*) FROM "MatchPlayerStat" s
              JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
             WHERE s."playerId" = lp."playerId") AS all
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId" AND l."slug" = 'nolink'
      JOIN "Player" pl ON pl."id" = lp."playerId"
      LEFT JOIN "LeaguePlayerWeaponStat" ws ON ws."leaguePlayerId" = lp."id"
     GROUP BY lp."id", pl."name", lp."rating", lp."baseRating", lp."playerId", lp."leagueId"
    HAVING lp."rating" <> lp."baseRating" + coalesce(sum(ws."ratingDelta"), 0)
     ORDER BY 6 DESC
  `
  console.info('══ ★불변식이 어긋난 선수★ ══')
  console.info('')
  console.info('  이름              통합      기본     무기별합    차이   무기모름/전체')
  console.info('  ' + '─'.repeat(72))
  let withNull = 0
  for (const r of rows) {
    const gap = Number(r.rating) - (Number(r.base) + Number(r.d))
    if (Number(r.nullw) > 0) withNull += 1
    console.info(
      `  ${r.name.padEnd(16)} ${String(Math.round(Number(r.rating))).padStart(6)} ` +
        `${String(Math.round(Number(r.base))).padStart(8)} ${String(Math.round(Number(r.d))).padStart(9)} ` +
        `${String(Math.round(gap)).padStart(7)}   ${Number(r.nullw)}/${Number(r.all)}`,
    )
  }
  console.info('')
  console.info(`  어긋난 선수 ★${rows.length}명★ 중 ★무기를 모르는 경기가 있는 사람 ${withNull}명★`)
  console.info(
    rows.length > 0 && withNull === rows.length
      ? '  → ★짐작이 맞다. 무기를 모르는 경기(킬 무기가 동률) 때문이다★'
      : '  → ★짐작이 틀렸다. 다른 원인이 있다★',
  )

  /*
   * ★두 번째 짐작★ — `lineup-dedupe` 로 참가 기록을 지운 선수는 ★경기가 0이 됐는데★
   * ★무기별 통계(`LeaguePlayerWeaponStat`)는 옛것이 남아 있을 수 있다.★
   * `season0-apply` 가 «시즌0 경기 없어 되돌린 선수 216» 이라고 찍은 것이 그 무리다.
   */
  const zero = rows.filter((r) => Number(r.all) === 0).length
  const origins = await prisma.$queryRaw<{ origin: string; n: bigint }[]>`
    SELECT coalesce(p."origin", '-') AS origin, count(*) AS n
      FROM "LeaguePlayer" lp
      JOIN "Player" p ON p."id" = lp."playerId"
     WHERE lp."id" = ANY(${rows.map((r) => r.id)}::text[])
     GROUP BY 1 ORDER BY 2 DESC
  `
  console.info('')
  console.info('══ ★두 번째 짐작 — 지운 쪽 선수인가★ ══')
  console.info('')
  console.info(`  경기가 0인 선수 ★${zero}명★ / ${rows.length}명`)
  for (const o of origins) console.info(`  출처 ${o.origin.padEnd(16)} ${Number(o.n)}명`)
  console.info('')
  console.info('  ★읽는 법★ — `nexon_barracks` 쪽에 몰려 있으면 ★내가 지운 쪽 선수★ 이고,')
  console.info('  그러면 원인은 ★참가 기록은 지웠는데 무기별 통계가 남은 것★ 이다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
