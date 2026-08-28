/**
 * 증분 집계 검증 — **증분 결과와 전수 결과가 같은가**를 체크섬으로 대조한다 (D-162).
 *
 * 이 스크립트가 없으면 "빨라졌다" 만 남고 "맞는가" 가 남지 않는다.
 * 순서는 이렇다.
 *
 *   1. 전수 집계 → 체크섬 A (기준선)
 *   2. 이번 창에 걸리는 선수들의 값을 **일부러 망가뜨린다**
 *   3. 증분 집계 → 체크섬 B.  **A == B 여야 한다**
 *   4. 증분을 두 번 더 돌린다 → 체크섬이 변하지 않아야 한다 (idempotent)
 *
 * 3번이 "증분이 제대로 다시 계산하는가", 4번이 "두 번 더해지지 않는가" 를 본다.
 * **로컬 DB 에서만 돈다.** 운영 DB 를 가리키면 시작하지 않는다.
 */
import { createHash } from 'node:crypto'
import { prisma } from '@sacloud/db'
import { runSupplyRollup } from '../jobs/supplyRollup.js'

const LEAGUES = (process.argv.find((a) => a.startsWith('--league='))?.split('=')[1] ?? 'supply')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
/** 이 시간 안에 적재된 경기를 "새 경기" 로 본다 */
const WINDOW_HOURS = Number(
  process.argv.find((a) => a.startsWith('--window-hours='))?.split('=')[1] ?? 26,
)
const SKIP_FULL = process.argv.includes('--skip-full')
/** 창을 시각으로 직접 준다 (실측용). 주면 `--window-hours` 대신 이것을 쓴다 */
const SINCE_ISO = process.argv.find((a) => a.startsWith('--since='))?.split('=')[1] ?? null

function guardLocal(): void {
  const url = process.env['DATABASE_URL'] ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error('로컬 DB 가 아니다. 이 스크립트는 운영 DB 에서 돌리지 않는다')
  }
}

async function checksum(leagueSlug: string): Promise<{ hash: string; players: number; clans: number }> {
  const league = await prisma.league.findUnique({ where: { slug: leagueSlug }, select: { id: true } })
  if (!league) throw new Error(`리그 없음: ${leagueSlug}`)

  const players = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: {
      playerId: true,
      rating: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      clanId: true,
      placement: true,
    },
    orderBy: { playerId: 'asc' },
  })
  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, rating: true, win: true, lose: true, division: true, placement: true },
    orderBy: { id: 'asc' },
  })
  /* 전역 현재 소속도 집계가 쓴다 (D-160). 같이 본다 */
  const globals = await prisma.player.findMany({
    where: { id: { in: players.map((p) => p.playerId) } },
    select: { id: true, clanId: true },
    orderBy: { id: 'asc' },
  })

  const hash = createHash('md5')
  for (const p of players) {
    hash.update(
      `P|${p.playerId}|${p.rating}|${p.win}|${p.lose}|${p.kill}|${p.death}|${p.assist}|${p.headshot}|${p.clanId}|${p.placement}\n`,
    )
  }
  for (const c of clans) {
    hash.update(`C|${c.id}|${c.rating}|${c.win}|${c.lose}|${c.division}|${c.placement}\n`)
  }
  for (const g of globals) hash.update(`G|${g.id}|${g.clanId}\n`)

  return { hash: hash.digest('hex'), players: players.length, clans: clans.length }
}

/** 이번 창에 걸리는 선수들의 값을 망가뜨린다. 증분이 되살려야 한다 */
async function corrupt(leagueSlug: string, since: Date): Promise<number> {
  const league = await prisma.league.findUnique({ where: { slug: leagueSlug }, select: { id: true } })
  if (!league) return 0
  const changed = await prisma.match.findMany({
    where: { leagueId: league.id, origin: '3rd.supply', ingestedAt: { gte: since } },
    select: { id: true },
  })
  const touched = new Set<string>()
  for (let i = 0; i < changed.length; i += 2000) {
    const rows = await prisma.matchPlayerStat.findMany({
      where: { matchId: { in: changed.slice(i, i + 2000).map((m) => m.id) } },
      select: { playerId: true },
      distinct: ['playerId'],
    })
    for (const r of rows) touched.add(r.playerId)
  }
  const ids = [...touched]
  for (let i = 0; i < ids.length; i += 500) {
    await prisma.leaguePlayer.updateMany({
      where: { leagueId: league.id, playerId: { in: ids.slice(i, i + 500) } },
      /* `toPlayerWriteData` 가 **반드시 쓰는** 칸만 망가뜨린다.
         조건부로 쓰는 칸(kill 등)은 근거가 없으면 보존이 정상이라 대조 대상이 아니다 */
      data: { win: -1, lose: -1, placement: true },
    })
  }
  console.log(`  바뀐 경기 ${changed.length} · 망가뜨린 선수 ${ids.length}`)
  return ids.length
}

