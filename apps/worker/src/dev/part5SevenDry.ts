/**
 * ★★시즌7 마감 카드 — dry-run★★ (2026-09-06 · Part 5 · 사장님 지시). ★한 줄도 안 쓴다.★
 *
 * > «시즌7 = 2024년 4월 ~ ★2026-09-03 07:00 KST 직전★ 의 3rd.supply 서플라이공식리그 기록»
 * > «★3rd.supply 현재 프로필 API 가 주는 9/6 누적값은 사용하지 않는다★»
 * > «origin 이 3rd.supply 이고 리그가 ★supply★ 인 데이터만 사용한다»
 * > «다른 리그(sanply · daerule · nolink) 는 ★절대 섞지 않는다★»
 * > «★원본에 없는 값을 임의 추정하지 않는다★»
 */
import { prisma } from '@sacloud/db'

/** 시즌7 창 — ★두 끝을 여기 한 번만 적는다★ */
const FROM = "TIMESTAMP '2024-04-01 00:00:00'"
/* 2026-09-03 07:00 KST = 2026-09-02 22:00 UTC. ★미러 동결·Cloud 0 시작과 같은 점★ */
const TO = "TIMESTAMP '2026-09-02 22:00:00'"

/** ★대상 경기★ — 이 조건이 시즌7의 정의다 */
const SCOPE = `
  m.origin = '3rd.supply'
  AND l.slug = 'supply'
  AND m."startAt" >= ${FROM}
  AND m."startAt" <  ${TO}
  AND m."supersededAt" IS NULL`

const q = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql)

console.info('══ ⑧⑨ 먼저 「섞이지 않았나」부터 확인한다 ══\n')
const [guard] = await q<{
  matches: number; other: number; after: number; before: number; notMirror: number
}>(`
  SELECT
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE ${SCOPE}) AS matches,
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE ${SCOPE} AND l.slug <> 'supply')                                    AS other,
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE ${SCOPE} AND m."startAt" >= ${TO})                                  AS after,
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE ${SCOPE} AND m."startAt" <  ${FROM})                                AS before,
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE ${SCOPE} AND m.origin <> '3rd.supply')                              AS "notMirror"`)
console.info(`  시즌7 대상 경기            ★${guard?.matches.toLocaleString()}건★`)
console.info(`  ⑨ 다른 리그가 섞인 건       ${guard?.other}건 ${guard?.other === 0 ? '★0★' : '★★섞였다★★'}`)
console.info(`  ⑧ 9/3 07:00 이후가 섞인 건  ${guard?.after}건 ${guard?.after === 0 ? '★0★' : '★★섞였다★★'}`)
console.info(`     2024-04 이전이 섞인 건   ${guard?.before}건`)
console.info(`     미러가 아닌 것이 섞인 건  ${guard?.notMirror}건`)

/* 참고 — 창 밖에 남는 supply 미러 경기가 몇 건인가 */
const [outside] = await q<{ before: number; after: number }>(`
  SELECT
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE m.origin='3rd.supply' AND l.slug='supply' AND m."startAt" < ${FROM})  AS before,
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE m.origin='3rd.supply' AND l.slug='supply' AND m."startAt" >= ${TO})   AS after`)
console.info(`\n  ★창 밖으로 빠지는 supply 미러 경기★ — 2024-04 이전 ${outside?.before}건 · 9/3 이후 ${outside?.after}건`)

console.info('\n══ ①②③④ 선수별 집계 ══\n')
const [tot] = await q<{
  players: number; rows: number; win: number; lose: number
  kill: number; death: number; noKill: number; noWeapon: number
}>(`
  WITH s AS (
    SELECT ps."playerId", ps.side, ps.kill, ps.death, ps.weapon, m."winnerSide"
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "League" l ON l.id = m."leagueId"
     WHERE ${SCOPE})
  SELECT COUNT(DISTINCT "playerId")::int                                    AS players,
         COUNT(*)::int                                                      AS rows,
         COUNT(*) FILTER (WHERE side = "winnerSide")::int                   AS win,
         COUNT(*) FILTER (WHERE side <> "winnerSide")::int                  AS lose,
         COALESCE(SUM(kill),0)::int                                         AS kill,
         COALESCE(SUM(death),0)::int                                        AS death,
         COUNT(*) FILTER (WHERE kill IS NULL OR death IS NULL)::int         AS "noKill",
         COUNT(*) FILTER (WHERE weapon IS NULL)::int                        AS "noWeapon"
    FROM s`)
