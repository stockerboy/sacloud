/**
 * **한 클랜이 두 리그에 동시에 있는가** — 읽기 전용 (2026-09-03).
 *
 * ══ 왜 ══
 *
 * 사장님이 통합 순위의 **조건**으로 다셨다.
 * > «SPL 경기가 열산 기록에 들어가면 절대 안 되게 해야 한다.
 * >  **SPL 클랜이 열산 클랜에 들어가 있으면 절대로 안 된다.** 이걸 확실하게 하면 나 방안이 괜찮다»
 *
 * ★**「지금 0건」과 「앞으로도 0건」은 다르다.**★ 지금 깨끗한 것이 우연인지 장치 덕인지
 * 부터 알아야 한다. 이 파일은 **세기만 한다.** 고치지 않는다.
 *
 * ⚠ 겹친 것이 나오면 ★고치지 마라.★ 사장님 판단이 필요하다 (A 지시).
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 1 · 리그마다 등록 클랜 수 ══\n')
  const rows = await prisma.$queryRaw<{ slug: string; clans: bigint }[]>`
    SELECT l."slug" AS slug, count(DISTINCT lc."clanId") AS clans
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
     GROUP BY 1 ORDER BY 1
  `
  for (const r of rows) console.info(`  ${r.slug.padEnd(9)} ${Number(r.clans)}곳`)

  console.info('\n══ 2 · ★두 리그에 동시에 등록된 클랜★ ══\n')
  /* 추방(expelledAt)된 등록행도 「들어가 있다」로 본다 — 뺀 것이지 없던 일이 아니다.
     ★엄한 쪽으로 센다.★ 놓치는 것보다 더 세는 편이 안전하다 */
  const dup = await prisma.$queryRaw<
    { name: string; slug: string; leagues: string; live: bigint }[]
  >`
    SELECT c."name" AS name, c."slug" AS slug,
           string_agg(DISTINCT l."slug", ',' ORDER BY l."slug") AS leagues,
           count(*) FILTER (WHERE lc."expelledAt" IS NULL) AS live
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
      JOIN "Clan"   c ON c."id" = lc."clanId"
     GROUP BY c."id", c."name", c."slug"
    HAVING count(DISTINCT lc."leagueId") > 1
     ORDER BY 3, 1
  `
  if (dup.length === 0) {
    console.info('  ★겹치는 클랜 0곳★ — 지금은 깨끗하다')
  } else {
    console.info(`  ★${dup.length}곳이 겹친다★`)
    for (const d of dup) {
      console.info(`    ${d.name} (${d.slug})  ${d.leagues}  살아있는 등록 ${Number(d.live)}개`)
    }
  }

  console.info('\n══ 2-A · ★리그 짝별로 · 「지금 살아 있는」 등록만★ ══\n')
  /*
   * ★추방(`expelledAt`)된 등록은 「지금 들어가 있다」가 아니다.★
   * 위 2번은 엄한 쪽으로 다 셌고, 여기서는 **지금 실제로 양쪽에 들어가 있는 것**만 센다.
   * 사장님 조건(«들어가 있으면 절대로 안 된다»)에 걸리는 것은 이쪽이다.
   */
  const pairs = await prisma.$queryRaw<{ a: string; b: string; clans: bigint }[]>`
    WITH live AS (
      SELECT lc."clanId", l."slug"
        FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId"
       WHERE lc."expelledAt" IS NULL
       GROUP BY 1, 2
    )
    SELECT x."slug" AS a, y."slug" AS b, count(*) AS clans
      FROM live x JOIN live y ON x."clanId" = y."clanId" AND x."slug" < y."slug"
     GROUP BY 1, 2 ORDER BY 3 DESC
  `
  if (pairs.length === 0) {
    console.info('  ★0곳★ — 지금 두 리그에 동시에 살아 있는 클랜은 없다')
  } else {
    for (const p of pairs) {
      const flag = p.a === 'sanply' && p.b === 'supply' ? '  ← ★사장님 조건에 걸린다★' : ''
      console.info(`  ${p.a} + ${p.b}   ★${Number(p.clans)}곳★${flag}`)
    }
  }

  console.info('\n══ 3 · ★다른 리그 클랜을 물고 들어온 경기★ ══\n')
  /*
   * 경기는 리그에 속하고, 양쪽 `LeagueClan` 도 리그에 속한다.
   * **경기의 리그 ≠ 그 자리 클랜의 리그** 면 그건 남의 리그 경기가 흘러든 것이다.
   */
  const bad = await prisma.$queryRaw<
    { match_league: string; side: string; clan_league: string; games: bigint }[]
  >`
    SELECT ml."slug" AS match_league, 'red' AS side, rl."slug" AS clan_league, count(*) AS games
      FROM "Match" m
      JOIN "League" ml ON ml."id" = m."leagueId"
      JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
      JOIN "League" rl ON rl."id" = rlc."leagueId"
     WHERE rl."id" <> ml."id"
     GROUP BY 1, 2, 3
    UNION ALL
    SELECT ml."slug", 'blue', bl."slug", count(*)
      FROM "Match" m
      JOIN "League" ml ON ml."id" = m."leagueId"
      JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
      JOIN "League" bl ON bl."id" = blc."leagueId"
     WHERE bl."id" <> ml."id"
     GROUP BY 1, 2, 3
     ORDER BY 1, 2, 3
  `
  if (bad.length === 0) {
    console.info('  ★0건★ — 경기의 리그와 그 자리 클랜의 리그가 전부 같다')
  } else {
    for (const b of bad) {
      console.info(
        `  ★${b.match_league} 경기의 ${b.side} 자리에 ${b.clan_league} 클랜★ ${Number(b.games)}건`,
      )
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
