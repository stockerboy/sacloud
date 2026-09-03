/**
 * **같은 경기가 병영수첩과 미러에 겹쳐 들어와 있나** (O-051 ③ · 2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 ★자동화 전에★ 세나 ══
 *
 * 오늘 `bombQuitCrossJoinProbe` 를 돌리다 나온 것 —
 * ```
 * 배틀로그(병영수첩) 키로 Match 를 찾으면
 *   sanply 3,318건 · ★nolink 3,109건★ · supply 1,561건 · daerule 192건
 * ```
 * ★같은 `sourceMatchId` 가 네 리그에 흩어져 있다.★ `@@unique([leagueId, origin, sourceMatchId])`
 * 라 리그가 다르면 ★따로 저장된다★ — 막는 장치가 없다.
 *
 * ★15분마다 긁기 시작하면 이 겹침이 자동으로 불어난다.★ 그리고 —
 * ★자동화 뒤에 세면 「자동화가 만든 것」과 「원래 있던 것」을 못 가른다.★
 * 그래서 ★지금★ 센다. 읽기만 한다.
 *
 * ⚠ ★고치지 않는다.★ 지금이 몇 건인지만 박아 둔다 — ★나중에 이 숫자와 견준다.★
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  /* ── 1 · 같은 sourceMatchId 가 몇 리그에 걸쳐 있나 ─────────── */
  console.info('══ 1 · ★같은 경기 키가 몇 리그에 걸쳐 있나★ (origin 무시하고 키로만) ══\n')
  const spread = await prisma.$queryRaw<{ leagues: number; keys: bigint; rows: bigint }[]>`
    SELECT leagues, count(*) AS keys, sum(n) AS rows FROM (
      SELECT m."sourceMatchId",
             count(DISTINCT m."leagueId")::int AS leagues,
             count(*)                          AS n
        FROM "Match" m
       WHERE m."sourceMatchId" IS NOT NULL
       GROUP BY 1
    ) q GROUP BY 1 ORDER BY 1
  `
  let totalKeys = 0
  for (const r of spread) totalKeys += Number(r.keys)
  for (const r of spread) {
    const k = Number(r.keys)
    console.info(
      `  ${r.leagues}개 리그에 ${k.toLocaleString().padStart(9)}개 키 ${pc(k, totalKeys)}` +
        `  (경기 행 ${Number(r.rows).toLocaleString()})` +
        `${r.leagues > 1 ? '  ★겹침★' : ''}`,
    )
  }
  const dup = spread.filter((r) => r.leagues > 1)
  const dupKeys = dup.reduce((a, r) => a + Number(r.keys), 0)
  const dupRows = dup.reduce((a, r) => a + Number(r.rows), 0)
  console.info(
    `\n  ★겹치는 키 ${dupKeys.toLocaleString()}개 · 경기 행 ${dupRows.toLocaleString()}건★` +
      `  (한 키당 ${dupKeys === 0 ? 0 : (dupRows / dupKeys).toFixed(2)}행)`,
  )

  /* ── 2 · 어느 리그끼리 겹치나 ───────────────────────────── */
  console.info('\n══ 2 · ★어느 리그끼리 겹치나★ ══\n')
  const pairs = await prisma.$queryRaw<{ combo: string; keys: bigint }[]>`
    SELECT combo, count(*) AS keys FROM (
      SELECT m."sourceMatchId",
             string_agg(DISTINCT l."slug", '+' ORDER BY l."slug") AS combo,
             count(DISTINCT m."leagueId") AS n
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId"
       WHERE m."sourceMatchId" IS NOT NULL
       GROUP BY 1
      HAVING count(DISTINCT m."leagueId") > 1
    ) q GROUP BY 1 ORDER BY 2 DESC
  `
  if (pairs.length === 0) console.info('  ★겹치는 조합이 없다★')
  for (const p of pairs) {
    console.info(`  ${p.combo.padEnd(30)} ${Number(p.keys).toLocaleString().padStart(8)}개 키`)
  }

  /* ── 3 · 병영수첩에서 온 것이 IPL 밖에도 있나 ───────────────── */
  console.info('\n══ 3 · ★병영수첩 원문 키가 IPL 밖에도 들어가 있나★ ══\n')
  console.info('  «병영수첩에서 온 것은 IPL 이다» — 다른 리그에 있으면 그건 ★미러가 따로 넣은 것★ 이다\n')
  const fromBarracks = await prisma.$queryRaw<
    { league: string; origin: string; matches: bigint }[]
  >`
    WITH keys AS (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw" WHERE "status" = 'ok')
    SELECT l."slug" AS league, m."origin", count(*) AS matches
      FROM keys k
      JOIN "Match" m  ON m."sourceMatchId" = k."matchKey"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1, 2 ORDER BY 3 DESC
  `
  for (const r of fromBarracks) {
    console.info(
      `  ${r.league.padEnd(8)} origin=${r.origin.padEnd(16)} ${Number(r.matches).toLocaleString().padStart(7)}건` +
        `${r.league === 'nolink' ? '' : '  ★IPL 밖★'}`,
    )
  }

  /* ── 4 · origin 별 전체 그림 ───────────────────────────── */
  console.info('\n══ 4 · ★리그 × origin★ — 지금의 바탕값 ══\n')
  const base = await prisma.$queryRaw<
    { league: string; origin: string; matches: bigint; first: Date; last: Date }[]
  >`
    SELECT l."slug" AS league, m."origin", count(*) AS matches,
           min(m."startAt") AS first, max(m."startAt") AS last
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1, 2 ORDER BY 3 DESC
  `
  for (const r of base) {
    const iso = (d: Date): string => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)
    console.info(
      `  ${r.league.padEnd(8)} ${r.origin.padEnd(18)} ${Number(r.matches).toLocaleString().padStart(9)}건` +
        `  ${iso(r.first)} ~ ${iso(r.last)}`,
    )
  }

  console.info(
    '\n⚠ ★이 숫자를 지금 박아 둔다.★ 자동화를 켠 뒤 다시 세서 ★1번의 겹침 행이 늘었는지★ 본다.\n' +
      '  늘었으면 자동화가 만든 것이고, 그대로면 원래 있던 것이다. ★지금 안 세면 그 판단을 못 한다★',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