console.info(`  ① 대상 선수            ★${tot?.players.toLocaleString()}명★`)
console.info(`     참가 기록 줄         ${tot?.rows.toLocaleString()}줄`)
console.info(`  ③ 승 ${tot?.win.toLocaleString()} · 패 ${tot?.lose.toLocaleString()} (합 ${((tot?.win ?? 0) + (tot?.lose ?? 0)).toLocaleString()} = 참가 줄과 ${((tot?.win ?? 0) + (tot?.lose ?? 0)) === (tot?.rows ?? 0) ? '★같다★' : '★다르다★'})`)
console.info(`  ④ 킬 ${tot?.kill.toLocaleString()} · 데스 ${tot?.death.toLocaleString()}`)
console.info(`  ⑥⑦ 킬/데스가 비어 있는 줄  ${tot?.noKill.toLocaleString()}줄`)
console.info(`     ⑤ 무기가 비어 있는 줄   ★${tot?.noWeapon.toLocaleString()}줄★ (${(((tot?.noWeapon ?? 0) / (tot?.rows || 1)) * 100).toFixed(1)}%)`)

console.info('\n══ ⑤ 스나/라플을 나눌 수 있나 ══\n')
const w = await q<{ weapon: string; rows: number; kill: number; death: number; players: number }>(`
  WITH s AS (
    SELECT ps."playerId", ps.kill, ps.death,
           CASE ps.weapon WHEN 0 THEN '라이플' WHEN 1 THEN '스나이퍼' ELSE '★모름(null)★' END AS weapon
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "League" l ON l.id = m."leagueId"
     WHERE ${SCOPE})
  SELECT weapon, COUNT(*)::int AS rows, COALESCE(SUM(kill),0)::int AS kill,
         COALESCE(SUM(death),0)::int AS death, COUNT(DISTINCT "playerId")::int AS players
    FROM s GROUP BY 1 ORDER BY 2 DESC`)
for (const r of w)
  console.info(`  ${r.weapon.padEnd(14)} ${String(r.rows).padStart(9)}줄 · 선수 ${String(r.players).padStart(6)}명 · 킬 ${r.kill.toLocaleString()} · 데스 ${r.death.toLocaleString()}`)

console.info('\n══ ②⑥ 카드를 만들 수 있는 선수 / 못 만드는 선수 ══\n')
const [mk] = await q<{ total: number; linked: number; unlinked: number; ge10: number; lt10: number }>(`
  WITH s AS (
    SELECT ps."playerId", COUNT(*)::int AS games
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
      JOIN "League" l ON l.id = m."leagueId"
     WHERE ${SCOPE} GROUP BY 1)
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "LeaguePlayer" lp
             JOIN "League" l2 ON l2.id = lp."leagueId" AND l2.slug='supply'
            WHERE lp."playerId" = s."playerId"))::int AS linked,
         COUNT(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM "LeaguePlayer" lp
             JOIN "League" l2 ON l2.id = lp."leagueId" AND l2.slug='supply'
            WHERE lp."playerId" = s."playerId"))::int AS unlinked,
         COUNT(*) FILTER (WHERE games >= 10)::int AS ge10,
         COUNT(*) FILTER (WHERE games <  10)::int AS lt10
    FROM s`)
console.info(`  집계에 나온 선수            ${mk?.total.toLocaleString()}명`)
console.info(`  ② 카드를 붙일 수 있는 선수   ★${mk?.linked.toLocaleString()}명★ (supply LeaguePlayer 가 있다)`)
console.info(`  ⑥ 붙일 자리가 없는 선수      ★${mk?.unlinked.toLocaleString()}명★ ← ⑦ supply LeaguePlayer 행이 없다`)
console.info(`     10판 이상 ${mk?.ge10.toLocaleString()}명 · 10판 미만 ${mk?.lt10.toLocaleString()}명 (원본은 10판 미만을 순위 0=배치고사로 둔다)`)
await prisma.$disconnect()
