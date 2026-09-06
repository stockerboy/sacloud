/** ★deluxe 는 왜 클랜번호가 없나★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<
  Array<{ name: string; slug: string; leagues: string; expelled: string | null
          rawRows: number; okRows: number; lastRaw: Date | null; status: string | null }>
>(`
  SELECT c.name, c.slug,
         COALESCE(STRING_AGG(DISTINCT l.slug, ',') , '(없음)') AS leagues,
         MAX(lc."expelledAt")::text AS expelled,
         (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug) AS "rawRows",
         (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug AND r."status"='ok') AS "okRows",
         (SELECT MAX(r."fetchedAt") FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug) AS "lastRaw",
         (SELECT r."status" FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug
           ORDER BY r."fetchedAt" DESC LIMIT 1) AS status
  FROM "Clan" c
  LEFT JOIN "LeagueClan" lc ON lc."clanId" = c.id AND lc."expelledAt" IS NULL
  LEFT JOIN "League" l ON l.id = lc."leagueId"
  WHERE c.name = 'deluxe'
  GROUP BY c.id, c.name, c.slug`)
for (const r of rows)
  console.info(
    `  이름 ${r.name} · slug ★${r.slug}★ · 리그 ${r.leagues}\n` +
      `    매치목록 원문 ${r.rawRows}줄 (성공 ${r.okRows}) · 마지막 ${r.lastRaw?.toISOString() ?? '없음'} · 마지막 상태 ${r.status ?? '없음'}`,
  )

console.info('\n══ IPL 활성 클랜 중 ★주체로 한 번도 안 훑힌 곳★ ══\n')
const never = await prisma.$queryRawUnsafe<Array<{ name: string; slug: string }>>(`
  SELECT c.name, c.slug FROM "LeagueClan" lc
  JOIN "League" l ON l.id = lc."leagueId" AND l.slug = 'nolink'
  JOIN "Clan" c ON c.id = lc."clanId"
  WHERE lc."expelledAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "BarracksClanMatchRaw" r WHERE r."subject" = c.slug)
  ORDER BY c.name`)
for (const n of never) console.info(`  ${n.name} (slug ${n.slug})`)
console.info(`  ── ${never.length}곳`)

console.info('\n══ IPL 활성 클랜 중 ★클랜번호를 아직 못 배운 곳★ ══\n')
const noNo = await prisma.$queryRawUnsafe<Array<{ name: string; slug: string; okRows: number }>>(`
  SELECT c.name, c.slug,
    (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" r
      WHERE r."subject" = c.slug AND r."status"='ok'
        AND r."payload"->>'clan_no' IS NOT NULL) AS "okRows"
  FROM "LeagueClan" lc
  JOIN "League" l ON l.id = lc."leagueId" AND l.slug = 'nolink'
  JOIN "Clan" c ON c.id = lc."clanId"
  WHERE lc."expelledAt" IS NULL
  ORDER BY 3 ASC, 1 LIMIT 8`)
for (const n of noNo) console.info(`  ${n.name.padEnd(16)} slug ${n.slug.padEnd(20)} 번호 있는 줄 ${n.okRows}`)
await prisma.$disconnect()
