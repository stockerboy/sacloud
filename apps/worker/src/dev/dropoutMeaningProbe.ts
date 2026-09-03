/**
 * **`dropout` 이 무슨 뜻인가** — 35% 가 말이 되는지 (2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 재나 ══
 *
 * `supplyMirrorParse.ts` 는 3rd.supply 의 `row.dropout` 을 ★그대로★ 넣는다.
 * 그래서 ★우리는 원본이 무엇을 「탈주」라 부르는지 모른다.★ 물어볼 데도 없다.
 * ★그러면 행동으로 재는 수밖에 없다.★
 *
 * ══ ★무엇으로 가르나★ ══
 * ```
 * 「끝나기 전에 나갔다」면        ★진 팀에 몰려 있어야 한다★ (이기는 쪽은 안 나간다)
 *                                 나간 사람은 ★킬이 적고 데스도 적어야 한다★ (덜 뛰었으니)
 * 「끝난 뒤 방에서 나갔다」면      ★양 팀이 비슷해야 한다★ (다 나간다)
 *                                 킬데스가 ★안 뛴 사람과 다를 게 없어야 한다★
 * ```
 * ★이 두 갈래가 숫자로 갈린다.★ 그래서 이 판이 성립한다.
 *
 * ⚠ ★고치지 않는다.★ 무엇인지만 밝힌다.
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  /* ── 1 · 리그별·연도별 비율 ─────────────────────────────────── */
  console.info('══ 1 · ★리그별 · 해별 dropout 비율★ ══\n')
  const byYear = await prisma.$queryRaw<
    { league: string; yr: number; n: bigint; known: bigint; t: bigint }[]
  >`
    SELECT l."slug" AS league,
           EXTRACT(YEAR FROM m."startAt" AT TIME ZONE 'Asia/Seoul')::int AS yr,
           count(*)                                          AS n,
           count(s."dropout")                                AS known,
           count(*) FILTER (WHERE s."dropout" IS TRUE)       AS t
      FROM "MatchPlayerStat" s
      JOIN "Match" m  ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1, 2 ORDER BY 1, 2
  `
  for (const r of byYear) {
    const n = Number(r.n)
    const known = Number(r.known)
    const t = Number(r.t)
    console.info(
      `  ${r.league.padEnd(8)} ${r.yr}  ${n.toLocaleString().padStart(9)}행` +
        `  아는 값 ${pc(known, n)}` +
        `  ★탈주 ${pc(t, known)}★`,
    )
  }

  /* ── 2 · ★이긴 팀 vs 진 팀★ — 여기서 갈린다 ──────────────────── */
  console.info('\n══ 2 · ★★이긴 팀 vs 진 팀★★ — 여기서 뜻이 갈린다 ══\n')
  console.info('  「끝나기 전 나감」이면 ★진 팀에 몰려야 한다★ · 비슷하면 ★끝난 뒤 나감★\n')
  const bySide = await prisma.$queryRaw<
    { league: string; won: boolean; known: bigint; t: bigint }[]
  >`
    SELECT l."slug" AS league,
           (m."winnerSide" = s."side")                 AS won,
           count(s."dropout")                          AS known,
           count(*) FILTER (WHERE s."dropout" IS TRUE) AS t
      FROM "MatchPlayerStat" s
      JOIN "Match" m  ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1, 2 ORDER BY 1, 2
  `
  const seen = new Map<string, { win: number; winT: number; lose: number; loseT: number }>()
  for (const r of bySide) {
    const cur = seen.get(r.league) ?? { win: 0, winT: 0, lose: 0, loseT: 0 }
    if (r.won) {
      cur.win = Number(r.known)
      cur.winT = Number(r.t)
    } else {
      cur.lose = Number(r.known)
      cur.loseT = Number(r.t)
    }
    seen.set(r.league, cur)
  }
  for (const [league, v] of seen) {
    const w = v.win === 0 ? 0 : (100 * v.winT) / v.win
    const l = v.lose === 0 ? 0 : (100 * v.loseT) / v.lose
    const ratio = w === 0 ? Number.POSITIVE_INFINITY : l / w
    console.info(
      `  ${league.padEnd(8)} 이긴 팀 ★${w.toFixed(1)}%★ · 진 팀 ★${l.toFixed(1)}%★` +
        `  → 진 팀이 ★${ratio.toFixed(2)}배★` +
        `  ${ratio < 1.3 ? '★양 팀 비슷 — 「끝난 뒤 나감」쪽★' : '★진 팀에 몰림 — 「끝나기 전 나감」쪽★'}`,
    )
  }

  /* ── 3 · 나간 사람의 성적 ────────────────────────────────────── */
  console.info('\n══ 3 · ★나갔다는 사람의 킬·데스★ ══\n')
  console.info('  일찍 나갔으면 ★킬도 데스도 적어야★ 한다. 같으면 끝까지 뛴 것이다\n')
  const kd = await prisma.$queryRaw<
    { league: string; dropout: boolean; n: bigint; k: number; d: number }[]
  >`
    SELECT l."slug" AS league, s."dropout", count(*) AS n,
           avg(s."kill")::float AS k, avg(s."death")::float AS d
      FROM "MatchPlayerStat" s
      JOIN "Match" m  ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE s."dropout" IS NOT NULL AND s."kill" IS NOT NULL AND s."death" IS NOT NULL
     GROUP BY 1, 2 ORDER BY 1, 2
  `
  for (const r of kd) {
    console.info(
      `  ${r.league.padEnd(8)} 탈주=${String(r.dropout).padEnd(5)}` +
        ` ${Number(r.n).toLocaleString().padStart(9)}행` +
        `  킬 ${r.k.toFixed(2)}  데스 ${r.d.toFixed(2)}`,
    )
  }

  /* ── 4 · 경기당 몇 명이 나갔나 ───────────────────────────────── */
  console.info('\n══ 4 · ★경기당 탈주 인원★ (supply · sanply) ══\n')
  const perMatch = await prisma.$queryRaw<{ league: string; cnt: number; n: bigint }[]>`
    SELECT league, cnt, count(*) AS n FROM (
      SELECT l."slug" AS league, m."id",
             count(*) FILTER (WHERE s."dropout" IS TRUE)::int AS cnt
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       WHERE l."slug" IN ('supply', 'sanply')
       GROUP BY 1, 2
    ) q GROUP BY 1, 2 ORDER BY 1, 2
  `
  const grouped = new Map<string, Map<number, number>>()
  for (const r of perMatch) {
    const m = grouped.get(r.league) ?? new Map<number, number>()
    m.set(r.cnt, Number(r.n))
    grouped.set(r.league, m)
  }
  for (const [league, m] of grouped) {
    const total = [...m.values()].reduce((a, b) => a + b, 0)
    console.info(`  ${league} — 경기 ${total.toLocaleString()}건`)
    for (const [cnt, n] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
      const star = cnt === 0 || cnt >= 10 ? '★' : ' '
      console.info(`    ${star}${String(cnt).padStart(2)}명 ${n.toLocaleString().padStart(9)}건 ${pc(n, total)}${star}`)
    }
  }

  /* ── 5 · 한 팀이 통째로 나간 경기 ────────────────────────────── */
  console.info('\n══ 5 · ★한 팀이 통째로 나간 경기★ ══\n')
  const wholeTeam = await prisma.$queryRaw<
    { league: string; matches: bigint; teamAll: bigint; teamAllLost: bigint }[]
  >`
    SELECT league,
           count(DISTINCT "matchId")                                     AS matches,
           count(*) FILTER (WHERE allOut)                                AS "teamAll",
           count(*) FILTER (WHERE allOut AND NOT won)                    AS "teamAllLost"
      FROM (
        SELECT l."slug" AS league, s."matchId", s."side",
               bool_and(s."dropout" IS TRUE)      AS allOut,
               bool_or(m."winnerSide" = s."side") AS won,
               count(*)                           AS members
          FROM "MatchPlayerStat" s
          JOIN "Match" m  ON m."id" = s."matchId"
          JOIN "League" l ON l."id" = m."leagueId"
         WHERE l."slug" IN ('supply', 'sanply')
         GROUP BY 1, 2, 3
        HAVING count(*) >= 4
      ) q
     GROUP BY 1 ORDER BY 1
  `
  for (const r of wholeTeam) {
    const all = Number(r.teamAll)
    console.info(
      `  ${r.league.padEnd(8)} 경기 ${Number(r.matches).toLocaleString()}건` +
        `  ★한 팀 전원 탈주 ${all.toLocaleString()}팀★` +
        `  그중 ★진 팀 ${pc(Number(r.teamAllLost), all)}★`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
