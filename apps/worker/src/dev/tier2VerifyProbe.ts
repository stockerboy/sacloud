/**
 * **「2티어끼리」가 정말 맞나 — 눈으로 본다** (2026-09-04 · ★읽기 전용★).
 *
 * 사장님이 «이게 2티어끼리 한 경기만 잰 거야?» 를 ★두 번★ 물으셨다.
 * ★두 번 물으시는 건 숫자가 이상하다고 느끼신다는 뜻이다.★ ★그래서 펼쳐 본다.★
 *
 * ══ 확인할 넷 ══
 * ```
 * ① ★실제 경기 5건을 펼친다★ — 양쪽 클랜 이름 · 현재 티어 · 경기 당시 티어
 * ② ★「2티어」를 어느 칸으로 판정했나★ ⚠ ★0부터 세면 3티어를 잰 것이다★
 * ③ ★IPL 이 몇 티어까지 있고 각 티어에 몇 곳인가★
 * ④ ★선수 소속을 현재로 봤나 경기 당시로 봤나★ ⚠ ★이적한 선수가 섞이면 안 된다★
 * ```
 */
import { prisma } from '@sacloud/db'

const FROM = new Date('2026-06-01T00:00:00+09:00')
const TO = new Date('2026-09-01T00:00:00+09:00')
const kst = (d: Date): string =>
  new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ')

