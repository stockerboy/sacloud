/**
 * **서플라이 없이 SPL·열산을 가져올 수 있나** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 사장님이 정면으로 물으셨다 ══
 *
 * > «★서플라이랑 열산도 우리가 가져와야된다니까 알고있는거지?★
 * >  ★계속 서플라이에서 가져온다고 얘기하던데 솔직하게 말해★»
 *
 * ★맞다.★ SPL·열산은 ★지금도 30분마다 3rd.supply 에서 긁어온다★
 * (`supply-incremental.yml` — 5분 간격 6사이클).
 *
 * ══ 재는 것 셋 ══
 * ```
 * ① SPL·열산 클랜이 각각 몇 곳인가       IPL 은 43곳이라 전부 받았다
 * ② 그 클랜의 ★병영수첩 클랜번호★ 를 아나  IPL 은 매치목록에서 만들었다
 * ③ ★「이 경기가 SPL 경기다」를 서플라이 없이 알 수 있나★  ← ★제일 큰 벽★
 * ```
 *
 * ══ ③에 대한 가정 — ★이 조사가 확인한다★ ══
 *
 * ```
 * 서플라이가 아는 것은 ★「이 클랜이 이 리그다」라는 명부★ 뿐인가
 * 경기 자체는 ★넥슨(병영수첩) 것★ 인가
 * → 맞으면 ★명부만 한 번 받아 두고 그 뒤로는 우리가 관리★ 하면 줄이 끊긴다
 * ```
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  /* ── ① 리그마다 클랜이 몇 곳인가 ────────────────────────────── */
  console.info('══ ① ★리그마다 클랜이 몇 곳인가★ ══\n')
  const clans = await prisma.$queryRaw<{ league: string; clans: bigint; withNo: bigint }[]>`
    SELECT l."slug" AS league,
           count(DISTINCT lc."clanId") AS clans,
           count(DISTINCT lc."clanId") FILTER (WHERE EXISTS (
             SELECT 1 FROM "BarracksClanNumber" bn WHERE bn."clanId" = lc."clanId"
           )) AS "withNo"
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const c of clans) {
    const n = Number(c.clans)
    const k = Number(c.withNo)
    console.info(
      `  ${c.league.padEnd(8)} 클랜 ★${n.toLocaleString().padStart(5)}곳★` +
        `  ② 병영수첩 번호를 아는 곳 ★${k.toLocaleString()}★ ${pc(k, n)}`,
    )
  }
  console.info(
    '\n  ★IPL 은 43곳이라 매치목록을 전부 받아 번호를 만들었다.★\n' +
      '  ★SPL·열산은 그 목록을 한 번도 받은 적이 없다★ — 그래서 번호가 없다',
  )

  /* ── ③ 「리그」를 서플라이 없이 알 수 있나 ────────────────────── */
  console.info('\n══ ③ ★★「이 경기가 어느 리그인가」를 무엇이 정하나★★ ══\n')
  const origin = await prisma.$queryRaw<{ league: string; origin: string; n: bigint }[]>`
    SELECT l."slug" AS league, m."origin", count(*) AS n
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1, 2 ORDER BY 3 DESC
  `
  console.info('  경기의 출처')
  for (const o of origin) {
    console.info(
      `    ${o.league.padEnd(8)} ${o.origin.padEnd(18)} ${Number(o.n).toLocaleString().padStart(9)}건` +
        `${o.origin === '3rd.supply' ? '  ★서플라이★' : ''}`,
    )
  }

  /* 리그 소속(명부)이 무엇으로 정해졌나 */
  console.info('\n  ★리그 소속(명부)의 출처★ — `LeagueClan` 이 언제 만들어졌나')
  const roster = await prisma.$queryRaw<{ league: string; n: bigint; first: Date; last: Date }[]>`
    SELECT l."slug" AS league, count(*) AS n,
           min(lc."joinedAt") AS first, max(lc."joinedAt") AS last
      FROM "LeagueClan" lc JOIN "League" l ON l."id" = lc."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  const day = (d: Date): string =>
    new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)
  for (const r of roster) {
    console.info(
      `    ${r.league.padEnd(8)} ${Number(r.n).toLocaleString().padStart(5)}곳` +
        `  ${day(r.first)} ~ ${day(r.last)}`,
    )
  }

  /* ── 명부가 최근에도 늘고 있나 — 늘면 「한 번 받고 끝」이 아니다 ── */
  console.info('\n  ★명부가 최근에도 늘고 있나★ — 늘면 「한 번 받고 끝」이 아니다')
  const recent = await prisma.$queryRaw<{ league: string; d7: bigint; d30: bigint }[]>`
    SELECT l."slug" AS league,
           count(*) FILTER (WHERE lc."joinedAt" >= now() - interval '7 days')  AS d7,
           count(*) FILTER (WHERE lc."joinedAt" >= now() - interval '30 days') AS d30
      FROM "LeagueClan" lc JOIN "League" l ON l."id" = lc."leagueId"
     GROUP BY 1 ORDER BY 1
  `
  for (const r of recent) {
    console.info(
      `    ${r.league.padEnd(8)} 최근 7일 ★${Number(r.d7)}곳★ · 30일 ${Number(r.d30)}곳`,
    )
  }

  /* ── 선수 명부도 같이 본다 — 클랜만 알면 되는 게 아닐 수 있다 ── */
  console.info('\n══ 보태기 · ★선수 명부는 어떤가★ ══\n')
  const players = await prisma.$queryRaw<{ league: string; n: bigint; d7: bigint }[]>`
    SELECT l."slug" AS league, count(*) AS n,
           count(*) FILTER (WHERE lp."joinedAt" >= now() - interval '7 days') AS d7
      FROM "LeaguePlayer" lp JOIN "League" l ON l."id" = lp."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const p of players) {
    console.info(
      `  ${p.league.padEnd(8)} 선수 ${Number(p.n).toLocaleString().padStart(7)}명` +
        ` · 최근 7일 ★${Number(p.d7).toLocaleString()}명★`,
    )
  }
  console.info(
    '\n★읽는 법★ — 선수가 최근에도 많이 늘면 ★명부도 계속 받아야 한다.★\n' +
      '           거의 안 늘면 ★한 번 받고 사람이 관리★ 하면 된다',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
