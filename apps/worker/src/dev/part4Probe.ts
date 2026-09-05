/**
 * ★Part 4 조사 — 라인업을 세 리그로 넓히기 전에 재 본다★ (2026-09-05). ★읽기만 한다.★
 *
 * 사장님이 물으신 6가지 중 ★DB 로만 답할 수 있는 것★ 을 여기서 센다.
 */
import { prisma } from '@sacloud/db'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const NEW = `m."startAt" >= ${CUT} AND m."supersededAt" IS NULL`
const q = async <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql)

console.info('══ ① 기준시각 이후 신규 경기 · 배틀로그 원문 · 라인업 ══\n')
const cover = await q<{
  slug: string; matches: number; hasRaw: number; hasStat: number; barracksStat: number
}>(`
  SELECT l.slug,
    COUNT(*)::int AS matches,
    COUNT(*) FILTER (WHERE r."matchKey" IS NOT NULL)::int AS "hasRaw",
    COUNT(*) FILTER (WHERE s."matchId" IS NOT NULL)::int AS "hasStat",
    COUNT(*) FILTER (WHERE b."matchId" IS NOT NULL)::int AS "barracksStat"
  FROM "Match" m
  JOIN "League" l ON l.id = m."leagueId"
  LEFT JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
             WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey" = m."sourceMatchId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") s ON s."matchId" = m.id
  LEFT JOIN (SELECT DISTINCT s2."matchId" FROM "MatchPlayerStat" s2
             JOIN "Player" p ON p.id = s2."playerId"
             WHERE p."origin" = 'nexon_barracks') b ON b."matchId" = m.id
  WHERE ${NEW} AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1 ORDER BY 1`)
console.info('  리그      신규경기  배틀로그원문  라인업있음  그중병영수첩')
for (const r of cover)
  console.info(
    `  ${r.slug.padEnd(8)} ${String(r.matches).padStart(7)} ${String(r.hasRaw).padStart(12)}` +
      ` ${String(r.hasStat).padStart(11)} ${String(r.barracksStat).padStart(13)}`,
  )

console.info('\n══ ② 한 경기에 몇 명 들어가 있나 (신규만) ══\n')
const size = await q<{ slug: string; n: number; matches: number }>(`
  SELECT l.slug, t.n, COUNT(*)::int AS matches FROM (
    SELECT s."matchId", COUNT(*)::int AS n FROM "MatchPlayerStat" s GROUP BY 1) t
  JOIN "Match" m ON m.id = t."matchId"
  JOIN "League" l ON l.id = m."leagueId"
  WHERE ${NEW} AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1,2 ORDER BY 1, 2 DESC`)
for (const r of size)
  console.info(`  ${r.slug.padEnd(8)} ${String(r.n).padStart(3)}명 → ${r.matches}경기`)

console.info('\n══ ③ 같은 선수가 한 경기에 두 번 (구조상 막혀 있나) ══\n')
const dupPk = await q<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT "matchId","playerId" FROM "MatchPlayerStat" GROUP BY 1,2 HAVING COUNT(*)>1) t`)
console.info(`  같은 (경기, 선수) 두 줄 : ${dupPk[0]?.n ?? 0}건`)
const idx = await q<{ indexdef: string }>(`
  SELECT indexdef FROM pg_indexes
  WHERE tablename='MatchPlayerStat' AND indexdef ILIKE '%UNIQUE%'`)
for (const i of idx) console.info(`  자물쇠 : ${i.indexdef.replace(/^.*USING /, '')}`)

console.info('\n══ ④ 클랜번호 표 — 리그마다 몇 개나 이어져 있나 ══\n')
const num = await q<{ slug: string; live: number; numbered: number }>(`
  SELECT l.slug, COUNT(DISTINCT lc."clanId")::int AS live,
         COUNT(DISTINCT n."clanId")::int AS numbered
  FROM "LeagueClan" lc JOIN "League" l ON l.id = lc."leagueId"
  LEFT JOIN "BarracksClanNumber" n ON n."clanId" = lc."clanId"
  WHERE lc."expelledAt" IS NULL AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1 ORDER BY 1`)
for (const r of num)
  console.info(`  ${r.slug.padEnd(8)} 활성 클랜 ${String(r.live).padStart(4)} · 번호 이어진 클랜 ${r.numbered}`)

console.info('\n══ ⑤ 배틀로그 원문은 리그를 아나 (subject 로 본다) ══\n')
const raw = await q<{ slug: string; subjects: number; keys: number }>(`
  SELECT COALESCE(l.slug,'(등록 안 된 클랜)') AS slug,
         COUNT(DISTINCT r."subject")::int AS subjects,
         COUNT(DISTINCT r."matchKey")::int AS keys
  FROM (SELECT DISTINCT "subject","matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r
  LEFT JOIN "Clan" c ON c.slug = r."subject"
  LEFT JOIN "LeagueClan" lc ON lc."clanId" = c.id AND lc."expelledAt" IS NULL
  LEFT JOIN "League" l ON l.id = lc."leagueId"
  GROUP BY 1 ORDER BY 3 DESC`)
for (const r of raw) console.info(`  ${r.slug.padEnd(20)} 주체 ${String(r.subjects).padStart(4)}곳 · 경기 ${r.keys}`)

await prisma.$disconnect()
