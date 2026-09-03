/**
 * **밤새 받을 수 있는 것이 실제로 몇 건인가** (2026-09-04 · 읽기 전용).
 *
 * ★사장님: «내일아침까지 3월부터 9월초까지 경기만 잘 채워놔»★
 *
 * ⚠ 수집기가 받을 대상을 `BarracksClanMatchRaw` 에서 고른다 (`pendingPairs`).
 *   그런데 ★그 표가 1,298건뿐★ 이고 우리 IPL 경기는 ★24,801건★ 이다.
 *   ★그러면 밤새 돌려도 1,298건 언저리에서 끝난다.★
 *
 * ★「우리가 아는 경기 24,801건」의 키로 배틀로그를 받을 수 있는지★ 를 본다 —
 * 받을 수 있으면 ★목록 없이도 채울 수 있다★.
 */
import { prisma } from '@sacloud/db'
const pc = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

async function main() {
  console.info('══ ★지금 수집기가 받을 수 있는 것★ (BarracksClanMatchRaw 기준) ══\n')
  const cur = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT c."matchKey") AS n
      FROM "BarracksClanMatchRaw" c
     WHERE c."status" = 'ok' AND c."payload"->>'clan_no' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "BarracksBattleLogRaw" b
                        WHERE b."matchKey" = c."matchKey" AND b."status" = 'ok')
  `
  console.info(`  ★${Number(cur[0]!.n).toLocaleString()}건★ — ★이게 밤새 받을 수 있는 전부다★`)

  console.info('\n══ ★그런데 우리가 아는 IPL 경기는★ ══\n')
  const all = await prisma.$queryRaw<{ n: bigint; noLog: bigint }[]>`
    SELECT count(*) AS n,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM "BarracksBattleLogRaw" b
              WHERE b."matchKey" = m."sourceMatchId" AND b."status" = 'ok')) AS "noLog"
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     WHERE m."sourceMatchId" IS NOT NULL
  `
  const a = all[0]!
  const n = Number(a.n), no = Number(a.noLog)
  console.info(`  IPL 경기 ${n.toLocaleString()}건 중 ★배틀로그가 없는 것 ${no.toLocaleString()}건★ ${pc(no, n)}`)
  console.info('\n  ⚠ ★이 경기들의 키는 우리가 안다.★ ★클랜번호만 있으면 배틀로그를 받을 수 있다★')

  console.info('\n══ ★그 경기의 클랜번호를 아는가★ ══\n')
  const withNo = await prisma.$queryRaw<{ n: bigint; withNo: bigint }[]>`
    WITH need AS (
      SELECT m."sourceMatchId" AS mk, m."redLeagueClanId" AS lc
        FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
       WHERE m."sourceMatchId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "BarracksBattleLogRaw" b
                          WHERE b."matchKey" = m."sourceMatchId" AND b."status" = 'ok')
    )
    SELECT count(*) AS n,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "BarracksClanMatchRaw" c
              WHERE c."payload"->>'clan_no' IS NOT NULL
                AND c."subject" = (SELECT cl."slug" FROM "LeagueClan" x
                                    JOIN "Clan" cl ON cl."id" = x."clanId"
                                   WHERE x."id" = need.lc))) AS "withNo"
      FROM need
  `
  const w = withNo[0]!
  console.info(`  배틀로그가 없는 ${Number(w.n).toLocaleString()}건 중`)
  console.info(`  ★그 클랜의 번호를 아는 것 ${Number(w.withNo).toLocaleString()}건★ ${pc(Number(w.withNo), Number(w.n))}`)
  console.info('\n★읽는 법★ — 이 값이 크면 ★수집기가 `Match` 를 재료로 쓰게 고치면 밤새 다 받을 수 있다★')
  console.info('           작으면 ★클랜번호부터 채워야 한다★')
}
main().catch(console.error).finally(() => prisma.$disconnect())
