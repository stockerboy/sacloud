/**
 * 운영 증분 집계 실패 원인 실측 — **읽기만 한다** (D-168 후속).
 *
 * 2026-08-28 운영 사이클이 `57014 statement timeout` 으로 죽었다.
 * 죽은 자리는 증분 집계의 2단계(영향받은 선수의 리그 전 경기 다시 읽기)다.
 *
 * 여기서 재는 것 —
 *   1. `statement_timeout` 이 실제로 몇인가
 *   2. 창(기본 24시간)에 걸리는 경기가 몇 건인가  ← "증분이 사실상 전수" 인지 판정
 *   3. 그 경기가 건드리는 선수가 몇 명인가
 *   4. 문제의 쿼리가 배치 크기별로 **몇 초** 걸리는가 (100 · 500)
 *
 * `SELECT` 와 `EXPLAIN` 만 한다. 한 줄도 쓰지 않는다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@sacloud/db'

const REPO_ROOT = join(process.cwd(), '..', '..')
const LEAGUES = (
  process.argv.find((a) => a.startsWith('--leagues='))?.split('=')[1] ?? 'supply,daerule,sanply'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
/** 창(시간). 잡 기본값과 같은 24 */
const WINDOW_HOURS = Number(
  process.argv.find((a) => a.startsWith('--window-hours='))?.split('=')[1] ?? 24,
)
const MIRROR = '3rd.supply'

/** 운영 접속 문자열을 파일에서 읽는다. **값을 찍지 않는다** */
function productionUrl(): string {
  const text = readFileSync(join(REPO_ROOT, 'packages', 'db', '.env.production.local'), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)$/)
    if (!match) continue
    return (match[1] ?? '').trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('.env.production.local 에서 DATABASE_URL 을 찾지 못했다')
}

async function main(): Promise<void> {
  const url = productionUrl()
  const host = url.replace(/^.*@/, '').replace(/[/?].*$/, '')
  console.log(`운영 DB 접속 — ${host} (자격증명은 찍지 않는다)`)

  const prisma = new PrismaClient({ datasources: { db: { url } } })

  const settings = (await prisma.$queryRawUnsafe(`
    select current_setting('statement_timeout') as statement_timeout,
           current_setting('idle_in_transaction_session_timeout') as idle_timeout,
           version() as version
  `)) as { statement_timeout: string; idle_timeout: string; version: string }[]
  console.log(`\n[1] statement_timeout = ${settings[0]?.statement_timeout}`)
  console.log(`    idle_in_transaction_session_timeout = ${settings[0]?.idle_timeout}`)
  console.log(`    ${settings[0]?.version?.split(' ').slice(0, 2).join(' ')}`)

  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000)
  console.log(`\n[2] 창 = ${since.toISOString()} 이후 적재분 (${WINDOW_HOURS}시간)`)

  for (const slug of LEAGUES) {
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) {
      console.log(`  ${slug} — 리그 없음`)
      continue
    }

    const totals = (await prisma.$queryRawUnsafe(`
      select count(*)::int as total,
             count(*) filter (where "ingestedAt" >= '${since.toISOString()}')::int as changed,
             min("ingestedAt") as mn, max("ingestedAt") as mx
      from "Match" where "leagueId" = '${league.id}' and origin = '${MIRROR}'
    `)) as { total: number; changed: number; mn: Date | null; mx: Date | null }[]
    const row = totals[0]
    if (!row) continue

    const ratio = row.total === 0 ? 0 : (row.changed / row.total) * 100
    console.log(
      `  ${slug} — 미러 경기 ${row.total} · 창에 걸림 ${row.changed} (${ratio.toFixed(1)}%)\n` +
        `      적재 시각 ${row.mn?.toISOString()} ~ ${row.mx?.toISOString()}`,
    )

    /* 영향받은 선수 — 증분 2단계의 입력 크기다 */
    const touched = (await prisma.$queryRawUnsafe(`
      select count(distinct s."playerId")::int as n
      from "Match" m join "MatchPlayerStat" s on s."matchId" = m.id
      where m."leagueId" = '${league.id}' and m.origin = '${MIRROR}'
        and m."ingestedAt" >= '${since.toISOString()}'
    `)) as { n: number }[]
    console.log(`      → 영향받은 선수 ${touched[0]?.n}명`)
  }

  /* [3] 문제의 쿼리 실측. supply 에서 가장 경기 많은 선수부터 N명을 골라
     실제 증분이 보내는 것과 **같은 모양**의 쿼리를 시간만 잰다 */
  const supply = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
  if (supply) {
    console.log('\n[3] 증분 2단계 쿼리 실측 — 경기 많은 선수부터 N명')
    const heavy = (await prisma.$queryRawUnsafe(`
      select s."playerId", count(*)::int as games
      from "MatchPlayerStat" s join "Match" m on m.id = s."matchId"
      where m."leagueId" = '${supply.id}' and m.origin = '${MIRROR}'
      group by s."playerId" order by count(*) desc limit 500
    `)) as { playerId: string; games: number }[]
    console.log(`    최다 경기 선수 ${heavy[0]?.games} · 상위 500명 합계 ${heavy.reduce((a, b) => a + b.games, 0)}행`)

    for (const size of [100, 500]) {
      const ids = heavy.slice(0, size).map((r) => r.playerId)
      const started = Date.now()
      try {
        const rows = await prisma.matchPlayerStat.findMany({
          where: {
            playerId: { in: ids },
            match: { leagueId: supply.id, origin: MIRROR },
          },
          select: {
            playerId: true,
            side: true,
            kill: true,
            death: true,
            assist: true,
            headshot: true,
            sourceRating: true,
            matchTimeClanSlug: true,
            match: { select: { id: true, startAt: true, winnerSide: true } },
          },
        })
        console.log(`    배치 ${size}명 → ${rows.length}행 · ${((Date.now() - started) / 1000).toFixed(1)}초`)
      } catch (error) {
        console.log(
          `    배치 ${size}명 → **실패** ${((Date.now() - started) / 1000).toFixed(1)}초 후: ` +
            String((error as Error).message).split('\n')[0],
        )
      }
    }
  }

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
