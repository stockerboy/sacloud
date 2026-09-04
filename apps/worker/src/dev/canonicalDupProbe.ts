/** ★신규 Match 중복과 DB 수준 방어가 가능한가★ (2026-09-05 · Part 3 준비). 읽기만 한다 */
import { prisma } from '@sacloud/db'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const q = async (l: string, sql: string) => {
  console.info('\n### ' + l)
  console.info(JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))
}

await q('기준시각 이후 · sourceMatchId 중복이 지금 있나', `
  SELECT COUNT(*)::int AS 중복된_경기번호 FROM (
    SELECT "sourceMatchId" FROM "Match"
    WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1) t`)

await q('기준시각 이후 · 경기번호 하나가 몇 행인가 (분포)', `
  SELECT rows_per_key, COUNT(*)::int AS keys FROM (
    SELECT "sourceMatchId", COUNT(*)::int AS rows_per_key FROM "Match"
    WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL GROUP BY 1) t
  GROUP BY 1 ORDER BY 1`)

await q('★기준시각 이후 · origin 별★', `
  SELECT origin, COUNT(*)::int AS n, COUNT(DISTINCT "sourceMatchId")::int AS keys
  FROM "Match" WHERE "startAt" >= ${CUT} GROUP BY 1`)

await q('★다른 origin 끼리 같은 경기번호를 쓰나 (기준시각 이후)★', `
  SELECT COUNT(*)::int AS n FROM (
    SELECT "sourceMatchId" FROM "Match" WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL
    GROUP BY 1 HAVING COUNT(DISTINCT origin) > 1) t`)

await q('★경기번호 생김새★ — 전역 식별자로 안전한가', `
  SELECT origin,
         MIN(LENGTH("sourceMatchId"))::int AS 최소길이,
         MAX(LENGTH("sourceMatchId"))::int AS 최대길이,
         SUM(CASE WHEN "sourceMatchId" ~ '^[0-9]{18}$' THEN 1 ELSE 0 END)::int AS "18자리숫자",
         COUNT(*)::int AS 전체
  FROM "Match" WHERE "sourceMatchId" IS NOT NULL GROUP BY 1`)

await q('★sourceMatchId 가 NULL 인 행이 있나★ (부분 인덱스에 걸린다)', `
  SELECT COUNT(*)::int AS null_source, MIN("startAt") AS first, MAX("startAt") AS last
  FROM "Match" WHERE "sourceMatchId" IS NULL`)

await q('★과거(기준시각 이전) 는 어떤가★ — 여기는 안 건드린다', `
  SELECT COUNT(*)::int AS 중복된_경기번호 FROM (
    SELECT "sourceMatchId" FROM "Match"
    WHERE "startAt" < ${CUT} AND "sourceMatchId" IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1) t`)

console.info('\n### 기준시각 = ' + MIRROR_FREEZE_FROM.toISOString())
await prisma.$disconnect()
