/**
 * ★Part 1 완료 조건을 하나씩 숫자로 답한다★ (2026-09-04). ★읽기만 한다.★
 */
import { prisma } from '@sacloud/db'
import { ROOT_SEASON_LABEL, isRootSeason, seasonDisplayLabel, sourceSeasonNumber } from '@sacloud/contract'

const line = (ok: boolean, label: string, detail: string) =>
  console.info(`${ok ? '  ✔' : '  ✘'} ${label.padEnd(38)} ${detail}`)

console.info('══ Part 1 완료 조건 ══')

/* ① 적재 행 수 */
const rows = await prisma.$queryRawUnsafe<Array<{ n: number; players: number }>>(`
  SELECT COUNT(*)::int AS n, COUNT(DISTINCT s."leaguePlayerId")::int AS players
  FROM "LeaguePlayerSeason" s WHERE s.source='3rd.supply'`)
console.info(`\n  적재 행 ${rows[0]?.n} · 선수 ${rows[0]?.players}명`)

/* ② 서플라이공식리그 아닌 카드 */
const foreign = await prisma.$queryRawUnsafe<Array<{ slug: string | null; n: number }>>(`
  SELECT s."sourceLeagueSlug" AS slug, COUNT(*)::int AS n
  FROM "LeaguePlayerSeason" s WHERE s.imported = true GROUP BY 1 ORDER BY 2 DESC`)
const nonSupply = foreign.filter((r) => r.slug !== 'supply').reduce((a, b) => a + b.n, 0)
line(nonSupply === 0, '② supply 아닌 카드', `${nonSupply}건  (본 slug: ${foreign.map((f) => `${f.slug}=${f.n}`).join(' · ')})`)

/* ②-b 리그가 supply 가 아닌 곳에 붙은 카드 */
const wrongLeague = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
  SELECT COUNT(*)::int AS n FROM "LeaguePlayerSeason" s
  JOIN "LeaguePlayer" lp ON lp.id=s."leaguePlayerId"
  JOIN "League" l ON l.id=lp."leagueId"
  WHERE s.imported = true AND l.slug <> 'supply'`)
line((wrongLeague[0]?.n ?? -1) === 0, '②-b supply 리그 밖에 붙은 카드', `${wrongLeague[0]?.n}건`)

/* ③ 시즌 번호 충돌 */
const seasons = await prisma.$queryRawUnsafe<Array<{ number: number; seasonType: string; rows: number }>>(`
  SELECT s.number, s."seasonType", COUNT(ps.id)::int AS rows
  FROM "Season" s JOIN "League" l ON l.id=s."leagueId"
  LEFT JOIN "LeaguePlayerSeason" ps ON ps."seasonId"=s.id
  WHERE l.slug='supply' GROUP BY 1,2 ORDER BY 1`)
console.info('')
for (const s of seasons) {
  const src = sourceSeasonNumber(s.number)
  console.info(
    `     번호 ${String(s.number).padStart(4)} · ${s.seasonType.padEnd(8)} · 카드 ${String(s.rows).padStart(5)}장` +
      ` · 표기 「${seasonDisplayLabel(s)}」${src ? ` (원본 시즌 ${src})` : ''}`,
  )
}
const onOurs = seasons.filter((s) => !isRootSeason(s.number)).reduce((a, b) => a + b.rows, 0)
line(onOurs === 0, '③ 우리 시즌(0·1·7·-1·-2)에 붙은 카드', `${onOurs}건`)

/* ④ 같은 선수·같은 원본 시즌 중복 */
const dup = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT s."leaguePlayerId", s.season FROM "LeaguePlayerSeason" s
    WHERE s.imported = true GROUP BY 1,2 HAVING COUNT(*) > 1) t`)
line((dup[0]?.n ?? -1) === 0, '④ 같은 선수·같은 원본시즌 중복', `${dup[0]?.n}건`)

/* ⑤ 카드 없는 선수에게 대체 삽입 */
const orphan = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
  SELECT COUNT(*)::int AS n FROM "LeaguePlayerSeason" s
  WHERE s.imported = true AND (s."legacyLeaguePlayerId" IS NULL OR s."legacyPlayerId" IS NULL)`)
line((orphan[0]?.n ?? -1) === 0, '⑤ 원본 id 없는 적재 행', `${orphan[0]?.n}건 (있으면 지어낸 것이다)`)

/* ⑥ 원본 시즌 번호가 1~6 밖 */
const badSeason = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`
  SELECT COUNT(*)::int AS n FROM "LeaguePlayerSeason" s
  WHERE s.imported = true AND (s.season < 1 OR s.season > 6)`)
line((badSeason[0]?.n ?? -1) === 0, '⑥ 원본 시즌이 1~6 밖', `${badSeason[0]?.n}건`)

/* ⑦ 표기에 내부 번호가 새는가 */
const labels = new Set(seasons.filter((s) => isRootSeason(s.number)).map((s) => seasonDisplayLabel(s)))
line(
  labels.size === 1 && labels.has(ROOT_SEASON_LABEL),
  '⑦ 근본 시즌 표기',
  `${[...labels].map((l) => `「${l}」`).join(' ') || '(없음)'}`,
)

/* ⑧ Match / Stat 은 그대로인가 */
const untouched = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(`
  SELECT (SELECT COUNT(*)::int FROM "Match") AS matches,
         (SELECT COUNT(*)::int FROM "MatchPlayerStat") AS stats,
         (SELECT COUNT(*)::int FROM "LeagueClan") AS league_clans`)
console.info(`\n  Match ${untouched[0]?.['matches']} · Stat ${untouched[0]?.['stats']} · LeagueClan ${untouched[0]?.['league_clans']}`)

await prisma.$disconnect()
