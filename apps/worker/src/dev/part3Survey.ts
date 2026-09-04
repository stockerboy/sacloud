/** ★Part 3 계획용 실측★ — 읽기만 한다 (2026-09-05) */
import { prisma } from '@sacloud/db'
const q = async (l: string, sql: string) => {
  console.info('\n### ' + l)
  console.info(JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))
}
await q('세 리그의 등록 클랜 (추방 안 된 것)', `
  SELECT l.slug, COUNT(*)::int AS clans FROM "LeagueClan" lc
  JOIN "League" l ON l.id=lc."leagueId"
  WHERE lc."expelledAt" IS NULL AND l.slug IN ('nolink','supply','sanply','daerule')
  GROUP BY 1 ORDER BY 2 DESC`)
await q('★클랜이 두 리그에 걸쳐 있나★ (Part 3 의 전제)', `
  SELECT a.slug AS la, b.slug AS lb, COUNT(*)::int AS n
  FROM "LeagueClan" x JOIN "League" a ON a.id=x."leagueId"
  JOIN "LeagueClan" y ON y."clanId"=x."clanId" AND y.id<>x.id
  JOIN "League" b ON b.id=y."leagueId"
  WHERE x."expelledAt" IS NULL AND y."expelledAt" IS NULL AND a.slug < b.slug
  GROUP BY 1,2 ORDER BY 3 DESC`)
await q('병영 원문 — 쌓인 양과 기간', `
  SELECT 'BarracksClanMatchRaw' AS t, COUNT(*)::int AS n,
         MIN("fetchedAt") AS first, MAX("fetchedAt") AS last FROM "BarracksClanMatchRaw"
  UNION ALL
  SELECT 'BarracksBattleLogRaw', COUNT(*)::int, MIN("fetchedAt"), MAX("fetchedAt") FROM "BarracksBattleLogRaw"`)
await q('★원문에 있는 클랜 이름이 어느 리그 것인가★ (분류의 재료)', `
  SELECT COUNT(DISTINCT c."subject")::int AS 조회한클랜수 FROM "BarracksClanMatchRaw" c`)
await q('기준시각 이후 경기 — 리그 × origin', `
  SELECT l.slug, m.origin, COUNT(*)::int AS n
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
  WHERE m."startAt" >= TIMESTAMP '2026-09-02 22:00:00' GROUP BY 1,2 ORDER BY 1`)
await prisma.$disconnect()
