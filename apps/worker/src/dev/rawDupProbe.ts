/**
 * ★RAW 가 정말 한 번만 늘어나는가★ — 코드 말고 ★데이터로★ 확인한다 (2026-09-05).
 *
 * 사장님: «subject 가 다르면 같은 경기를 양쪽 클랜에서 각각 조회했을 때
 *         서로 다른 RAW 행이 생길 수 있어 보인다. 코드만 보고 단정하지 마라»
 *
 * ★읽기만 한다.★
 */
import { prisma } from '@sacloud/db'
const q = async (l: string, sql: string) => {
  console.info('\n### ' + l)
  console.info(JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))
}

await q('전체', `
  SELECT COUNT(*)::int AS rows,
         COUNT(DISTINCT "matchKey")::int AS match_keys,
         COUNT(DISTINCT "subject")::int AS subjects
  FROM "BarracksClanMatchRaw"`)

await q('★한 경기(matchKey)가 몇 행으로 있나★ (분포)', `
  SELECT rows_per_match, COUNT(*)::int AS match_keys FROM (
    SELECT "matchKey", COUNT(*)::int AS rows_per_match
    FROM "BarracksClanMatchRaw" GROUP BY 1) t
  GROUP BY 1 ORDER BY 1`)

await q('★한 경기를 몇 개의 subject 가 봤나★ (분포)', `
  SELECT subjects_per_match, COUNT(*)::int AS match_keys FROM (
    SELECT "matchKey", COUNT(DISTINCT "subject")::int AS subjects_per_match
    FROM "BarracksClanMatchRaw" GROUP BY 1) t
  GROUP BY 1 ORDER BY 1`)

await q('★같은 경기 · 다른 subject 인데 payloadHash 가 같은가★', `
  SELECT
    COUNT(*)::int AS multi_subject_matches,
    SUM(CASE WHEN hashes = 1 THEN 1 ELSE 0 END)::int AS 해시가_하나,
    SUM(CASE WHEN hashes > 1 THEN 1 ELSE 0 END)::int AS 해시가_여러개
  FROM (
    SELECT "matchKey", COUNT(DISTINCT "subject") AS subs, COUNT(DISTINCT "payloadHash") AS hashes
    FROM "BarracksClanMatchRaw" GROUP BY 1) t
  WHERE subs > 1`)

await q('★실제 사례 3건★ — 같은 경기를 두 subject 가 본 것', `
  WITH multi AS (
    SELECT "matchKey" FROM "BarracksClanMatchRaw"
    GROUP BY 1 HAVING COUNT(DISTINCT "subject") > 1 LIMIT 3)
  SELECT r."matchKey", r."subject", LEFT(r."payloadHash", 12) AS hash12,
         r."payload"->>'red_clan_name' AS red, r."payload"->>'blue_clan_name' AS blue,
         r."fetchCount"
  FROM "BarracksClanMatchRaw" r JOIN multi ON multi."matchKey" = r."matchKey"
  ORDER BY r."matchKey", r."subject"`)

await q('배틀로그 원문도 같은 모양인가', `
  SELECT COUNT(*)::int AS rows, COUNT(DISTINCT "matchKey")::int AS match_keys
  FROM "BarracksBattleLogRaw"`)

await prisma.$disconnect()