async function main() {
  guardLocal()
  const since = SINCE_ISO ? new Date(SINCE_ISO) : new Date(Date.now() - WINDOW_HOURS * 3_600_000)
  /* 창은 **호출 시각 기준**이라 그때그때 다시 잰다.
     한 번 재서 돌려쓰면 전수 집계에 걸린 시간만큼 창이 짧아져, 망가뜨린 선수 일부가
     증분 대상에서 빠진다 — 실제로 그렇게 한 번 FAIL 이 났다 (코드가 아니라 하네스 문제였다) */
  const windowHours = () => (Date.now() - since.getTime()) / 3_600_000
  console.log(`증분 창: ${since.toISOString()} 이후 적재분 (${windowHours().toFixed(2)}시간)`)

  for (const slug of LEAGUES) {
    console.log(`\n======== ${slug} ========`)

    /* 두 갈래가 반드시 값을 넣으므로 초기값을 두지 않는다 (초기값을 두면 아무도 안 읽는다) */
    let full: Awaited<ReturnType<typeof checksum>>
    if (!SKIP_FULL) {
      const t0 = Date.now()
      await runSupplyRollup({ leagueSlug: slug, confirm: true, full: true })
      const fullMs = Date.now() - t0
      full = await checksum(slug)
      console.log(`1) 전수 집계 ${(fullMs / 1000).toFixed(1)}초 · 체크섬 ${full.hash}`)
      console.log(`   LeaguePlayer ${full.players} · LeagueClan ${full.clans}`)
    } else {
      full = await checksum(slug)
      console.log(`1) 전수 생략 — 현재 체크섬 ${full.hash}`)
    }

    console.log('2) 창에 걸리는 선수 값을 망가뜨린다')
    await corrupt(slug, since)
    const broken = await checksum(slug)
    console.log(`   망가진 체크섬 ${broken.hash} (기준선과 ${broken.hash === full.hash ? '같다 — 망가뜨리지 못했다!' : '다르다 ✓'})`)

    const t1 = Date.now()
    await runSupplyRollup({ leagueSlug: slug, confirm: true, since })
    const incMs = Date.now() - t1
    const inc = await checksum(slug)
    console.log(`3) 증분 집계 ${(incMs / 1000).toFixed(1)}초 · 체크섬 ${inc.hash}`)
    console.log(`   전수와 ${inc.hash === full.hash ? '일치 ✓' : '불일치 ✗'}`)

    const t2 = Date.now()
    await runSupplyRollup({ leagueSlug: slug, confirm: true, since })
    const again = await checksum(slug)
    const t3 = Date.now()
    await runSupplyRollup({ leagueSlug: slug, confirm: true, since })
    const third = await checksum(slug)
    console.log(
      `4) 증분 반복 ${((t3 - t2) / 1000).toFixed(1)}초 · ${((Date.now() - t3) / 1000).toFixed(1)}초 — ` +
        `${again.hash === inc.hash && third.hash === inc.hash ? '값이 변하지 않는다 ✓ (idempotent)' : '값이 변했다 ✗'}`,
    )

    console.log(
      `\n판정 [${slug}] 전수=증분 ${inc.hash === full.hash ? 'PASS' : 'FAIL'} · ` +
        `idempotent ${again.hash === inc.hash && third.hash === inc.hash ? 'PASS' : 'FAIL'} · ` +
        `증분 ${(incMs / 1000).toFixed(1)}초`,
    )
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
