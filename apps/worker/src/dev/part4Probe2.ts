/** ★Part 4 조사 2 — ④⑤ 가 0 으로 나온 이유를 판다★ (2026-09-05). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const q = async <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql)
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

console.info('══ 배틀로그 원문의 subject 는 무엇인가 ══\n')
const s = await q<{ subject: string; kind: string; keys: number }>(`
  SELECT "subject", "subjectKind", COUNT(DISTINCT "matchKey")::int AS keys
  FROM "BarracksBattleLogRaw" WHERE "status"='ok' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 8`)
for (const r of s) console.info(`  ${r.subject.padEnd(24)} kind=${r.kind} · 경기 ${r.keys}`)
const tot = await q<{ n: number; k: number }>(
  `SELECT COUNT(*)::int AS n, COUNT(DISTINCT "matchKey")::int AS k FROM "BarracksBattleLogRaw" WHERE "status"='ok'`)
console.info(`  합계 ${tot[0]?.n} 줄 · 경기 ${tot[0]?.k}`)
const hit = await q<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM (SELECT DISTINCT "subject" FROM "BarracksBattleLogRaw") r
  JOIN "Clan" c ON c.slug = r."subject"`)
console.info(`  subject 가 Clan.slug 와 맞는 것 : ${hit[0]?.n}곳`)

console.info('\n══ BarracksClanNumber 표 ══\n')
const cn = await q<{ n: number; src: string | null }>(
  `SELECT COUNT(*)::int AS n, "source" AS src FROM "BarracksClanNumber" GROUP BY 2`)
for (const r of cn) console.info(`  ${r.n}줄 · source=${r.src ?? '(없음)'}`)

console.info('\n══ 기준시각 이후 경기 — 출처별 ══\n')
const o = await q<{ slug: string; origin: string; n: number; stat: number }>(`
  SELECT l.slug, m.origin, COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE x."matchId" IS NOT NULL)::int AS stat
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId"=m.id
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL
    AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1,2 ORDER BY 1,2`)
for (const r of o)
  console.info(`  ${r.slug.padEnd(8)} ${r.origin.padEnd(15)} ${String(r.n).padStart(5)}건 · 라인업 있는 것 ${r.stat}`)

console.info('\n══ 배틀로그 원문이 있는 신규 경기 중 라인업이 아직 없는 것 ══\n')
const gap = await q<{ slug: string; n: number }>(`
  SELECT l.slug, COUNT(*)::int AS n
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
  JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey"=m."sourceMatchId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId"=m.id
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL AND x."matchId" IS NULL
    AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1 ORDER BY 1`)
for (const r of gap) console.info(`  ${r.slug.padEnd(8)} ${r.n}건 ← ★이게 Part 4 가 채울 몫★`)
await prisma.$disconnect()
