/**
 * **IPL 1~6월을 넥슨에서 받아올 수 있는가** — 한 클랜만 재는 실측 (2026-09-03 · 읽기 전용).
 *
 * ══ 무엇을 가르는가 ══
 *
 * 사장님: «IPL의 1-6기록을 가져와야한다 **반드시 누락없이** 가져와야한다»
 *
 * `endpoints.ts:20` — `/match` 는 **최대 1000건 · 커서도 날짜 필터도 없다.**
 * ★그 1000건이 「최근 것부터」면 1~6월은 이미 밀려나 있을 수 있다.★
 * **밀려나 있으면 그 기록은 영원히 못 가져온다.** 그러면 그렇게 보고해야 한다.
 *
 * ══ 이 파일이 하는 일 ══
 *
 * **DB 는 읽기만.** 넥슨 호출도 **한 클랜 몫만** 한다. ★전수 수집을 시작하지 않는다.★
 *
 * ⚠ 이 파일은 넥슨을 부르지 않는다 — **부를 대상(닉네임)만 골라 준다.**
 *   실제 호출은 밖에서 몇 개만 한다. 할당량을 태우지 않기 위해서다.
 */
import { prisma } from '@sacloud/db'

const JAN = new Date('2026-01-01T00:00:00+09:00')
const JUL = new Date('2026-07-01T00:00:00+09:00')

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: 'nolink' },
    select: { id: true },
  })
  if (!league) {
    console.info('nolink 리그가 없다')
    return
  }

  console.info('══ 1 · IPL 클랜과 「1~6월에 실제로 뛴 사람」 ══\n')
  /*
   * ★22,405명이 아니다★ — 클랜전은 10명이 뛰므로 한 명만 잡으면 나머지가 따라온다.
   * 그래서 「1~6월에 IPL 경기를 뛴 사람이 몇 명인가」가 진짜 규모다.
   */
  const scale = await prisma.$queryRaw<{ players: bigint; matches: bigint }[]>`
    SELECT count(DISTINCT s."playerId") AS players, count(DISTINCT m."id") AS matches
      FROM "Match" m
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
     WHERE m."leagueId" = ${league.id}
       AND m."startAt" >= ${JAN} AND m."startAt" < ${JUL}
  `
  console.info(
    `  IPL 1~6월 · 이미 우리 DB 에 있는 것 — 경기 ${Number(scale[0]!.matches).toLocaleString()}건 · ` +
      `선수 ${Number(scale[0]!.players).toLocaleString()}명`,
  )

  const all = await prisma.$queryRaw<{ players: bigint; matches: bigint }[]>`
    SELECT count(DISTINCT s."playerId") AS players, count(DISTINCT m."id") AS matches
      FROM "Match" m
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
     WHERE m."leagueId" = ${league.id}
  `
  console.info(
    `  IPL 전체       — 경기 ${Number(all[0]!.matches).toLocaleString()}건 · ` +
      `선수 ${Number(all[0]!.players).toLocaleString()}명`,
  )

  console.info('\n══ 2 · ★넥슨에 물어볼 닉네임 고르기★ (한 클랜만) ══\n')
  /* 경기가 가장 많은 IPL 클랜 하나 — 표본으로 제일 말이 되는 곳 */
  const top = await prisma.$queryRaw<{ clan: string; slug: string; lcid: string; games: bigint }[]>`
    SELECT c."name" AS clan, c."slug" AS slug, lc."id" AS lcid, count(*) AS games
      FROM "Match" m
      JOIN "LeagueClan" lc
        ON lc."id" = m."redLeagueClanId" OR lc."id" = m."blueLeagueClanId"
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE m."leagueId" = ${league.id} AND lc."leagueId" = ${league.id}
     GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 1
  `
  if (top.length === 0) {
    console.info('  IPL 경기가 없다')
    return
  }
  const pick = top[0]!
  console.info(`  고른 클랜  ★${pick.clan}★ (${pick.slug}) · IPL 경기 ${Number(pick.games)}건`)

  /*
   * 그 클랜 소속으로 뛴 선수들의 닉네임.
   * ⚠ ★날짜로 거르지 않는다★ — IPL 1~6월은 우리 DB 에 **0건**이라 (위 1번)
   *   1~6월로 거르면 아무도 안 나온다. 넥슨에 물어볼 사람을 고르는 것이 목적이므로
   *   **라인업이 붙은 경기(1,562건)에 이름이 있는 사람**이면 된다.
   */
  const names = await prisma.$queryRaw<{ name: string; games: bigint }[]>`
    SELECT p."name" AS name, count(*) AS games
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "Player" p ON p."id" = s."playerId"
     WHERE m."leagueId" = ${league.id}
       AND (m."redLeagueClanId" = ${pick.lcid} OR m."blueLeagueClanId" = ${pick.lcid})
     GROUP BY 1 ORDER BY 2 DESC LIMIT 12
  `
  console.info(`\n  그 클랜에서 뛴 선수 (라인업 붙은 경기 기준 · 상위 ${names.length}명)`)
  for (const n of names) console.info(`    ${n.name}\t${Number(n.games)}경기`)
  console.info('\n  ★이 닉네임들로 넥슨 /id → /match 를 몇 개만 부른다★')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
