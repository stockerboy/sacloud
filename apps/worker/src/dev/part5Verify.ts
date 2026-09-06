/**
 * ★Part 5 전체 검증★ (2026-09-06 · 사장님 완료조건). ★읽기만 한다.★
 */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"   /* = 2026-09-03 07:00 KST */
const OCT = "TIMESTAMP '2026-09-30 15:00:00'"   /* = 2026-10-01 00:00 KST */
const q = <T>(s: string) => prisma.$queryRawUnsafe<T[]>(s)
const line = (ok: boolean, label: string, detail: string) =>
  console.info(`  ${ok ? '✔' : '✘'} ${label.padEnd(40)} ${detail}`)

console.info('══ ② 시즌7 적재 ══\n')
const cards = await q<{ number: number; season: number | null; n: number; src: string | null }>(`
  SELECT s.number, p.season, COUNT(*)::int AS n, MAX(p.source) AS src
    FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id = p."seasonId"
   GROUP BY 1,2 ORDER BY 1 DESC`)
for (const c of cards)
  console.info(`     내부 ${String(c.number).padStart(5)} · 원본시즌 ${String(c.season).padStart(2)} · ${String(c.n).padStart(6)}장 · ${(c.src ?? '-').slice(0, 40)}`)
const seven = cards.find((c) => c.number === -107)
const older = cards.filter((c) => c.number < -100 && c.number !== -107)
line(seven?.n === 10354, '시즌7 카드 10,354장', `${seven?.n ?? 0}장`)
line(
  older.reduce((a, b) => a + b.n, 0) === 10673,
  '시즌1~6 이 그대로다 (10,673장)',
  `${older.reduce((a, b) => a + b.n, 0)}장`,
)
const [s7null] = await q<{ rank: number; rc: number; rating: number }>(`
  SELECT COUNT(p.rank)::int AS rank, COUNT(p."rankCount")::int AS rc, COUNT(p.rating)::int AS rating
    FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id=p."seasonId" WHERE s.number = -107`)
line(
  (s7null?.rank ?? 1) === 0 && (s7null?.rc ?? 1) === 0 && (s7null?.rating ?? 1) === 0,
  '★시즌7에 순위를 안 넣었다★',
  `rank ${s7null?.rank} · rankCount ${s7null?.rc} · rating ${s7null?.rating}`,
)
const [s7sum] = await q<{ win: number; lose: number; kill: number; death: number; games: number }>(`
  SELECT COALESCE(SUM(p.win),0)::int AS win, COALESCE(SUM(p.lose),0)::int AS lose,
         COALESCE(SUM(p.kill),0)::int AS kill, COALESCE(SUM(p.death),0)::int AS death,
         COALESCE(SUM(p.games),0)::int AS games
    FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id=p."seasonId" WHERE s.number = -107`)
console.info(
  `     시즌7 합계 — ${s7sum?.win.toLocaleString()}승 ${s7sum?.lose.toLocaleString()}패 · ` +
    `${s7sum?.kill.toLocaleString()}킬 ${s7sum?.death.toLocaleString()}데스 · ${s7sum?.games.toLocaleString()}경기`,
)

console.info('\n══ ⑤ Match.seasonId ══\n')
const [ms] = await q<{ pastCloud0: number; newNull: number; newWrong: number; octWrong: number }>(`
  SELECT
    (SELECT COUNT(*)::int FROM "Match" m JOIN "Season" s ON s.id=m."seasonId"
      WHERE m."startAt" < ${CUT} AND s.number = 0)                              AS "pastCloud0",
    (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" >= ${CUT} AND "seasonId" IS NULL) AS "newNull",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "Season" s ON s.id=m."seasonId"
      WHERE m."startAt" >= ${CUT} AND m."startAt" < ${OCT} AND s.number <> 0)   AS "newWrong",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "Season" s ON s.id=m."seasonId"
      WHERE m."startAt" >= ${OCT} AND s.number <> 1)                            AS "octWrong"`)
line((ms?.pastCloud0 ?? 1) === 0, '기준시각 이전에 Cloud 0 이 붙은 것', `${ms?.pastCloud0}건`)
line((ms?.newNull ?? 1) === 0, 'Cloud 0 기간인데 seasonId 가 빈 것', `${ms?.newNull}건`)
line((ms?.newWrong ?? 1) === 0, 'Cloud 0 기간인데 다른 시즌인 것', `${ms?.newWrong}건`)
line((ms?.octWrong ?? 1) === 0, '10/1 이후인데 Cloud 1 이 아닌 것', `${ms?.octWrong}건`)

console.info('\n══ 안 건드렸나 ══\n')
const [keep] = await q<{ past: number; stats: number; mirror: number; sourceNull: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT})                       AS past,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
           WHERE m."startAt" < ${CUT})                                                      AS stats,
         (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS mirror,
         (SELECT COUNT(*)::int FROM "Match" WHERE "sourceMatchId" IS NULL)                  AS "sourceNull"`)
line(keep?.past === 389367, '과거 경기 389,367건 그대로', `${keep?.past.toLocaleString()}건`)
line(keep?.stats === 3698494, '과거 참가기록 3,698,494줄 그대로', `${keep?.stats.toLocaleString()}줄`)
line(keep?.mirror === 261, '미러 신규 261 고정', `${keep?.mirror}건`)
console.info(`     sourceMatchId 가 빈 경기 ${keep?.sourceNull}건`)

const league = await q<{ slug: string; n: number }>(`
  SELECT l.slug, COUNT(*)::int AS n FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
   GROUP BY 1 ORDER BY 1`)
console.info(`     리그별 경기 — ${league.map((l) => `${l.slug} ${l.n.toLocaleString()}`).join(' · ')}`)
await prisma.$disconnect()
