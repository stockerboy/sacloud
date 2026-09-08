/* ★회차 기록기★ — 한 줄에 한 회차. 「한 번 되는 것」과 「계속 되는 것」을 가르기 위한 것.
 *  사장님 지시(2026-09-08): 각 회차마다 시간·선택클랜수·포함률·요청성공/실패·신규RAW·
 *  신규Match·complete lineup·API최신·메모리·크롬·DB오류·exit code 를 기록하라.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { prisma } from './q.mjs'

const dir = new URL('./', import.meta.url)
const STATE = new URL('lap.state.json', dir)
const OUT = new URL('lap.log', dir)

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null
const now = new Date()
const iso = (d) => (d ? new Date(d).toISOString() : null)
const hhmm = (d) => (d ? new Date(d).toLocaleTimeString('ko-KR', { hour12: false }) : '—')
const mins = (d) => (d ? Math.round((now - new Date(d)) / 60000) : null)

const q = await prisma.$queryRaw`
  SELECT (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw")  listRows,
         (SELECT COUNT(*)::int FROM "BarracksBattleLogRaw")   logRows,
         (SELECT COUNT(*)::int FROM "Match" WHERE "supersededAt" IS NULL) matchRows,
         (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus"='complete') lineupRows,
         (SELECT COUNT(*)::int FROM "BarracksListRequest")     reqRows,
         (SELECT SUM("requests")::int FROM "BarracksListRequest") reqTotal,
         (SELECT SUM("failures")::int FROM "BarracksListRequest") failTotal,
         (SELECT MAX("fetchedAt") FROM "BarracksClanMatchRaw")  listAt,
         (SELECT MAX("fetchedAt") FROM "BarracksBattleLogRaw")  logAt,
         (SELECT MAX("ingestedAt") FROM "Match")                matchAt,
         (SELECT MAX("lineupCheckedAt") FROM "Match" WHERE "lineupStatus"='complete') lineupAt,
         (SELECT MAX("startAt") FROM "Match" WHERE "supersededAt" IS NULL) gameAt`
const x = q[0]

/* 큐 포함률 — 실제 선택 규칙 그대로 */
const cov = (await prisma.$queryRaw`
  WITH act AS (
    SELECT z."lcid", MAX(z."startAt") AS "lastMatch" FROM (
      SELECT m."redLeagueClanId" AS "lcid", m."startAt" FROM "Match" m WHERE m."supersededAt" IS NULL
      UNION ALL SELECT m."blueLeagueClanId", m."startAt" FROM "Match" m WHERE m."supersededAt" IS NULL
    ) z GROUP BY z."lcid"
  ), pool AS (
    SELECT DISTINCT c."slug", q."requestedAt", a."lastMatch"
      FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId" JOIN "Clan" c ON c."id"=lc."clanId"
      LEFT JOIN "BarracksListRequest" q ON q."subject"=c."slug"
      LEFT JOIN act a ON a."lcid"=lc."id"
     WHERE l."slug" = ANY(ARRAY['nolink','supply','sanply']) AND lc."expelledAt" IS NULL
  ), graded AS (
    SELECT p.*, CASE
      WHEN p."requestedAt" IS NULL THEN 0
      WHEN p."requestedAt" < NOW() - INTERVAL '6 hours' THEN 0
      WHEN p."lastMatch" >= NOW() - INTERVAL '1 hour' THEN 1
      WHEN p."lastMatch" >= NOW() - INTERVAL '6 hours' THEN 2
      WHEN p."lastMatch" >= NOW() - INTERVAL '24 hours' THEN 3
      ELSE 4 END AS band FROM pool p
  ), ranked AS (
    SELECT g.*, ROW_NUMBER() OVER (PARTITION BY g.band ORDER BY g."requestedAt" ASC NULLS FIRST, g."slug") rn FROM graded g
  ), picked AS (
    SELECT r."slug", r."lastMatch" FROM ranked r
     ORDER BY CASE WHEN r.band=0 AND r.rn>30 THEN 1 ELSE 0 END, r.band, r."requestedAt" ASC NULLS FIRST, r."slug"
     LIMIT 150
  )
  SELECT (SELECT COUNT(*)::int FROM picked p WHERE p."lastMatch" >= NOW() - INTERVAL '18 hours') inq,
         (SELECT COUNT(DISTINCT c."slug")::int FROM "Match" m
            JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId")
            JOIN "Clan" c ON c."id"=lc."clanId"
           WHERE m."supersededAt" IS NULL AND m."startAt" >= NOW() - INTERVAL '18 hours') tot,
         (SELECT COUNT(*)::int FROM "LeagueClan" lc JOIN "League" l ON l."id"=lc."leagueId"
            JOIN "Clan" c ON c."id"=lc."clanId"
            LEFT JOIN "BarracksListRequest" q ON q."subject"=c."slug"
           WHERE l."slug"=ANY(ARRAY['nolink','supply','sanply']) AND lc."expelledAt" IS NULL AND q."subject" IS NULL) never`)[0]
const pct = cov.tot ? Math.round((cov.inq / cov.tot) * 100) : 100

const leases = await prisma.$queryRaw`
  SELECT COUNT(*)::int stuck FROM "CollectorLease"
   WHERE "releasedAt" IS NULL AND "heartbeatAt" < NOW() - INTERVAL '20 minutes'`

const d = (a, b) => (prev ? a - b : 0)
const row = {
  at: iso(now),
  listRows: x.listrows, logRows: x.logrows, matchRows: x.matchrows, lineupRows: x.lineuprows,
  dList: d(x.listrows, prev?.listRows ?? 0), dLog: d(x.logrows, prev?.logRows ?? 0),
  dMatch: d(x.matchrows, prev?.matchRows ?? 0), dLineup: d(x.lineuprows, prev?.lineupRows ?? 0),
  reqRows: x.reqrows, reqTotal: x.reqtotal, failTotal: x.failtotal, never: cov.never,
  cov: pct, inq: cov.inq, tot: cov.tot,
  listAt: iso(x.listat), matchAt: iso(x.matchat), lineupAt: iso(x.lineupat), gameAt: iso(x.gameat),
  stuckLease: leases[0].stuck,
}
writeFileSync(STATE, JSON.stringify(row))
const line = [
  now.toLocaleString('ko-KR', { hour12: false }).slice(5),
  `포함률 ${String(pct).padStart(3)}%(${cov.inq}/${cov.tot})`,
  `미요청 ${String(cov.never).padStart(3)}곳`,
  `+목록RAW ${String(row.dList).padStart(4)}`,
  `+로그RAW ${String(row.dLog).padStart(4)}`,
  `+Match ${String(row.dMatch).padStart(3)}`,
  `+라인업 ${String(row.dLineup).padStart(3)}`,
  `목록RAW ${hhmm(x.listat)}(${mins(x.listat)}분)`,
  `Match ${hhmm(x.matchat)}(${mins(x.matchat)}분)`,
  `라인업 ${hhmm(x.lineupat)}(${mins(x.lineupat)}분)`,
  `최근경기 ${hhmm(x.gameat)}(${mins(x.gameat)}분)`,
  `요청누적 ${x.reqtotal}/실패 ${x.failtotal}`,
  row.stuckLease ? `★임대막힘 ${row.stuckLease}★` : '임대OK',
].join(' | ')
appendFileSync(OUT, line + '\n')
console.log(line)
await prisma.$disconnect()
