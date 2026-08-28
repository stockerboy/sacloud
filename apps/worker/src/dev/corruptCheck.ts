/**
 * 증분 파이프라인 **사전 점검** — 로컬/운영에서 절약이 실제로 성립하는지 본다 (D-168).
 *
 *   1. 집계 대조 도구(`rollupParity.ts`)가 남긴 훼손 값(`win<0`)이 없는가
 *   2. 등록 클랜의 `sourceLeagueClanId` 가 채워져 있는가
 *      — 이게 비면 사이클마다 `/clans/{slug}/show` 를 그 수만큼 다시 보낸다
 *   3. 리그의 `sourceLeagueId` 가 채워져 있는가 — 비면 사이클마다 `/leagues/{slug}` 를 부른다
 *
 * **읽기만 한다.** 기본은 로컬 DB 전용이고, 운영을 보려면 `--allow-remote` 를 준다.
 */
import { prisma } from '@sacloud/db'

const ALLOW_REMOTE = process.argv.includes('--allow-remote')

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url) && !ALLOW_REMOTE) {
    throw new Error('로컬 DB 가 아니다. 운영을 보려면 --allow-remote 를 명시한다')
  }

  const broken = (await prisma.$queryRawUnsafe(`
    select l.slug, count(*)::int as n
    from "LeaguePlayer" lp join "League" l on l.id = lp."leagueId"
    where lp.win < 0 or lp.lose < 0
    group by l.slug order by l.slug
  `)) as { slug: string; n: number }[]

  if (broken.length === 0) {
    console.log('[1] 훼손된 LeaguePlayer 행 없음 ✓')
  } else {
    console.log('[1] 훼손된 행이 남아 있다 — 해당 리그에 `supply-rollup --full --confirm` 을 돌린다')
    for (const row of broken) console.log(`      ${row.slug} ${row.n}행`)
    process.exitCode = 1
  }

  /* 증분 동기화가 도는 세 리그만 본다. 나머지 리그(공식전·친선 등)는 3rd.supply 에서
     미러링하지 않으므로 원본 league_clan id 가 없는 것이 정상이다 */
  const clans = (await prisma.$queryRawUnsafe(`
    select l.slug,
           count(*)::int as registered,
           count(lc."sourceLeagueClanId")::int as with_source
    from "LeagueClan" lc join "League" l on l.id = lc."leagueId"
    where lc.placement = false and l.slug in ('supply','daerule','sanply')
    group by l.slug order by l.slug
  `)) as { slug: string; registered: number; with_source: number }[]

  console.log('[2] 등록 클랜의 원본 league_clan id — 빈 만큼 매 사이클 /clans/show 가 나간다')
  let missing = 0
  for (const row of clans) {
    const gap = row.registered - row.with_source
    missing += gap
    console.log(
      `      ${row.slug} ${row.with_source}/${row.registered}` +
        (gap > 0 ? `  ← ${gap}건 비어 있다` : '  ✓'),
    )
  }
  if (missing > 0) {
    console.log(`      합계 ${missing}건 → 사이클마다 요청 ${missing}건이 더 나간다`)
    process.exitCode = 1
  }

  const leagues = (await prisma.$queryRawUnsafe(`
    select slug, "sourceLeagueId" from "League"
    where slug in ('supply','daerule','sanply') order by slug
  `)) as { slug: string; sourceLeagueId: string | null }[]
  console.log('[3] 리그 원본 id — 비면 사이클마다 /leagues/{slug} 를 한 건씩 묻는다')
  for (const row of leagues) {
    const ok = row.sourceLeagueId !== null && row.sourceLeagueId !== ''
    console.log(`      ${row.slug} ${ok ? `${row.sourceLeagueId} ✓` : '비어 있다 ←'}`)
    if (!ok) process.exitCode = 1
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
