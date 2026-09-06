/** ★시즌7 최종 순위를 무엇으로 매길 수 있나★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const FROM = "TIMESTAMP '2024-04-01 00:00:00'"
const TO = "TIMESTAMP '2026-09-02 22:00:00'"
const SCOPE = `m.origin='3rd.supply' AND l.slug='supply'
  AND m."startAt" >= ${FROM} AND m."startAt" < ${TO} AND m."supersededAt" IS NULL`
const q = <T>(s: string) => prisma.$queryRawUnsafe<T[]>(s)

/* ★한 번에 여덟 개를 세면 연결이 끊긴다★ — 표본 3만 줄로 비율만 본다 */
const [r] = await q<Record<string, number>>(`
  WITH s AS (
    SELECT ps.* FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id=ps."matchId"
      JOIN "League" l ON l.id=m."leagueId"
     WHERE ${SCOPE} LIMIT 30000)
  SELECT COUNT(*)::int AS "표본 줄",
         COUNT("ratingAfter")::int  AS "ratingAfter",
         COUNT("ratingUpdate")::int AS "ratingUpdate",
         COUNT("ratingBefore")::int AS "ratingBefore",
         COUNT(mvp)::int            AS "mvp",
         COUNT(assist)::int         AS "assist",
         COUNT(headshot)::int       AS "headshot",
         COUNT(dropout)::int        AS "dropout"
    FROM s`)
console.info('  ── 참가기록 표본 3만 줄에서 값이 있는 줄 ──')
for (const [k, v] of Object.entries(r ?? {})) console.info(`  ${k.padEnd(24)} ${Number(v).toLocaleString()}`)

const [m2] = await q<Record<string, number>>(`
  SELECT COUNT(*)::int AS "경기수",
         COUNT(m."redSourceRating")::int AS "원본 클랜점수 있는 경기",
         COUNT(m."redSourceRatingUpdate")::int AS "원본 클랜점수 증감 있는 경기",
         COUNT(m."mvpPlayerId")::int     AS "MVP 가 적힌 경기"
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE ${SCOPE}`)
console.info('')
for (const [k, v] of Object.entries(m2 ?? {})) console.info(`  ${k.padEnd(24)} ${Number(v).toLocaleString()}`)
await prisma.$disconnect()
