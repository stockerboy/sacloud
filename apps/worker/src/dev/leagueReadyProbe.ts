/** 리그마다 병영수첩으로 받을 준비가 됐나 (2026-09-04 · ★읽기 전용★) */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRaw<
  { league: string; clans: bigint; with_slug: bigint; with_raw: bigint; with_no: bigint }[]
>`
  SELECT l."slug" AS league,
         count(*) AS clans,
         count(*) FILTER (WHERE c."slug" IS NOT NULL AND c."slug" <> '') AS with_slug,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "BarracksClanMatchRaw" b WHERE b."subject" = c."slug")) AS with_raw,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "BarracksClanNumber" n WHERE n."clanId" = c."id")) AS with_no
    FROM "LeagueClan" lc
    JOIN "League" l ON l."id" = lc."leagueId"
    JOIN "Clan" c ON c."id" = lc."clanId"
   GROUP BY 1 ORDER BY 2 DESC
`
console.info('══ ★리그마다 병영수첩 수집 준비 상태★ ══')
console.info('')
console.info('  리그        클랜수   슬러그   목록받아본곳   클랜번호앎')
console.info('  ' + '─'.repeat(60))
for (const r of rows) {
  console.info(
    `  ${r.league.padEnd(10)} ${String(Number(r.clans)).padStart(5)} ${String(Number(r.with_slug)).padStart(8)} ` +
      `${String(Number(r.with_raw)).padStart(12)} ${String(Number(r.with_no)).padStart(11)}`,
  )
}
console.info('')
console.info('  ★「목록 받아본 곳」이 0 이면 그 리그는 아직 병영수첩에서 한 번도 안 받아봤다★')
await prisma.$disconnect()
