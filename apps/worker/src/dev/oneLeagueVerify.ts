/** ★사장님 완료 조건 10개를 숫자로 답한다★ (2026-09-05). ★읽기만 한다★ */
import { prisma } from '@sacloud/db'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const KEEP_SANPLY = ['flying-', 'immortals', '매너', '사신', '야부리！', '어린이']
const line = (ok: boolean, label: string, detail: string) =>
  console.info(`${ok ? '  ✔' : '  ✘'} ${label.padEnd(40)} ${detail}`)
const one = async <T>(sql: string, ...p: unknown[]): Promise<T> =>
  ((await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...p))[0] ?? {}) as T

console.info(`══ 완료 조건 (기준시각 ${MIRROR_FREEZE_FROM.toISOString()}) ══\n`)

/* ① 운영 3리그에서 동시에 활성인 클랜 */
const a = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT lc."clanId" FROM "LeagueClan" lc JOIN "League" l ON l.id=lc."leagueId"
    WHERE l.slug IN ('nolink','supply','sanply') AND lc."expelledAt" IS NULL
    GROUP BY 1 HAVING COUNT(DISTINCT lc."leagueId") > 1) t`)
line(a.n === 0, '① 3리그 동시 활성 클랜', `${a.n}곳`)

/* ② 43곳의 최종 활성 상태 */
console.info('')
const regs = await prisma.$queryRawUnsafe<Array<{ name: string; leagues: string }>>(`
  SELECT c.name, STRING_AGG(l.slug, '+' ORDER BY l.slug) AS leagues
  FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c.id JOIN "League" l ON l.id=lc."leagueId"
  WHERE l.slug IN ('nolink','supply','sanply') AND lc."expelledAt" IS NULL
    AND c.id IN (
      SELECT "clanId" FROM "LeagueClan" WHERE "leagueId"=(SELECT id FROM "League" WHERE slug='supply')
      UNION
      SELECT "clanId" FROM "LeagueClan" WHERE "leagueId"=(SELECT id FROM "League" WHERE slug='sanply'))
  GROUP BY c.name HAVING STRING_AGG(l.slug, '+') IS NOT NULL
  ORDER BY c.name`)
const sanOk = KEEP_SANPLY.filter((n) => regs.find((r) => r.name === n)?.leagues === 'sanply')
line(sanOk.length === 6, '② 열산 6곳이 sanply 에만 활성', `${sanOk.length}/6 · ${sanOk.join(' · ')}`)
/* ⚠ ★이름으로 묶으면 안 된다★ (2026-09-05 · 처음에 이걸로 오판했다).
   같은 이름의 ★서로 다른 클랜 행★ 이 있다 — daytona · hingˇ · recent.wct- 3쌍.
   ★동명이인이지 겹침이 아니다.★ 겹침은 ①이 clanId 로 이미 정확히 센다 */
const sameNameDiffClan = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT c.name FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c.id
    JOIN "League" l ON l.id=lc."leagueId"
    WHERE l.slug IN ('nolink','supply','sanply') AND lc."expelledAt" IS NULL
    GROUP BY c.name HAVING COUNT(DISTINCT c.id) > 1) t`)
line(true, '②-b 같은 이름 · 다른 클랜 행 (겹침 아님)', `${sameNameDiffClan.n}쌍 — ①이 0곳이므로 겹침은 없다`)

/* ③ 신규 중복 처리 전/후 */
console.info('')
const hidden = await one<{ n: number; stats: number }>(`
  SELECT COUNT(*)::int AS n,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" s
            JOIN "Match" m2 ON m2.id=s."matchId" WHERE m2."supersededAt" IS NOT NULL) AS stats
  FROM "Match" WHERE "supersededAt" IS NOT NULL`)
line(true, '③ 숨긴 줄 (전 0 → 후)', `${hidden.n}줄 · 그 줄에 붙은 라인업 ${hidden.stats}명 (안 지움)`)

/* ④ 기준시각 이후 살아 있는 줄 중 중복 */
const d = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT "sourceMatchId" FROM "Match"
    WHERE "startAt" >= ${CUT} AND "sourceMatchId" IS NOT NULL AND "supersededAt" IS NULL
    GROUP BY 1 HAVING COUNT(*) > 1) t`)
line(d.n === 0, '④ 기준시각 이후 중복 sourceMatchId', `${d.n}개`)

/* ⑤ DB 자물쇠가 실제로 있나 */
const idx = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM pg_indexes
  WHERE tablename='Match' AND indexname='Match_new_sourceMatchId_key'`)
line(idx.n === 1, '⑤ partial unique 자물쇠', idx.n === 1 ? '있다 (삽입 시험은 따로 통과)' : '없다')

/* ⑥ 과거는 그대로인가 */
console.info('')
const past = await one<{ matches: number; dup: number; stats: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT}) AS matches,
         (SELECT COUNT(*)::int FROM (
            SELECT "sourceMatchId" FROM "Match"
            WHERE "startAt" < ${CUT} AND "sourceMatchId" IS NOT NULL
            GROUP BY 1 HAVING COUNT(*) > 1) t) AS dup,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
            WHERE m."startAt" < ${CUT}) AS stats`)
line(past.dup > 30000, '⑥ 과거 중복 (그대로여야 한다)', `${past.dup}개 · 과거 경기 ${past.matches} · 라인업 ${past.stats}`)
const pastHidden = await one<{ n: number }>(`
  SELECT COUNT(*)::int AS n FROM "Match" WHERE "startAt" < ${CUT} AND "supersededAt" IS NOT NULL`)
line(pastHidden.n === 0, '⑥-b 과거에 숨김 표시가 붙은 줄', `${pastHidden.n}줄`)

/* ⑦ MatchPlayerStat 총량 */
const stats = await one<{ n: number; orphan: number }>(`
  SELECT COUNT(*)::int AS n,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" s
            LEFT JOIN "Match" m ON m.id=s."matchId" WHERE m.id IS NULL) AS orphan
  FROM "MatchPlayerStat"`)
line(stats.orphan === 0, '⑦ MatchPlayerStat', `${stats.n}행 · 주인 없는 행 ${stats.orphan}`)

/* ⑧ 근본 시즌 */
const root = await one<{ rows: number; seasons: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "LeaguePlayerSeason") AS rows,
         (SELECT COUNT(*)::int FROM "Season" WHERE number < -100) AS seasons`)
line(root.rows === 10673 && root.seasons === 6, '⑧ 근본 시즌', `${root.rows}행 · 시즌 ${root.seasons}개`)

/* ⑨ 미러 동결 */
const mir = await one<{ neu: number; old: number }>(`
  SELECT (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS neu,
         (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" < ${CUT}) AS old`)
line(mir.neu === 261 && mir.old === 362694, '⑨ 미러 동결', `신규 ${mir.neu} · 과거 ${mir.old}`)

/* 리그별 현황 */
console.info('')
const leagues = await prisma.$queryRawUnsafe(`
  SELECT l.slug,
    (SELECT COUNT(*)::int FROM "LeagueClan" x WHERE x."leagueId"=l.id AND x."expelledAt" IS NULL) AS 활성클랜,
    (SELECT COUNT(*)::int FROM "Match" m WHERE m."leagueId"=l.id AND m."supersededAt" IS NULL) AS 살아있는경기
  FROM "League" l WHERE l.slug IN ('nolink','supply','sanply','daerule') ORDER BY l.slug`)
console.info('  리그별: ' + JSON.stringify(leagues))
await prisma.$disconnect()
