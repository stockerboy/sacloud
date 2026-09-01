/**
 * 반영 뒤 **DB 를 직접 세는** 대조 (CLAUDE.md 3-A 6번 — 로그가 아니라 숫자로 판정한다).
 * 읽기 전용.
 */
import { PrismaClient } from '../generated/client/index.js'
const p = new PrismaClient()
const q = (s) => p.$queryRawUnsafe(s)

console.log('=== 1) 랭킹에 뜨는 인원 · 기준점이 아닌 선수 · 점수 범위 ===')
console.table(
  await q(`
SELECT l.slug,
  count(*)::int                                        AS "선수전체",
  count(*) FILTER (WHERE NOT lp.placement)::int        AS "랭킹노출",
  count(*) FILTER (WHERE lp.placement)::int            AS "placement=true",
  count(*) FILTER (WHERE lp.rating <> 3000)::int       AS "래더가3000이아님",
  count(*) FILTER (WHERE lp."placementPlayed" > 0)::int AS "판수>0",
  min(lp.rating)::int                                  AS "최저래더",
  max(lp.rating)::int                                  AS "최고래더"
FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)

console.log('=== 2) 랭킹 노출 선수만 본 분포 ===')
console.table(
  await q(`
SELECT l.slug,
  count(*)::int                                   AS "랭킹노출",
  count(*) FILTER (WHERE lp."placementPlayed" < 10)::int AS "10판미만",
  count(*) FILTER (WHERE lp."placementPlayed" = 1)::int  AS "1판",
  min(lp.rating)::int AS "최저", max(lp.rating)::int AS "최고",
  round(avg(lp.rating))::int AS "평균"
FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId"
WHERE l.slug IN ('supply','sanply') AND NOT lp.placement GROUP BY 1 ORDER BY 1`),
)

console.log('=== 3) 클랜 ===')
console.table(
  await q(`
SELECT l.slug, count(*)::int AS "클랜전체",
  count(*) FILTER (WHERE NOT lc.placement)::int AS "랭킹노출",
  count(*) FILTER (WHERE lc.rating <> 3000)::int AS "래더가3000이아님",
  min(lc.rating)::int AS "최저", max(lc.rating)::int AS "최고"
FROM "LeagueClan" lc JOIN "League" l ON l.id = lc."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)

console.log('=== 4) 무기별 기록 · 불변식(통합 = 기본 + 스나 + 라플) ===')
console.table(
  await q(`
SELECT l.slug, count(*)::int AS "무기행", sum(ws.games)::int AS "무기판수합"
FROM "LeaguePlayerWeaponStat" ws
JOIN "LeaguePlayer" lp ON lp.id = ws."leaguePlayerId"
JOIN "League" l ON l.id = lp."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)
console.table(
  await q(`
SELECT l.slug, count(*)::int AS "불변식어긋난선수"
FROM (
  SELECT lp.id, lp."leagueId", lp.rating, lp."baseRating",
         COALESCE(SUM(ws."ratingDelta"), 0) AS d
    FROM "LeaguePlayer" lp
    LEFT JOIN "LeaguePlayerWeaponStat" ws ON ws."leaguePlayerId" = lp.id
   GROUP BY lp.id, lp."leagueId", lp.rating, lp."baseRating") t
JOIN "League" l ON l.id = t."leagueId"
WHERE l.slug IN ('supply','sanply') AND t.rating <> t."baseRating" + t.d
GROUP BY 1 ORDER BY 1`),
)

console.log('=== 5) 원본 보존 (줄어들면 사고다) ===')
console.table(
  await q(`
SELECT l.slug, count(*)::int AS "경기",
  count(*) FILTER (WHERE m."redSourceRatingUpdate" IS NOT NULL
                      OR m."blueSourceRatingUpdate" IS NOT NULL)::int AS "원본증감보존"
FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)
console.table(
  await q(`
SELECT l.slug, count(*)::int AS "참가행", count(s."sourceRatingDelta")::int AS "원본증감보존"
FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
JOIN "League" l ON l.id = m."leagueId"
WHERE l.slug IN ('supply','sanply') GROUP BY 1 ORDER BY 1`),
)

console.log('=== 6) 상위 10명 (실제로 화면에 뜰 순서) ===')
for (const slug of ['supply', 'sanply']) {
  console.log('-- ' + slug + ' --')
  console.table(
    await q(`
SELECT pl.name AS "선수", lp.rating AS "래더", lp."placementPlayed" AS "판수",
       lp.win AS "승", lp.lose AS "패"
FROM "LeaguePlayer" lp
JOIN "League" l ON l.id = lp."leagueId"
JOIN "Player" pl ON pl.id = lp."playerId"
WHERE l.slug = '${slug}' AND NOT lp.placement
ORDER BY lp.rating DESC LIMIT 10`),
  )
}

await p.$disconnect()
