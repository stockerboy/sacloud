/**
 * **사장님께 보일 선수 두 명을 고른다** (O-050 2단계 · 2026-09-03 · ★읽기 전용★).
 *
 * ══ 무엇을 고르나 ══
 * ```
 * ① ★기록이 꽉 찬 선수★  래더·승률·킬뎃·평균킬·MVP·순위가 다 차 있고 최근 경기도 있다
 *                        → 사장님이 ★「값이 사라졌나」★ 를 보실 수 있다
 * ② ★기록이 적은 선수★  → ★값이 빈 화면이 안 깨지는지★ 를 보실 수 있다
 * ```
 * ⚠ ★리그는 SPL(`supply`) 이다.★ IPL 은 어시가 `-` 로 뜨고 딜량이 없어서
 *   ★톤 얘기가 자료 얘기로 새기 쉽다.★ 지금 보이는 것은 ★톤★ 이다.
 *
 * ⚠ 그리고 ★랭킹에 드는 선수만★ 고른다 (`placement = false`) —
 *   개인랭킹 화면이 쓰는 그 기준이다. 안 걸면 한 판도 안 뛴 사람이 뽑힌다 (O-043).
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
}

const KST = 9 * 60 * 60 * 1000
const kst = (d: Date | null): string =>
  d === null ? '없음' : new Date(d.getTime() + KST).toISOString().slice(0, 16).replace('T', ' ')

async function main(): Promise<void> {
  /* ⚠ 정렬 방향을 문자열로 끼워 넣을 수 없다 (주입). 두 질의를 따로 쓴다 */
  const many = await prisma.$queryRaw<Row[]>`
    SELECT lp."playerId", p."name", lp."rating",
           count(*)                                          AS games,
           coalesce(sum(s."kill"), 0)                        AS kills,
           coalesce(sum(s."death"), 0)                       AS deaths,
           count(*) FILTER (WHERE m."winnerSide" = s."side")  AS wins,
           count(*) FILTER (WHERE s."mvp" IS TRUE)           AS mvps,
           max(m."startAt")                                  AS last
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
      JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
      JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
     WHERE l."slug" = 'supply' AND lp."placement" = false
       AND m."startAt" >= now() - interval '60 days'
     GROUP BY 1, 2, 3
    HAVING count(*) FILTER (WHERE s."mvp" IS TRUE) > 0
     ORDER BY count(*) DESC
     LIMIT 3
  `
  const few = await prisma.$queryRaw<Row[]>`
    SELECT lp."playerId", p."name", lp."rating",
           count(*)                                          AS games,
           coalesce(sum(s."kill"), 0)                        AS kills,
           coalesce(sum(s."death"), 0)                       AS deaths,
           count(*) FILTER (WHERE m."winnerSide" = s."side")  AS wins,
           count(*) FILTER (WHERE s."mvp" IS TRUE)           AS mvps,
           max(m."startAt")                                  AS last
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
      JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
      JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
     WHERE l."slug" = 'supply' AND lp."placement" = false
     GROUP BY 1, 2, 3
    HAVING count(*) BETWEEN 3 AND 8
     ORDER BY max(m."startAt") DESC
     LIMIT 3
  `

  const show = (title: string, rows: Row[]): void => {
    console.info(`\n══ ${title} ══\n`)
    for (const r of rows) {
      const g = Number(r.games)
      const k = Number(r.kills)
      const d = Number(r.deaths)
      console.info(`  ★${r.name}★  ${g.toLocaleString()}판`)
      console.info(
        `     래더 ${r.rating} · 승률 ${((100 * Number(r.wins)) / g).toFixed(1)}%` +
          ` · 킬뎃 ${d === 0 ? k : (k / d).toFixed(3)}` +
          ` · 평균킬 ${(k / g).toFixed(1)} · MVP ${Number(r.mvps)}회`,
      )
      console.info(`     마지막 경기 ${kst(r.last)}`)
      console.info(`     ★https://3rdcloud.my/league/supply/player/${r.playerId}★`)
    }
  }
  show('① 기록이 꽉 찬 선수 (최근 60일 · MVP 있음)', many)
  show('② 기록이 적은 선수 (3~8판)', few)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
