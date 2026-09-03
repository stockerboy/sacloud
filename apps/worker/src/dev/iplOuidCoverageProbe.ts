/**
 * **IPL 선수 중 넥슨 ouid 를 아는 사람이 몇 %인가** (2026-09-03 · 읽기 전용).
 *
 * ★넥슨 API 로 IPL 을 재구성하려면 선수마다 ouid 가 있어야 한다.★
 * 실측 — IPL 선수의 `sourcePlayerId` 가 ★`BRK-AE824066F3E2A234SA`★ 였고
 * 그걸로 `/match` 를 부르니 ★400 Please input valid id★ 였다.
 * ★그건 병영수첩 `str_usn` 이고 넥슨 ouid 가 아니다.★
 *
 * → ★병목은 「경기가 넥슨에 있나」가 아니라 「선수를 이을 수 있나」다.★ 그걸 센다.
 */
import { prisma } from '@sacloud/db'
const pc = (a: number, b: number) => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main() {
  console.info('══ 1 · 리그별 선수의 식별자 모양 ══\n')
  const rows = await prisma.$queryRaw<{ league: string; n: bigint; brk: bigint; sup: bigint; obs: bigint; other: bigint }[]>`
    SELECT l."slug" AS league, count(DISTINCT p."id") AS n,
           count(DISTINCT p."id") FILTER (WHERE p."sourcePlayerId" LIKE 'BRK-%') AS brk,
           count(DISTINCT p."id") FILTER (WHERE p."sourcePlayerId" LIKE 'SUP-%') AS sup,
           count(DISTINCT p."id") FILTER (WHERE p."sourcePlayerId" LIKE 'OBS-%') AS obs,
           count(DISTINCT p."id") FILTER (WHERE p."sourcePlayerId" IS NULL
             OR (p."sourcePlayerId" NOT LIKE 'BRK-%' AND p."sourcePlayerId" NOT LIKE 'SUP-%'
                 AND p."sourcePlayerId" NOT LIKE 'OBS-%')) AS other
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const r of rows) {
    const n = Number(r.n)
    console.info(`  ${r.league.padEnd(8)} ${n.toLocaleString().padStart(7)}명  BRK ${pc(Number(r.brk),n)} · SUP ${pc(Number(r.sup),n)} · OBS ${pc(Number(r.obs),n)} · 그밖 ${pc(Number(r.other),n)}`)
  }
  console.info('\n  ★BRK/SUP/OBS 는 전부 우리가 붙인 접두사다 — 넥슨 ouid 가 아니다★')

  console.info('\n══ 2 · ★넥슨 신원 표에 이어진 선수가 몇 명인가★ ══\n')
  const link = await prisma.$queryRaw<{ league: string; n: bigint; linked: bigint }[]>`
    SELECT l."slug" AS league,
           count(DISTINCT p."id") AS n,
           count(DISTINCT p."id") FILTER (WHERE EXISTS (
             SELECT 1 FROM "NexonIdentity" ni WHERE ni."playerId" = p."id"
           )) AS linked
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const r of link) {
    const n = Number(r.n), k = Number(r.linked)
    console.info(`  ${r.league.padEnd(8)} ${n.toLocaleString().padStart(7)}명 중 ★ouid 아는 사람 ${k.toLocaleString()}★ ${pc(k,n)}`)
  }

  console.info('\n══ 3 · ★IPL 경기 중 10명 전원의 ouid 를 아는 경기가 있나★ ══\n')
  const full = await prisma.$queryRaw<{ matches: bigint; allLinked: bigint }[]>`
    WITH per AS (
      SELECT m."id",
             count(*) AS players,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "NexonIdentity" ni WHERE ni."playerId" = s."playerId"
             )) AS linked
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
        JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       GROUP BY 1
      HAVING count(*) = 10
    )
    SELECT count(*) AS matches, count(*) FILTER (WHERE linked = 10) AS "allLinked" FROM per
  `
  const f = full[0]
  if (f) {
    console.info(`  10명이 찬 IPL 경기 ${Number(f.matches).toLocaleString()}건 중`)
    console.info(`  ★10명 전원 ouid 를 아는 경기 ${Number(f.allLinked).toLocaleString()}건★ ${pc(Number(f.allLinked), Number(f.matches))}`)
  }
  console.info('\n★읽는 법★ — 이 값이 낮으면 ★넥슨 API 로는 IPL 라인업을 못 만든다.★')
  console.info('           경기가 넥슨에 있어도 ★누구인지 물어볼 수가 없다★')
}
main().catch(console.error).finally(() => prisma.$disconnect())
