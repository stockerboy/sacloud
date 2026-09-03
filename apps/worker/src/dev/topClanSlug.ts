/** 화면 확인용 — IPL 상위 클랜 슬러그 두 개 (★읽기 전용★) */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<{ slug: string; name: string }[]>`
  SELECT c."slug", c."name" FROM "LeagueClan" lc
    JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
    JOIN "Clan" c ON c."id" = lc."clanId"
   ORDER BY lc."rating" DESC LIMIT 2
`
for (const r of rows) console.info(`${r.slug}  ${r.name}`)
await prisma.$disconnect()
