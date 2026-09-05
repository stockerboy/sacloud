/** ★리그가 실제로 쓰는 맵★ — LeagueMap 표가 맞는지 데이터로 본다 (읽기만) */
import { prisma } from '@sacloud/db'
const q = async (l: string, sql: string) => {
  console.info('\n### ' + l)
  console.info(JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))
}
await q('리그별 LeagueMap 표 (인정 맵)', `
  SELECT l.slug, STRING_AGG(g.name, ' · ' ORDER BY g.name) AS maps
  FROM "League" l LEFT JOIN "LeagueMap" lm ON lm."leagueId"=l.id
  LEFT JOIN "GameMap" g ON g.id=lm."mapId"
  WHERE l.slug IN ('nolink','supply','sanply') GROUP BY 1 ORDER BY 1`)
await q('★실제 경기가 쓴 맵★ (기준시각 이후 · 살아 있는 줄)', `
  SELECT l.slug, g.name, COUNT(*)::int AS n
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "GameMap" g ON g.id=m."mapId"
  WHERE m."startAt" >= TIMESTAMP '2026-09-02 22:00:00' AND m."supersededAt" IS NULL
    AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1,2 ORDER BY 1, 3 DESC`)
await q('★원문이 말하는 맵★ (기준시각 이후 · 우리 등록 클랜이 낀 것만)', `
  SELECT c."payload"->>'map_name' AS map, COUNT(*)::int AS n
  FROM (SELECT DISTINCT ON ("matchKey") "matchKey","payload" FROM "BarracksClanMatchRaw"
        WHERE "status"='ok' AND "matchKey" >= '260903' ORDER BY "matchKey","id") c
  GROUP BY 1 ORDER BY 2 DESC LIMIT 12`)
await prisma.$disconnect()
