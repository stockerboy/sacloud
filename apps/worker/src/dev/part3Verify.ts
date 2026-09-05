/**
 * ★★Part 3 완료 조건을 숫자로 답한다★★ (2026-09-05). ★읽기만 한다.★
 *
 * 사장님이 적어 주신 조건 그대로 하나씩 센다.
 */
import { prisma } from '@sacloud/db'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'
import { UNIFIED_ORIGIN } from '../jobs/unifiedProject.js'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const line = (ok: boolean, label: string, detail: string) =>
  console.info(`${ok ? '  ✔' : '  ✘'} ${label.padEnd(42)} ${detail}`)
const one = async <T>(sql: string): Promise<T> =>
  ((await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql))[0] ?? {}) as T

console.info(`══ Part 3 완료 조건 (기준시각 ${MIRROR_FREEZE_FROM.toISOString()}) ══\n`)

/* ── 세 리그 신규 경기가 들어오나 ─────────────────────────────────── */
const perLeague = await prisma.$queryRawUnsafe<
  Array<{ slug: string; origin: string; n: number; last: Date | null }>
>(`
  SELECT l.slug, m.origin, COUNT(*)::int AS n, MAX(m."startAt") AS last
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL
    AND l.slug IN ('nolink','supply','sanply','daerule')
  GROUP BY 1,2 ORDER BY 1,2`)
console.info('── 기준시각 이후 · 살아 있는 경기 ──')
for (const r of perLeague) {
  console.info(
    `     ${r.slug.padEnd(8)} ${r.origin.padEnd(15)} ${String(r.n).padStart(6)}건 · 마지막 ${r.last?.toISOString().slice(0, 16) ?? '없음'}`,
  )
}
const own = (slug: string) =>
  perLeague.find((r) => r.slug === slug && r.origin === UNIFIED_ORIGIN)?.n ?? 0
console.info('')
line(own('nolink') > 0, 'IPL 자체수집 신규', `${own('nolink')}건`)
line(own('supply') > 0, 'SPL 자체수집 신규', `${own('supply')}건`)
line(own('sanply') > 0, '열산 자체수집 신규', `${own('sanply')}건`)

/* ── 대룰 신규 0 ─────────────────────────────────────────────────── */
const dae = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
  WHERE l.slug='daerule' AND m."startAt" >= ${CUT}`)
line(dae.n === 0, '대룰 신규 경기', `${dae.n}건`)

/* ── 같은 경기가 둘 이상 · 두 리그 ───────────────────────────────── */
const dup = await one<{ keys: number; leagues: number }>(`
  SELECT
    (SELECT COUNT(*)::int FROM (
       SELECT "sourceMatchId" FROM "Match"
       WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL AND "supersededAt" IS NULL
       GROUP BY 1 HAVING COUNT(*) > 1) t) AS keys,
    (SELECT COUNT(*)::int FROM (
       SELECT "sourceMatchId" FROM "Match"
       WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL AND "supersededAt" IS NULL
       GROUP BY 1 HAVING COUNT(DISTINCT "leagueId") > 1) t) AS leagues`)
line(dup.keys === 0, '같은 경기번호 활성 2개 이상', `${dup.keys}개`)
line(dup.leagues === 0, '한 경기가 두 리그에', `${dup.leagues}개`)

/* ── 과거 영향 ──────────────────────────────────────────────────── */
const past = await one<{ matches: number; dup: number; hidden: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT}) AS matches,
         (SELECT COUNT(*)::int FROM (
            SELECT "sourceMatchId" FROM "Match" WHERE "startAt" < ${CUT}
              AND "sourceMatchId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) t) AS dup,
         (SELECT COUNT(*)::int FROM "Match"
            WHERE "startAt" < ${CUT} AND "supersededAt" IS NOT NULL) AS hidden`)
line(past.hidden === 0, '과거에 숨김 표시가 붙은 줄', `${past.hidden}줄 (과거 경기 ${past.matches} · 중복 ${past.dup} 그대로)`)

/* ── 미러 동결 ──────────────────────────────────────────────────── */
const mir = await one<{ neu: number; old: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS neu,
         (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" < ${CUT}) AS old`)
line(mir.neu === 261, '3rd.supply 신규 (안 늘어야 한다)', `${mir.neu}건 · 과거 ${mir.old}건`)

/* ── 근본 시즌 ──────────────────────────────────────────────────── */
const root = await one<{ rows: number; seasons: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "LeaguePlayerSeason") AS rows,
         (SELECT COUNT(*)::int FROM "Season" WHERE number < -100) AS seasons`)
line(root.rows === 10673 && root.seasons === 6, '근본 시즌', `${root.rows}행 · 시즌 ${root.seasons}개`)

/* ── 맵 때문에 열산 경기가 버려지지 않는가 ───────────────────────── */
const maps = await prisma.$queryRawUnsafe<Array<{ slug: string; maps: string | null }>>(`
  SELECT l.slug, STRING_AGG(g.name, ' · ' ORDER BY g.name) AS maps
  FROM "League" l LEFT JOIN "LeagueMap" lm ON lm."leagueId"=l.id
  LEFT JOIN "GameMap" g ON g.id=lm."mapId"
  WHERE l.slug IN ('nolink','supply','sanply') GROUP BY 1 ORDER BY 1`)
console.info('\n── 리그가 인정하는 맵 (★코드가 아니라 표가 정한다★) ──')
for (const m of maps) console.info(`     ${m.slug.padEnd(8)} ${m.maps ?? '(표 없음 — 안 거른다)'}`)

/* ── 수집 대상 ──────────────────────────────────────────────────── */
const targets = await prisma.$queryRawUnsafe<Array<{ slug: string; live: number; seen: number }>>(`
  SELECT l.slug,
    COUNT(DISTINCT lc."clanId")::int AS live,
    COUNT(DISTINCT CASE WHEN r."subject" IS NOT NULL THEN lc."clanId" END)::int AS seen
  FROM "LeagueClan" lc JOIN "League" l ON l.id=lc."leagueId" JOIN "Clan" c ON c.id=lc."clanId"
  LEFT JOIN (SELECT DISTINCT "subject" FROM "BarracksClanMatchRaw") r ON r."subject" = c.slug
  WHERE lc."expelledAt" IS NULL AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1 ORDER BY 1`)
console.info('\n── 수집 대상 (활성 클랜 / 실제로 훑은 클랜) ──')
for (const t of targets) console.info(`     ${t.slug.padEnd(8)} ${t.seen} / ${t.live}`)

/* ── 자물쇠 ─────────────────────────────────────────────────────── */
const idx = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM pg_indexes
  WHERE tablename='Match' AND indexname='Match_new_sourceMatchId_key'`)
line(idx.n === 1, 'DB 자물쇠 (partial unique)', idx.n === 1 ? '있다' : '없다')

await prisma.$disconnect()
