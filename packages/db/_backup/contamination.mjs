/** rollup 이 덮은 행이 몇 개인지 센다. 읽기 전용.
 *  판별: 랭킹 노출 선수인데 win+lose 가 placementPlayed 와 다르다.
 *  (우리 반영은 둘을 같은 replay 에서 쓰므로 반드시 같아야 한다) */
import { PrismaClient } from '../generated/client/index.js'
const p = new PrismaClient()
console.table(
  await p.$queryRawUnsafe(`
SELECT l.slug,
  count(*)::int AS "랭킹노출",
  count(*) FILTER (WHERE lp.win + lp.lose = lp."placementPlayed")::int AS "정상",
  count(*) FILTER (WHERE lp.win + lp.lose <> lp."placementPlayed")::int AS "덮인행",
  sum(lp.win)::int AS "승합계", sum(lp."placementPlayed")::int AS "판수합계"
FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId"
WHERE l.slug IN ('supply','sanply') AND NOT lp.placement
GROUP BY 1 ORDER BY 1`),
)
await p.$disconnect()
