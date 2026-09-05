/** ★원문의 subject 가 우리 클랜 slug 와 이어지나★ — 이름 말고 이것으로 잇는다 (읽기만) */
import { prisma } from '@sacloud/db'
const q = async (l: string, sql: string) => {
  console.info('\n### ' + l)
  console.info(JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))
}
await q('subject 가 우리 Clan.slug 와 맞는가', `
  SELECT COUNT(DISTINCT c."subject")::int AS subjects,
         COUNT(DISTINCT cl.slug)::int AS matched_slugs
  FROM "BarracksClanMatchRaw" c LEFT JOIN "Clan" cl ON cl.slug = c."subject"`)
await q('★subject 가 운영 3리그 활성 클랜인 비율★', `
  SELECT COUNT(DISTINCT c."subject")::int AS subjects,
         COUNT(DISTINCT lc."clanId")::int AS live_clans
  FROM "BarracksClanMatchRaw" c
  JOIN "Clan" cl ON cl.slug = c."subject"
  JOIN "LeagueClan" lc ON lc."clanId" = cl.id AND lc."expelledAt" IS NULL
  JOIN "League" l ON l.id = lc."leagueId" AND l.slug IN ('nolink','supply','sanply')`)
await q('★한 경기를 본 subject 수 (기준시각 이후)★', `
  SELECT subs, COUNT(*)::int AS match_keys FROM (
    SELECT "matchKey", COUNT(DISTINCT "subject")::int AS subs
    FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "matchKey" >= '260903'
    GROUP BY 1) t GROUP BY 1 ORDER BY 1`)
await q('★이름이 모호한 9곳이 subject 로 나오나★', `
  SELECT cl.name, cl.slug, l.slug AS league, COUNT(c."matchKey")::int AS raw_rows
  FROM "Clan" cl
  JOIN "LeagueClan" lc ON lc."clanId"=cl.id AND lc."expelledAt" IS NULL
  JOIN "League" l ON l.id=lc."leagueId" AND l.slug IN ('nolink','supply','sanply')
  LEFT JOIN "BarracksClanMatchRaw" c ON c."subject" = cl.slug
  WHERE cl.name IN ('Mentalist-','daytona','hingˇ','hurricanewc','maybe','melody','recent.wct-','sovereignwc','♡strawberry')
  GROUP BY 1,2,3 ORDER BY 1`)
await prisma.$disconnect()
