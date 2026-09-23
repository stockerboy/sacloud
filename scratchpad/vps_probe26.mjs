/* ★아이디 두 갈래 조사★ — 혜밤 · 차준성 · 자이언트 (사장님 2026-09-24). 읽기만 한다 */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['혜밤', '차준성', '자이언트']
for (const n of names) {
  const rows = await p.$queryRawUnsafe(`
    SELECT pl."id", pl."name", pl."sourcePlayerId", pl."nexonOuid", pl."origin", pl."createdAt", c."name" AS clan, c."slug" AS clan_slug,
           (SELECT COUNT(*)::int FROM "MatchPlayerStat" s WHERE s."playerId" = pl."id") AS stats,
           (SELECT MIN(m."startAt") FROM "MatchPlayerStat" s JOIN "Match" m ON m."id"=s."matchId" WHERE s."playerId"=pl."id") AS first_match,
           (SELECT MAX(m."startAt") FROM "MatchPlayerStat" s JOIN "Match" m ON m."id"=s."matchId" WHERE s."playerId"=pl."id") AS last_match,
           (SELECT string_agg(l."slug" || ':' || COALESCE(lc."name",'무소속'), ' / ') FROM "LeaguePlayer" lp JOIN "League" l ON l."id"=lp."leagueId" LEFT JOIN "Clan" lc ON lc."id"=lp."clanId" WHERE lp."playerId"=pl."id") AS leagues
    FROM "Player" pl LEFT JOIN "Clan" c ON c."id"=pl."clanId"
    WHERE pl."name" = $1 OR pl."name" ILIKE $2
    ORDER BY pl."createdAt"`, n, `%${n}%`)
  console.log(`\n==== ${n} — Player ${rows.length}줄`)
  for (const r of rows) console.log(JSON.stringify(r))
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    const ni = await p.$queryRawUnsafe(`SELECT * FROM "NexonIdentity" WHERE "playerId" = ANY($1)`, ids).catch((e) => [{ err: String(e).slice(0, 120) }])
    console.log(`-- NexonIdentity ${ni.length}줄`); for (const r of ni) console.log(JSON.stringify(r))
    const cand = await p.$queryRawUnsafe(`SELECT * FROM "NexonIdentityCandidate" WHERE "playerId" = ANY($1) LIMIT 10`, ids).catch(() => [])
    console.log(`-- Candidate ${cand.length}줄`); for (const r of cand) console.log(JSON.stringify(r))
    /* 경기 당시 소속 스냅샷 — 어느 줄이 어느 클랜 경기를 들고 있나 */
    const snap = await p.$queryRawUnsafe(`SELECT s."playerId", s."matchTimeClanName", COUNT(*)::int n, MIN(m."startAt") a, MAX(m."startAt") b FROM "MatchPlayerStat" s JOIN "Match" m ON m."id"=s."matchId" WHERE s."playerId" = ANY($1) GROUP BY 1,2 ORDER BY 1,4`, ids)
    console.log(`-- 경기 당시 소속`); for (const r of snap) console.log(JSON.stringify(r))
  }
}
await p.$disconnect()