async function main(): Promise<void> {
  /* ── ② 어느 칸으로 판정했나 · ③ 티어 분포 ────────────────── */
  console.info('══ ② ★「2티어」는 `LeagueClan.division` = 2 로 판정했다★ ══\n')
  const dist = await prisma.$queryRaw<{ division: number; n: bigint; names: string }[]>`
    SELECT lc."division", count(*) AS n,
           string_agg(c."name", ' · ' ORDER BY c."name") AS names
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
      JOIN "Clan" c ON c."id" = lc."clanId"
     GROUP BY 1 ORDER BY 1
  `
  console.info('══ ③ ★IPL 티어 분포★ ══\n')
  for (const d of dist) {
    console.info(`  ★${d.division}티어★  ${Number(d.n)}곳`)
    console.info(`     ${d.names}`)
  }
  const min = Math.min(...dist.map((d) => d.division))
  console.info(
    `\n  ⚠ ★티어 번호가 ${min} 부터 시작한다★ — ` +
      `${min === 2 ? '★★1티어가 없다. 「2티어」가 IPL 의 최상위다★★' : min === 1 ? '★1부터다★' : '★★0부터다 — 「2」는 3번째 티어다★★'}`,
  )

  /* ── ① 실제 경기 5건 ──────────────────────────────────── */
  console.info('\n══ ① ★실제 경기 5건을 펼친다★ ══\n')
  const games = await prisma.$queryRaw<
    {
      id: string
      startAt: Date
      redClan: string
      blueClan: string
      redNow: number
      blueNow: number
      redThen: number
      blueThen: number
      players: bigint
    }[]
  >`
    WITH t2 AS (
      SELECT lc."id" AS lcid FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
       WHERE lc."division" = 2
    )
    SELECT m."id", m."startAt",
           rc."name" AS "redClan", bc."name" AS "blueClan",
           rlc."division" AS "redNow", blc."division" AS "blueNow",
           m."redDivisionAtMatch" AS "redThen", m."blueDivisionAtMatch" AS "blueThen",
           (SELECT count(*) FROM "MatchPlayerStat" s WHERE s."matchId" = m."id") AS players
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
      JOIN "Clan" rc ON rc."id" = rlc."clanId"
      JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
      JOIN "Clan" bc ON bc."id" = blc."clanId"
     WHERE m."startAt" >= ${FROM} AND m."startAt" < ${TO}
       AND m."redLeagueClanId" IN (SELECT lcid FROM t2)
       AND m."blueLeagueClanId" IN (SELECT lcid FROM t2)
       AND EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")
     ORDER BY m."startAt" DESC
     LIMIT 5
  `
  for (const g of games) {
    const okNow = g.redNow === 2 && g.blueNow === 2
    const okThen = g.redThen === 2 && g.blueThen === 2
    console.info(
      `  ${kst(g.startAt)} KST  ★${g.redClan}(현${g.redNow}티어/당시${g.redThen}) ` +
        `vs ${g.blueClan}(현${g.blueNow}/당시${g.blueThen})★  ${Number(g.players)}명` +
        `  ${okNow ? '✔현재2v2' : '★현재 어긋남★'} ${okThen ? '✔당시2v2' : '★당시 어긋남★'}`,
    )
  }

  /* ── ④ 선수 소속을 무엇으로 봤나 ──────────────────────── */
  console.info('\n══ ④ ★선수 소속 — 「현재」로 봤다★ ══\n')
  console.info('  질의가 `LeaguePlayer.clanId` 를 썼다 = ★지금 소속★ 이다.')
  console.info('  ⚠ ★경기 당시 소속은 `MatchPlayerStat.matchTimeClanName` 에 따로 있다★ — 안 썼다.')
  console.info('  ★이적한 선수는 지금 클랜 이름으로 나온다.★ 얼마나 되는지 센다\n')
  const moved = await prisma.$queryRaw<{ total: bigint; same: bigint; unknown: bigint }[]>`
    WITH t2 AS (
      SELECT lc."id" AS lcid, lc."clanId" FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
       WHERE lc."division" = 2
    )
    SELECT count(*) AS total,
           count(*) FILTER (WHERE st."matchTimeClanName" = c."name") AS same,
           count(*) FILTER (WHERE st."matchTimeClanName" IS NULL)    AS unknown
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      JOIN "MatchPlayerStat" st ON st."matchId" = m."id"
      JOIN "LeaguePlayer" lp ON lp."playerId" = st."playerId" AND lp."leagueId" = m."leagueId"
      JOIN "Clan" c ON c."id" = lp."clanId"
     WHERE m."startAt" >= ${FROM} AND m."startAt" < ${TO}
       AND m."redLeagueClanId" IN (SELECT lcid FROM t2)
       AND m."blueLeagueClanId" IN (SELECT lcid FROM t2)
       AND lp."clanId" IN (SELECT "clanId" FROM t2)
       AND st."kill" IS NOT NULL
  `
  const mv = moved[0]!
  const tot = Number(mv.total)
  const same = Number(mv.same)
  const unk = Number(mv.unknown)
  console.info(`  참가 기록 ${tot.toLocaleString()}건 중`)
  console.info(`    ★지금 클랜 = 경기 당시 클랜★  ${same.toLocaleString()}건 (${((100 * same) / tot).toFixed(1)}%)`)
  console.info(`    경기 당시 클랜을 모름          ${unk.toLocaleString()}건 (${((100 * unk) / tot).toFixed(1)}%)`)
  console.info(
    `    ★★다른 클랜이었다 ${(tot - same - unk).toLocaleString()}건 (${((100 * (tot - same - unk)) / tot).toFixed(1)}%)★★` +
      ' ← ★이 몫이 「이적한 선수」다★',
  )

  /* ── 보태기 · 데스에 무엇이 들어가나 ──────────────────── */
  console.info('\n══ 보태기 · ★킬뎃이 50% 근처인 게 자연스러운가★ ══\n')
  const sum = await prisma.$queryRaw<{ kills: bigint; deaths: bigint }[]>`
    WITH t2 AS (
      SELECT lc."id" AS lcid FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
       WHERE lc."division" = 2
    )
    SELECT coalesce(sum(st."kill"),0) AS kills, coalesce(sum(st."death"),0) AS deaths
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      JOIN "MatchPlayerStat" st ON st."matchId" = m."id"
     WHERE m."startAt" >= ${FROM} AND m."startAt" < ${TO}
       AND m."redLeagueClanId" IN (SELECT lcid FROM t2)
       AND m."blueLeagueClanId" IN (SELECT lcid FROM t2)
       AND st."kill" IS NOT NULL AND st."death" IS NOT NULL
  `
  const s2 = sum[0]!
  const K = Number(s2.kills)
  const D = Number(s2.deaths)
  console.info(`  표본 전체 — 킬 ${K.toLocaleString()} · 데스 ${D.toLocaleString()}`)
  console.info(
    `  ★합계 킬뎃 ${((100 * K) / (K + D)).toFixed(1)}%★  · 킬−데스 차 ${(K - D).toLocaleString()}`,
  )
  console.info(
    '\n  ★읽는 법★ — ★한 경기의 킬 합과 데스 합은 원래 같다★ (누가 죽으면 누가 죽인 것).\n' +
      '             합계가 ★50%에서 크게 벗어나면★ 자살·팀킬이 섞였거나 한쪽만 센 것이다.\n' +
      '             ★50% 근처면 「서로 비슷해서」가 아니라 「원래 그래야 하는 값」이다★',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
