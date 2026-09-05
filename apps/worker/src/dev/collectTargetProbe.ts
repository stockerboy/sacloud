/** ★수집 대상이 누구인가★ — 열산이 왜 0건인지 본다 (읽기만) */
import { prisma } from '@sacloud/db'
const q = async (l: string, sql: string) => {
  console.info('\n### ' + l)
  console.info(JSON.stringify(await prisma.$queryRawUnsafe(sql), null, 1))
}
await q('리그별 활성 클랜 vs ★원문에 subject 로 나온 클랜★', `
  SELECT l.slug,
    COUNT(DISTINCT lc."clanId")::int AS 활성클랜,
    COUNT(DISTINCT CASE WHEN r."subject" IS NOT NULL THEN lc."clanId" END)::int AS 수집된클랜
  FROM "LeagueClan" lc
  JOIN "League" l ON l.id=lc."leagueId"
  JOIN "Clan" c ON c.id=lc."clanId"
  LEFT JOIN (SELECT DISTINCT "subject" FROM "BarracksClanMatchRaw") r ON r."subject" = c.slug
  WHERE lc."expelledAt" IS NULL AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1 ORDER BY 1`)
await q('못 이은 이름 상위 5개가 어디 등록돼 있나', `
  SELECT c.name, c.slug, COALESCE(l.slug,'(등록 없음)') AS league, lc."expelledAt" IS NOT NULL AS 추방됨
  FROM "Clan" c
  LEFT JOIN "LeagueClan" lc ON lc."clanId"=c.id
  LEFT JOIN "League" l ON l.id=lc."leagueId"
  WHERE c.name IN ('icsu','calamity','blacknight','velkor','metacortex')
  ORDER BY c.name, l.slug`)
await prisma.$disconnect()
