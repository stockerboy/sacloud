/**
 * **시즌 창을 만들 수 있는가** — 기록이 어디까지 거슬러 올라가는지 센다 (2026-09-03 · 읽기 전용).
 *
 * ══ 왜 ══
 *
 * 사장님이 시즌 틀을 주셨다.
 * ```
 * Beta   2026-01-01(목) ~ 7월 첫째주
 * 시즌0  7월 첫째주 ~ 지금
 * 시즌1  2026-10-01(목) 정식 오픈 · ★그때 Beta 와 시즌0 은 없어진다★
 * 그래프 ★매주 목요일마다 찍는다★
 * ```
 * > «그래서 **1월 첫째주 기록부터 필요하다**»
 *
 * ★**1월치가 비어 있으면 Beta 시즌을 만들 수 없다.**★ 그게 이 조사의 핵심이다.
 * **아무것도 쓰지 않는다.** 마이그레이션도 하지 않는다. 세기만 한다.
 */
import { prisma } from '@sacloud/db'

const LEAGUES = ['supply', 'sanply', 'nolink', 'daerule'] as const

function ymd(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—'
}

async function main(): Promise<void> {
  console.info('══ 1 · 리그마다 기록이 어디까지 거슬러 올라가나 ══\n')

  const leagues = await prisma.league.findMany({
    where: { slug: { in: [...LEAGUES] } },
    select: { id: true, slug: true, name: true },
  })

  for (const lg of leagues) {
    const [oldest, newest, total] = await Promise.all([
      prisma.match.findFirst({
        where: { leagueId: lg.id },
        orderBy: { startAt: 'asc' },
        select: { startAt: true },
      }),
      prisma.match.findFirst({
        where: { leagueId: lg.id },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      }),
      prisma.match.count({ where: { leagueId: lg.id } }),
    ])
    console.info(
      `  ${lg.slug.padEnd(9)} 가장 오래된 ${ymd(oldest?.startAt ?? null)}  ` +
        `가장 최근 ${ymd(newest?.startAt ?? null)}  전체 ${total.toLocaleString()}건`,
    )
  }

  console.info('\n══ 2 · 2026-01-01 부터 월별 경기 수 ══\n')
  const rows = await prisma.$queryRaw<
    { slug: string; month: string; games: bigint }[]
  >`
    SELECT l."slug" AS slug,
           to_char(date_trunc('month', m."startAt" AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM') AS month,
           count(*) AS games
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE m."startAt" >= timestamptz '2026-01-01 00:00:00+09'
     GROUP BY 1, 2
     ORDER BY 2, 1
  `
  const months = [...new Set(rows.map((r) => r.month))].sort()
  const slugs = [...new Set(rows.map((r) => r.slug))].sort()
  console.info(`  ${'월'.padEnd(9)}${slugs.map((s) => s.padStart(10)).join('')}`)
  for (const m of months) {
    const cells = slugs.map((s) => {
      const hit = rows.find((r) => r.month === m && r.slug === s)
      return (hit ? Number(hit.games).toLocaleString() : '·').padStart(10)
    })
    console.info(`  ${m.padEnd(9)}${cells.join('')}`)
  }

  console.info('\n══ 3 · 매주 목요일 스냅샷을 되짚어 만들 수 있나 ══\n')
  /* 경기마다 래더 증감이 남아 있으면 거꾸로 되짚어 그날 점수를 되살릴 수 있다 */
  /*
   * ⚠ ★`Promise.all` 로 묶지 않는다.★ `prod-run` 은 `connection_limit=1` 로 붙는다 —
   *   운영 DB 자리를 하나만 쓰겠다는 뜻이다. 동시에 셋을 물으면 스스로 못 받고 시간초과 난다
   *   (2026-09-03 에 실제로 그렇게 한 번 터졌다). **하나씩 묻는다.**
   */
  const statTotal = await prisma.matchPlayerStat.count()
  const withDelta = await prisma.matchPlayerStat.count({ where: { ratingUpdate: { not: null } } })
  const oldestDelta = await prisma.matchPlayerStat.findFirst({
    where: { ratingUpdate: { not: null } },
    orderBy: { match: { startAt: 'asc' } },
    select: { match: { select: { startAt: true } } },
  })
  console.info(`  MatchPlayerStat 전체        ${statTotal.toLocaleString()}건`)
  console.info(
    `  그중 ratingUpdate 가 있는 것 ${withDelta.toLocaleString()}건 ` +
      `(${statTotal === 0 ? 0 : Math.round((withDelta / statTotal) * 1000) / 10}%)`,
  )
  console.info(`  래더 증감이 남은 가장 오래된 경기 ${ymd(oldestDelta?.match.startAt ?? null)}`)

  /*
   * ★위 셋은 「우리가 계산한」 값이다 (D-145). 화면이 쓰는 것은 아래 원본 값이다 (D-153).★
   *
   * ⚠ `sourceRating` 은 **되짚기 입력으로 못 쓴다** — 스키마 주석에 실측이 적혀 있다.
   *   원본이 「수집 시점의 현재 래더」를 모든 행에 그대로 붙여서, 한 선수의 162경기가 전부 같았다.
   * ★`sourceRatingDelta` 는 다르다 — 「경기마다 다르다 · 진짜 증감이 맞다」★
   *   그래서 **되짚기가 되느냐는 이 칸에 달려 있다.**
   */
  const srcDelta = await prisma.matchPlayerStat.count({
    where: { sourceRatingDelta: { not: null } },
  })
  console.info(
    `\n  ★원본 증감(sourceRatingDelta)이 있는 것★ ${srcDelta.toLocaleString()}건 ` +
      `(${statTotal === 0 ? 0 : Math.round((srcDelta / statTotal) * 1000) / 10}%)`,
  )
  const oldestSrc = await prisma.matchPlayerStat.findFirst({
    where: { sourceRatingDelta: { not: null } },
    orderBy: { match: { startAt: 'asc' } },
    select: { match: { select: { startAt: true } } },
  })
  console.info(`  원본 증감이 남은 가장 오래된 경기 ${ymd(oldestSrc?.match.startAt ?? null)}`)

  /* 월별로 몇 %나 남아 있나 — 중간에 구멍이 나면 그 앞은 되짚을 수 없다 */
  const cover = await prisma.$queryRaw<{ month: string; total: bigint; kept: bigint }[]>`
    SELECT to_char(date_trunc('month', m."startAt" AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM') AS month,
           count(*) AS total,
           count(s."sourceRatingDelta") AS kept
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
     WHERE m."startAt" >= timestamptz '2026-01-01 00:00:00+09'
     GROUP BY 1 ORDER BY 1
  `
  console.info('\n  월별 보존율')
  for (const r of cover) {
    const t = Number(r.total)
    const k = Number(r.kept)
    console.info(
      `    ${r.month}  ${k.toLocaleString().padStart(9)} / ${t.toLocaleString().padStart(9)}` +
        `  ${t === 0 ? 0 : Math.round((k / t) * 1000) / 10}%`,
    )
  }

  console.info('\n══ 4 · 시즌 틀이 지금 있나 ══\n')
  const seasons = await prisma.season.findMany({
    select: {
      number: true,
      seasonType: true,
      status: true,
      startedAt: true,
      endedAt: true,
      frozen: true,
      league: { select: { slug: true } },
      _count: { select: { matches: true } },
    },
    orderBy: [{ leagueId: 'asc' }, { number: 'asc' }],
  })
  if (seasons.length === 0) {
    console.info('  ★Season 행이 하나도 없다★ — 표는 있는데 채워진 것이 없다')
  } else {
    for (const s of seasons) {
      console.info(
        `  ${s.league.slug.padEnd(9)} #${String(s.number).padStart(2)} ${s.seasonType.padEnd(9)}` +
          ` ${s.status.padEnd(7)} ${ymd(s.startedAt)} ~ ${ymd(s.endedAt)}` +
          ` 경기 ${s._count.matches.toLocaleString()}  frozen=${s.frozen}`,
      )
    }
  }
  const orphan = await prisma.match.count({ where: { seasonId: null } })
  console.info(`\n  ★어느 시즌에도 안 묶인 경기★ ${orphan.toLocaleString()}건`)

  /* 최근 달에만 구멍이 있다 — ★어느 리그 탓인지★ 를 밝힌다. 안 밝히면 원인을 지어내게 된다 */
  const gap = await prisma.$queryRaw<{ slug: string; total: bigint; kept: bigint }[]>`
    SELECT l."slug" AS slug, count(*) AS total, count(s."sourceRatingDelta") AS kept
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE m."startAt" >= timestamptz '2026-07-01 00:00:00+09'
     GROUP BY 1 ORDER BY 1
  `
  console.info('\n  2026-07 이후 리그별 보존율 (구멍이 어디서 났나)')
  for (const r of gap) {
    const t = Number(r.total)
    const k = Number(r.kept)
    console.info(
      `    ${r.slug.padEnd(9)} ${k.toLocaleString().padStart(9)} / ${t.toLocaleString().padStart(9)}` +
        `  ${t === 0 ? 0 : Math.round((k / t) * 1000) / 10}%`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
