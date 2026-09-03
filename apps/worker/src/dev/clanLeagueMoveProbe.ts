/**
 * **겹친 클랜 43곳 — 어느 리그가 「나중」인가** (2026-09-03 · 읽기 전용).
 *
 * ══ 왜 ══
 *
 * 사장님이 못박으셨다.
 * > «등록도 겹치면 안된다 못박아라.
 * >  **열산클랜이 SPL에 합류하면 그 열산클랜은 더 이상 열산클랜이 아니고 그 반대도 마찬가지이다**»
 *
 * ★「합류하면 더 이상 아니다」 — 둘 다 유효한 게 아니라 **나중 것이 현재 소속**이다.★
 * 그래서 **어느 쪽이 나중인지 갈라낼 자**가 있어야 한다. 이 파일은 그 자를 찾는다.
 *
 * ══ ★`joinedAt` 은 자로 쓸 수 없다★ ══
 *
 * `LeagueClan.joinedAt` 은 `@default(now())` 인데, 미러 적재기가 **그 칸을 안 넣는다**
 * (`supplyMirrorImport.ts:444` — `create({ data: { leagueId, clanId, division, sourceLeagueClanId } })`).
 * ★그래서 그 값은 「가입한 때」가 아니라 「우리가 적재한 때」다.★
 * 오늘 `sourceRating` 이 「그날 점수」가 아니었던 것과 **같은 함정**이다.
 * → 아래 1번이 그것을 **숫자로** 보여 준다 (적재일에 뭉쳐 있으면 그게 증거다).
 *
 * ══ 그래서 무엇을 자로 쓰나 ══
 *
 * ★경기의 `startAt` 은 원본이 준 실제 시각이다.★ 우리가 만든 값이 아니다.
 * 「그 리그에서 마지막으로 뛴 날」이면 **지금 어디서 뛰고 있는지**를 말해 준다.
 *
 * ⚠ **읽기만 한다. 아무것도 고치지 않는다.**
 */
import { prisma } from '@sacloud/db'

interface Row {
  name: string
  slug: string
  a_lcid: string
  b_lcid: string
  a_league: string
  a_joined: Date | null
  a_last: Date | null
  a_games: bigint
  b_league: string
  b_joined: Date | null
  b_last: Date | null
  b_games: bigint
}

function ymd(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '없음'
}

