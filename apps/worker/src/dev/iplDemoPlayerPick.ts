/**
 * **사장님께 보일 IPL 선수를 고른다** (O-051 뒤 · 2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 이제야 볼 것이 있나 ══
 *
 * 매치목록 43클랜을 받으면서 클랜번호 표가 채워졌고 —
 * ```
 * 라인업 가능  72경기 → ★2,432경기★   참가 기록 720 → ★24,320건★
 * ```
 * ★그전에는 보여 드릴 IPL 화면이 사실상 비어 있었다.★
 *
 * ══ ⚠ 미리 알아야 할 것 두 가지 ══
 * ```
 * ★어시·딜량이 100% null 이다★  병영수첩이 안 준다 (실측 · nolink 15,620행 전부)
 *                              → 어시 자리에 `-` 가 뜬다. ★그건 규칙이 시킨 표기다★
 *                                (`matchDetailView.ts` — 일부만 모르면 그 자리에 `-`)
 * ★무기는 98.3% 안다★           → ★스나/라플이 갈린다.★ 그걸 볼 수 있는 선수를 고른다
 * ```
 *
 * ⚠ ★랭킹에 드는 선수만★ 고른다 (`placement = false`) — 개인랭킹 화면과 같은 기준 (O-043).
 */
import { prisma } from '@sacloud/db'

interface Row {
  playerId: string
  name: string
  rating: number
  games: bigint
  kills: bigint
  deaths: bigint
  wins: bigint
  mvps: bigint
  last: Date | null
  snipers: bigint
  rifles: bigint
  weaponKnown: bigint
  assistKnown: bigint
}

const KST = 9 * 60 * 60 * 1000
const kst = (d: Date | null): string =>
  d === null ? '없음' : new Date(d.getTime() + KST).toISOString().slice(0, 16).replace('T', ' ')

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT lp."playerId", p."name", lp."rating",
           count(*)                                          AS games,
           coalesce(sum(s."kill"), 0)                        AS kills,
           coalesce(sum(s."death"), 0)                       AS deaths,
           count(*) FILTER (WHERE m."winnerSide" = s."side")  AS wins,
           count(*) FILTER (WHERE s."mvp" IS TRUE)           AS mvps,
           max(m."startAt")                                  AS last,
           count(*) FILTER (WHERE s."weapon" = 1)            AS snipers,
           count(*) FILTER (WHERE s."weapon" = 0)            AS rifles,
           count(s."weapon")                                 AS "weaponKnown",
           count(s."assist")                                 AS "assistKnown"
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
      JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
      JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
     WHERE l."slug" = 'nolink'
       AND lp."placement" = false
     GROUP BY 1, 2, 3
    HAVING count(*) >= 20
       AND count(*) FILTER (WHERE s."weapon" = 1) > 0
       AND count(*) FILTER (WHERE s."weapon" = 0) > 0
     ORDER BY count(*) DESC
     LIMIT 5
  `

  console.info('══ ★IPL 선수★ — 스나·라플이 둘 다 있는 사람 (무기가 갈리는 걸 볼 수 있다) ══\n')
  if (rows.length === 0) {
    console.info('  ★조건에 맞는 선수가 없다★')
    return
  }
  for (const r of rows) {
    const g = Number(r.games)
    const k = Number(r.kills)
    const d = Number(r.deaths)
    const wk = Number(r.weaponKnown)
    console.info(`  ★${r.name}★  ${g.toLocaleString()}판`)
    console.info(
      `     래더 ${r.rating} · 승률 ${((100 * Number(r.wins)) / g).toFixed(1)}%` +
        ` · 킬뎃 ${d === 0 ? k : (k / d).toFixed(3)}` +
        ` · 평균킬 ${(k / g).toFixed(1)} · MVP ${Number(r.mvps)}회`,
    )
    console.info(
      `     ★스나 ${Number(r.snipers)}판 · 라플 ${Number(r.rifles)}판★` +
        `  (무기를 아는 판 ${((100 * wk) / g).toFixed(1)}%)` +
        `  ⚠ 어시를 아는 판 ★${((100 * Number(r.assistKnown)) / g).toFixed(1)}%★`,
    )
    console.info(`     마지막 경기 ${kst(r.last)}`)
    console.info(`     ★https://3rdcloud.my/league/nolink/player/${r.playerId}★`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
