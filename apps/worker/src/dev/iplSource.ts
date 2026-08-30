/**
 * IPL 기록을 어디서 가져올 수 있는가 — **이미 우리 DB 에 있는 몫**을 센다 (읽기 전용).
 *
 * 사용자 지시: 2026-04-01 ~ 오늘 기록 전부. 방식은 DPL 과 같다.
 * 그런데 39곳 중 28곳은 방금 새로 만든 행이라 과거 기록이 붙어 있지 않다.
 * 그래서 **이미 있는 것 / 새로 받아야 하는 것**을 먼저 갈라 본다. 지어내지 않기 위해서다.
 */
import { prisma } from '@sacloud/db'

const SINCE = new Date('2026-04-01T00:00:00+09:00')

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: 'nolink' },
    select: { id: true },
  })
  if (!league) return

  const members = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { clanId: true, division: true, clan: { select: { name: true, slug: true, origin: true } } },
  })
  const clanIds = new Set(members.map((m) => m.clanId))
  console.info(`IPL 등록 ${members.length}곳`)
  const byOrigin = new Map<string, number>()
  for (const m of members) byOrigin.set(m.clan.origin, (byOrigin.get(m.clan.origin) ?? 0) + 1)
  console.info(`클랜 출처  ${[...byOrigin.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)

  /* 이 클랜들의 **모든 리그** LeagueClan 행 → 그 행이 뛴 경기 */
  const lcs = await prisma.leagueClan.findMany({
    where: { clanId: { in: [...clanIds] } },
    select: { id: true, clanId: true, league: { select: { slug: true } } },
  })
  const clanOfLc = new Map(lcs.map((l) => [l.id, l.clanId]))

  const matches = await prisma.match.findMany({
    where: {
      startAt: { gte: SINCE },
      OR: [
        { redLeagueClanId: { in: [...clanOfLc.keys()] } },
        { blueLeagueClanId: { in: [...clanOfLc.keys()] } },
      ],
    },
    select: {
      id: true,
      startAt: true,
      origin: true,
      sourceMatchId: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
      league: { select: { slug: true } },
    },
  })

  let both = 0
  let one = 0
  const byLeague = new Map<string, number>()
  for (const m of matches) {
    const red = clanOfLc.get(m.redLeagueClanId)
    const blue = clanOfLc.get(m.blueLeagueClanId)
    const n = (red && clanIds.has(red) ? 1 : 0) + (blue && clanIds.has(blue) ? 1 : 0)
    if (n === 2) {
      both += 1
      byLeague.set(m.league.slug, (byLeague.get(m.league.slug) ?? 0) + 1)
    } else if (n === 1) one += 1
  }

  console.info(`\n2026-04-01 이후 · IPL 클랜이 낀 경기 ${matches.length}건`)
  console.info(`  양쪽 다 IPL 등록 클랜 : ${both}건   ← IPL 기록 후보`)
  console.info(`  한쪽만 IPL 등록 클랜   : ${one}건   ← IPL 경기가 아니다`)
  console.info(`  양쪽 다인 경기의 원소속 리그: ${JSON.stringify(Object.fromEntries(byLeague))}`)

  /* 등록 클랜별로 "우리 DB 에 과거가 있는가" */
  const withHistory = new Set<string>()
  for (const m of matches) {
    for (const lcId of [m.redLeagueClanId, m.blueLeagueClanId]) {
      const cid = clanOfLc.get(lcId)
      if (cid && clanIds.has(cid)) withHistory.add(cid)
    }
  }
  console.info(`\n과거 기록이 하나라도 있는 IPL 클랜 ${withHistory.size} / ${members.length}`)
  const none = members.filter((m) => !withHistory.has(m.clanId))
  console.info(`기록이 전혀 없는 클랜 ${none.length}곳:`)
  console.info('  ' + none.map((m) => m.clan.name).join(', '))
}

main()
  .catch((e) => console.error(String(e).slice(0, 600)))
  .finally(() => prisma.$disconnect())