async function main(): Promise<void> {
  /* 겹친 클랜마다 두 리그의 (등록시각 · 마지막 경기 · 경기 수) 를 한 줄로 뽑는다 */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH live AS (
      SELECT lc."clanId", lc."id" AS lcid, lc."joinedAt", l."slug"
        FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId"
       WHERE lc."expelledAt" IS NULL
    ),
    played AS (
      SELECT lcid, max(start_at) AS last_at, count(*) AS games FROM (
        SELECT "redLeagueClanId" AS lcid, "startAt" AS start_at FROM "Match"
        UNION ALL
        SELECT "blueLeagueClanId", "startAt" FROM "Match"
      ) t GROUP BY lcid
    )
    SELECT c."name" AS name, c."slug" AS slug,
           x.lcid AS a_lcid, y.lcid AS b_lcid,
           x."slug" AS a_league, x."joinedAt" AS a_joined,
           px."last_at" AS a_last, coalesce(px."games", 0) AS a_games,
           y."slug" AS b_league, y."joinedAt" AS b_joined,
           py."last_at" AS b_last, coalesce(py."games", 0) AS b_games
      FROM live x
      JOIN live y ON x."clanId" = y."clanId" AND x."slug" < y."slug"
      JOIN "Clan" c ON c."id" = x."clanId"
      LEFT JOIN played px ON px.lcid = x.lcid
      LEFT JOIN played py ON py.lcid = y.lcid
     ORDER BY x."slug", y."slug", c."name"
  `

  console.info('══ 1 · ★`joinedAt` 이 진짜 가입 시각인가★ ══\n')
  const joinDays = new Map<string, number>()
  for (const r of rows) {
    for (const d of [r.a_joined, r.b_joined]) {
      const key = ymd(d)
      joinDays.set(key, (joinDays.get(key) ?? 0) + 1)
    }
  }
  const spread = [...joinDays.entries()].sort((p, q) => q[1] - p[1])
  console.info(`  겹친 등록행 ${rows.length * 2}개가 ★날짜 ${spread.length}개★ 에 몰려 있다`)
  for (const [day, n] of spread.slice(0, 6)) console.info(`    ${day}  ${n}개`)
  console.info(
    spread.length <= 5
      ? '\n  ★날짜가 손에 꼽힌다 = 「가입한 때」가 아니라 「우리가 적재한 때」다. 자로 못 쓴다★'
      : '\n  날짜가 흩어져 있다 — 그래도 적재 시각일 수 있으니 아래 경기 날짜와 대조하라',
  )

  console.info('\n══ 2 · ★어느 리그에서 마지막으로 뛰었나★ (원본 시각이라 믿을 수 있다) ══\n')
  console.info(
    `  ${'클랜'.padEnd(20)}${'A리그'.padEnd(9)}${'마지막'.padEnd(11)}${'경기'.padStart(7)}` +
      `   ${'B리그'.padEnd(9)}${'마지막'.padEnd(11)}${'경기'.padStart(7)}   판정`,
  )
  const verdictCount = new Map<string, number>()
  for (const r of rows) {
    const at = r.a_last ? r.a_last.getTime() : -1
    const bt = r.b_last ? r.b_last.getTime() : -1
    /* 「나중에 뛴 쪽」이 현재 소속이다. 둘 다 없으면 판정하지 않는다 */
    const verdict =
      at < 0 && bt < 0
        ? '★못 정함(양쪽 경기 0)★'
        : at > bt
          ? `${r.a_league} 쪽`
          : bt > at
            ? `${r.b_league} 쪽`
            : '★같은 날 — 못 정함★'
    verdictCount.set(verdict, (verdictCount.get(verdict) ?? 0) + 1)
    console.info(
      `  ${r.name.slice(0, 19).padEnd(20)}${r.a_league.padEnd(9)}${ymd(r.a_last).padEnd(11)}` +
        `${Number(r.a_games).toString().padStart(7)}   ` +
        `${r.b_league.padEnd(9)}${ymd(r.b_last).padEnd(11)}${Number(r.b_games).toString().padStart(7)}` +
        `   ${verdict}`,
    )
  }
  console.info('\n  판정 요약')
  for (const [v, n] of [...verdictCount.entries()].sort((p, q) => q[1] - p[1])) {
    console.info(`    ${v.padEnd(24)} ${n}곳`)
  }

  console.info('\n══ 3 · ★한쪽을 빼면 그 리그에서 몇 경기가 안 보이게 되나★ ══\n')
  console.info('  ⚠ 지우는 것이 아니라 감추는 것이다 (`CLAUDE.md` 1-4)\n')
  const hide = new Map<string, { clans: number; games: number }>()
  for (const r of rows) {
    const at = r.a_last ? r.a_last.getTime() : -1
    const bt = r.b_last ? r.b_last.getTime() : -1
    if (at === bt) continue /* 못 정하는 것은 세지 않는다 */
    /* 진 쪽(먼저 뛴 쪽)에서 뺀다 */
    const loser = at > bt ? r.b_league : r.a_league
    const games = at > bt ? Number(r.b_games) : Number(r.a_games)
    const cur = hide.get(loser) ?? { clans: 0, games: 0 }
    hide.set(loser, { clans: cur.clans + 1, games: cur.games + games })
  }
  if (hide.size === 0) console.info('  판정된 것이 없다')
  for (const [lg, v] of [...hide.entries()].sort((p, q) => q[1].games - p[1].games)) {
    console.info(
      `  ${lg.padEnd(9)} 클랜 ${v.clans}곳 · 그 클랜이 낀 경기 ${v.games.toLocaleString()}건(★자리 수★)`,
    )
  }

  /*
   * ★위 숫자는 「자리 수」다. 경기 수가 아니다.★
   *   · 한 경기에 뺄 클랜이 **둘 다** 있으면 두 번 세어진다
   *   · 한쪽만 빠지면 그 경기는 ★상대 쪽에서 여전히 보인다★ — 사라지지 않는다
   * 사장님이 보실 숫자는 「정말 안 보이게 되는 경기」이므로 **따로 센다.**
   */
  console.info('\n  ── ★겹쳐 세지 않고 다시★ ──\n')
  const losers = new Map<string, string[]>()
  for (const r of rows) {
    const at = r.a_last ? r.a_last.getTime() : -1
    const bt = r.b_last ? r.b_last.getTime() : -1
    if (at === bt) continue
    const lg = at > bt ? r.b_league : r.a_league
    const lcid = at > bt ? r.b_lcid : r.a_lcid
    losers.set(lg, [...(losers.get(lg) ?? []), lcid])
  }
  for (const [lg, ids] of losers) {
    /* ⚠ `Promise.all` 금지 — prod-run 은 connection_limit=1 이다 (오늘 한 번 터뜨렸다) */
    const both = await prisma.match.count({
      where: { redLeagueClanId: { in: ids }, blueLeagueClanId: { in: ids } },
    })
    const either = await prisma.match.count({
      where: { OR: [{ redLeagueClanId: { in: ids } }, { blueLeagueClanId: { in: ids } }] },
    })
    console.info(
      `  ${lg.padEnd(9)} 그 클랜이 낀 경기 ★${either.toLocaleString()}건★ ` +
        `(그중 ★양쪽 다 빠지는 경기 ${both.toLocaleString()}건★ = 통째로 안 보인다)`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
