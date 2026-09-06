/**
 * ★★Part 7 — 랭킹이 맞는가★★ (2026-09-06 · 사장님 지시 3·4·6·7·8). ★읽기만 한다.★
 *
 * ```
 * pnpm exec tsx apps/web/scripts/part7RankVerify.ts
 * ```
 *
 * ── 무엇을 맞대나
 *   ① 화면·API 가 부르는 그 함수를 ★그대로★ 부른다
 *        통합   `getPlayerRanks(leagueId, cursor, size)`
 *        무기   `getWeaponRanks(leagueId, weapon, cursor, size)`
 *        클랜   `getClanRanks(leagueId, division, cursor, size)`
 *   ② 같은 표를 ★우리가 다시 정렬해★ 순위를 만든다 (정렬 키는 코드에서 읽은 그대로)
 *   ③ 그 선수의 승패·킬데스를 ★원본 MatchPlayerStat 에서 직접 센 값★ 과 맞댄다
 *
 * ── ★공식은 건드리지 않는다★ (사장님 지시)
 *   여기서 새 점수를 만들지 않는다. `rating` · `ratingDelta` 는 ★있는 값을 읽기만★ 한다.
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'
import { getPlayerRanks, getClanRanks, ALL_DIVISIONS } from '../lib/server/queries/leagues'
import { getPlayerRanksByWeapon } from '../lib/server/queries/rankings'
import { hiddenClanSlugsIn } from '@sacloud/contract'

const LEAGUES = ['nolink', 'supply', 'sanply'] as const
const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }
const PAGE = 20
const line = (ok: boolean, label: string, detail: string) =>
  console.info(`     ${ok ? '✔' : '✘'} ${label.padEnd(44)} ${detail}`)

async function main(): Promise<void> {
  const from = SEASON0_FROM
  const to = SEASON0_TO ?? new Date('2100-01-01')
  const origins = [...SEASON0_ORIGINS]
  let bad = 0

  for (const slug of LEAGUES) {
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue
    console.info(`\n════════ ${LABEL[slug]} (${slug}) ════════`)

    /* ── ① 통합 개인 랭킹 ─────────────────────────────────────────── */
    const ranks = await getPlayerRanks(league.id, null, PAGE)
    if (!ranks) {
      console.info('  ★랭킹을 못 읽었다★')
      bad += 1
      continue
    }

    /* ② 같은 표를 우리가 다시 정렬한다 — 정렬 키는 `rating desc, id asc` */
    const mine = await prisma.leaguePlayer.findMany({
      where: { leagueId: league.id, placement: false },
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: PAGE,
      select: {
        id: true, rating: true, win: true, lose: true, kill: true, death: true,
        player: { select: { id: true, name: true } },
      },
    })

    const sameOrder = ranks.items.every((r, i) => r.league_player_id === mine[i]?.id)
    const rankSeq = ranks.items.every((r, i) => r.rank === i + 1)
    line(sameOrder, '통합 랭킹 상위 20 — 화면 순서 = 우리 정렬', sameOrder ? '같다' : '★다르다★')
    line(rankSeq, '순위가 1,2,3… 로 이어진다', rankSeq ? '이어진다' : '★끊긴다★')
    if (!sameOrder || !rankSeq) bad += 1

    /* ③ 상·중·하위권 표본을 원본과 맞댄다 */
    const total = await prisma.leaguePlayer.count({ where: { leagueId: league.id, placement: false } })
    const picks = [0, Math.floor(total / 2), Math.max(total - 1, 0)]
    console.info(`     ── 표본 (모집단 ${total}명 중 1위 · 중위 · 최하위) ──`)
    for (const skip of picks) {
      const [row] = await prisma.leaguePlayer.findMany({
        where: { leagueId: league.id, placement: false },
        orderBy: [{ rating: 'desc' }, { id: 'asc' }],
        skip,
        take: 1,
        select: {
          id: true, rating: true, win: true, lose: true, kill: true, death: true,
          player: { select: { id: true, name: true } },
        },
      })
      if (!row) continue
      const [live] = await prisma.$queryRawUnsafe<
        Array<{ win: number; lose: number; kill: number; death: number; inc: number; other: number }>
      >(`
        SELECT COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int  AS win,
               COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
               COALESCE(SUM(ps.kill),0)::int  AS kill,
               COALESCE(SUM(ps.death),0)::int AS death,
               COUNT(*) FILTER (WHERE m."lineupStatus" = 'incomplete')::int AS inc,
               COUNT(*) FILTER (WHERE m."leagueId" <> $1)::int         AS other
          FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
         WHERE ps."playerId" = $2 AND m."leagueId" = $1
           AND m."startAt" >= $3 AND m."startAt" < $4 AND m."supersededAt" IS NULL
           AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($5::text[]))`,
        league.id, row.player.id, from, to, origins)
      const ok =
        row.win === live?.win && row.lose === live?.lose &&
        row.kill === live?.kill && row.death === live?.death &&
        live?.inc === 0 && live?.other === 0
      if (!ok) bad += 1
      console.info(
        `     ${ok ? '✔' : '✘'} ${String(skip + 1).padStart(5)}위 ${row.player.name.padEnd(14)} 래더 ${row.rating}\n` +
          `        표 ${row.win}승 ${row.lose}패 ${row.kill}킬 ${row.death}데스 · ` +
          `원본 ${live?.win}/${live?.lose}/${live?.kill}/${live?.death} · ` +
          `★불완전 ${live?.inc} · 다른 리그 ${live?.other}★`,
      )
    }

    /* ── 동점 처리 ─────────────────────────────────────────────────── */
    const ties = await prisma.$queryRawUnsafe<Array<{ rating: number; n: number }>>(`
      SELECT rating, COUNT(*)::int AS n FROM "LeaguePlayer"
       WHERE "leagueId" = $1 AND NOT placement
       GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 1`, league.id)
    if (ties[0]) {
      const tied = await prisma.leaguePlayer.findMany({
        where: { leagueId: league.id, placement: false, rating: ties[0].rating },
        orderBy: [{ rating: 'desc' }, { id: 'asc' }],
        select: { id: true },
      })
      const sortedById = [...tied].sort((a, b) => (a.id < b.id ? -1 : 1))
      const deterministic = tied.every((t, i) => t.id === sortedById[i]?.id)
      line(
        deterministic,
        `동점 ${ties[0].n}명(래더 ${ties[0].rating}) — id 오름차순인가`,
        deterministic ? '★결정적★' : '★흔들린다★',
      )
      if (!deterministic) bad += 1
    } else {
      console.info('     동점인 선수가 없다')
    }

    /* ── 무기 랭킹 ────────────────────────────────────────────────── */
    for (const weapon of ['sniper', 'rifle'] as const) {
      const wr = await getPlayerRanksByWeapon(league.id, weapon, null, 10)
      if (!wr || wr.items.length === 0) {
        console.info(`     ${weapon} 랭킹 — 줄이 없다`)
        continue
      }
      const code = weapon === 'sniper' ? 1 : 0
      /*
       * ⚠ ★처음에 조건 둘을 빠뜨려 「다르다」가 나왔다 — 코드가 아니라 내 자가 틀렸다.★
       *   `knownStatGames > 0`   K/D 를 아는 판이 있어야 한다
       *   ★`isMain: true`★       ★주무기만 그 무기 랭킹에 오른다★ (D-173)
       *                          «라플수가 어쩌다 든 스나 몇 판으로 스나 랭킹에 들어오면 안 된다»
       */
      const mineW = await prisma.leaguePlayerWeaponStat.findMany({
        where: {
          weapon: code,
          knownStatGames: { gt: 0 },
          isMain: true,
          leaguePlayer: { leagueId: league.id, placement: false },
        },
        orderBy: [{ ratingDelta: 'desc' }, { leaguePlayerId: 'asc' }],
        take: 10,
        select: { leaguePlayerId: true, ratingDelta: true, games: true },
      })
      const same = wr.items.every((r, i) => r.league_player_id === mineW[i]?.leaguePlayerId)
      line(same, `${weapon} 랭킹 상위 10 — 화면 순서 = 우리 정렬`, same ? '같다' : '★다르다★')
      if (!same) bad += 1

      /* 그 무기 기록이 정말 그 무기 경기에서만 왔는가 */
      const top = mineW[0]
      if (top) {
        const lp = await prisma.leaguePlayer.findUniqueOrThrow({
          where: { id: top.leaguePlayerId },
          select: { playerId: true, player: { select: { name: true } } },
        })
        const [w] = await prisma.$queryRawUnsafe<Array<{ games: number; other: number }>>(`
          SELECT COUNT(*) FILTER (WHERE ps.weapon = $1)::int  AS games,
                 COUNT(*) FILTER (WHERE ps.weapon <> $1)::int AS other
            FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
           WHERE ps."playerId" = $2 AND m."leagueId" = $3
             AND m."startAt" >= $4 AND m."startAt" < $5 AND m."supersededAt" IS NULL
             AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($6::text[]))`,
          code, lp.playerId, league.id, from, to, origins)
        console.info(
          `        1위 ${lp.player.name} — 표의 ${weapon} 판수 ${top.games} · 원본 그 무기 판수 ${w?.games} · 다른 무기 판수 ${w?.other}`,
        )
        if (top.games !== w?.games) bad += 1
      }
    }

    /* ── 클랜 랭킹 ────────────────────────────────────────────────── */
    const cr = await getClanRanks(league.id, ALL_DIVISIONS, null, 10)
    if (!cr) {
      console.info('     ★클랜 랭킹을 못 읽었다★')
      bad += 1
    } else {
      const isIpl = slug === 'nolink'
      /*
       * ⚠ ★감춘 클랜은 랭킹에 안 나온다★ (O-044) — `activeClanIn(league.slug)`.
       *   그 조건을 빼면 SPL 에서 순서가 어긋난다. ★코드가 아니라 내 자가 틀렸던 자리다.★
       */
      const hidden = [...hiddenClanSlugsIn(slug)]
      const mineC = await prisma.leagueClan.findMany({
        where: {
          leagueId: league.id,
          placement: false,
          expelledAt: null,
          ...(hidden.length > 0 ? { clan: { slug: { notIn: hidden } } } : {}),
        },
        orderBy: isIpl
          ? [{ division: 'asc' }, { rating: 'desc' }, { id: 'asc' }]
          : [{ rating: 'desc' }, { id: 'asc' }],
        take: 10,
        select: { id: true, rating: true, division: true, clan: { select: { name: true } } },
      })
      const same = cr.items.every((r, i) => r.league_clan_id === mineC[i]?.id)
      line(
        same,
        `클랜 랭킹 상위 10 — 화면 순서 = 우리 정렬 (${isIpl ? '티어→래더→id' : '래더→id'})`,
        same ? '같다' : '★다르다★',
      )
      if (!same) bad += 1
      const top = mineC[0]
      if (top) console.info(`        1위 ${top.clan.name} · 래더 ${top.rating} · 부리그 ${top.division}`)
    }
  }

  console.info(`\n══ 어긋난 검사 ${bad}건 ══`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
