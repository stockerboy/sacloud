/**
 * ★매핑 안 되는 3클랜 — 사실만 적는다★ (2026-09-06 · Part 4 최종확인). ★읽기만 한다.★
 *
 * > «이 3개는 이번 Part 에서 ★임의로 slug 를 바꾸지 마라★»
 * > «★추측해서 병영수첩 slug 를 만들거나 다른 클랜과 합치지 마라★»
 *
 * ★고치는 코드가 아니다. 무엇이 사실인지 세는 코드다.★
 */
import { prisma } from '@sacloud/db'

const NAMES = ['deluxe', 'crucialrz', 'NeedΒackup']
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

for (const name of NAMES) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string; slug: string; leagues: string; sameName: number
      listRaw: number; listOk: number; lastTry: Date | null; lastStatus: string | null
      matches: number; noLineup: number; members: number
    }>
  >(`
    SELECT c.id, c.slug,
      COALESCE((SELECT STRING_AGG(DISTINCT l.slug, ',') FROM "LeagueClan" lc
                 JOIN "League" l ON l.id = lc."leagueId"
                WHERE lc."clanId" = c.id AND lc."expelledAt" IS NULL), '(활성 등록 없음)') AS leagues,
      (SELECT COUNT(*)::int FROM "Clan" c2 WHERE c2.name = c.name) AS "sameName",
      (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug) AS "listRaw",
      (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" r
        WHERE r."subject" = c.slug AND r."status"='ok') AS "listOk",
      (SELECT MAX(r."fetchedAt") FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug) AS "lastTry",
      (SELECT r."status" FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug
        ORDER BY r."fetchedAt" DESC LIMIT 1) AS "lastStatus",
      (SELECT COUNT(*)::int FROM "Match" m
         JOIN "LeagueClan" lc2 ON lc2.id IN (m."redLeagueClanId", m."blueLeagueClanId")
        WHERE lc2."clanId" = c.id AND m."startAt" >= ${CUT} AND m."supersededAt" IS NULL) AS matches,
      (SELECT COUNT(*)::int FROM "Match" m
         JOIN "LeagueClan" lc3 ON lc3.id IN (m."redLeagueClanId", m."blueLeagueClanId")
        WHERE lc3."clanId" = c.id AND m."startAt" >= ${CUT} AND m."supersededAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id)) AS "noLineup",
      0 AS members
    FROM "Clan" c WHERE c.name = $1`, name)

  for (const r of rows) {
    console.info(`\n════ ${name} ════`)
    console.info(`  우리 DB 의 slug        ★${r.slug}★`)
    console.info(`  활성 리그              ${r.leagues}`)
    console.info(`  같은 이름의 클랜 수     ${r.sameName}곳`)
    console.info(`  이 slug 로 받은 매치목록 ★${r.listRaw}줄★ (성공 ${r.listOk}) · 마지막 시도 ${r.lastTry?.toISOString() ?? '★없음★'} ${r.lastStatus ?? ''}`)
    console.info(`  기준시각 이후 경기      ${r.matches}건 · 그중 라인업 없는 것 ★${r.noLineup}건★`)
  }
}

console.info('\n\n════ 왜 매핑이 안 되나 (사실만) ════\n')
console.info('  클랜번호(clan_no)는 ★그 클랜을 주체로 매치목록을 받았을 때만★ 배운다.')
console.info('  위 셋은 ★그 slug 로 매치목록이 0줄★ 이다 → ★번호를 배울 길이 없다.★')
console.info('  배틀로그의 teamList 는 clan_no 만 주고 ★clan_name 이 null★ 이라 이름으로도 못 잇는다.')
console.info('\n  ⚠ ★추측하지 않는다★ — slug 를 지어내거나 다른 클랜과 합치지 않는다.')
console.info('    ★unresolved 로 남긴다.★')
await prisma.$disconnect()
