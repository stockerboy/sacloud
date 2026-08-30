/** 열산에서 IPL 클랜이 실제로 빠졌는가 숫자로 대조 (임시) */
import { prisma } from '@sacloud/db'
async function main(): Promise<void> {
  const san = await prisma.league.findUnique({ where: { slug: 'sanply' }, select: { id: true } })
  const ipl = await prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } })
  if (!san || !ipl) return
  const iplClanIds = (await prisma.leagueClan.findMany({ where: { leagueId: ipl.id }, select: { clanId: true } })).map((r) => r.clanId)

  const total = await prisma.leagueClan.count({ where: { leagueId: san.id } })
  const active = await prisma.leagueClan.count({ where: { leagueId: san.id, expelledAt: null } })
  const iplInSan = await prisma.leagueClan.findMany({
    where: { leagueId: san.id, clanId: { in: iplClanIds } },
    select: { expelledAt: true, clan: { select: { name: true } } },
  })
  console.info(`열산 등록행 ${total} · 그중 살아있는 것 ${active} · 추방 ${total - active}`)
  for (const r of iplInSan) console.info(`  ${r.clan.name} 추방=${r.expelledAt ? 'O' : 'X'}`)

  const lcIds = (await prisma.leagueClan.findMany({ where: { leagueId: san.id, clanId: { in: iplClanIds } }, select: { id: true } })).map((r) => r.id)
  const left = await prisma.match.count({
    where: { leagueId: san.id, redLeagueClanId: { in: lcIds }, blueLeagueClanId: { in: lcIds } },
  })
  console.info(`\n열산에 남은 IPL끼리의 경기 ${left}건  (0 이어야 한다)`)
  const iplMatches = await prisma.match.count({ where: { leagueId: ipl.id } })
  console.info(`IPL 리그 경기 ${iplMatches}건`)
}
main().catch((e) => console.error(String(e).slice(0, 400))).finally(() => prisma.$disconnect())
