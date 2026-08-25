/** 사용자가 직접 확인할 route 를 실제 데이터에서 뽑는다 (읽기 전용) */
import { prisma } from '@sacloud/db'
const l = await prisma.league.findUniqueOrThrow({ where: { slug: 'supply' }, select: { id: true } })

// 1) 공식 등록 클랜 소속 선수
const official = await prisma.leaguePlayer.findFirst({
  where: { leagueId: l.id, placement: false, clan: { sourceClanId: { not: null } } },
  orderBy: { rating: 'desc' },
  select: { playerId: true, rating: true, player: { select: { name: true } }, clan: { select: { name: true, slug: true, sourceClanId: true } } },
})
console.info('1) 공식 등록 클랜 선수:', official?.player.name, '| 클랜', official?.clan?.name, '| 래더', official?.rating)
console.info('   /league/supply/player/' + official?.playerId)

// 2) 외부/미등록 (clan 이 없거나 sourceClanId 없음)
const outside = await prisma.leaguePlayer.findFirst({
  where: { leagueId: l.id, placement: false, OR: [{ clanId: null }, { clan: { sourceClanId: null } }] },
  orderBy: { rating: 'desc' },
  select: { playerId: true, rating: true, player: { select: { name: true } }, clan: { select: { name: true, sourceClanId: true } } },
})
console.info('2) 외부/미등록 선수:', outside?.player.name, '| 클랜', outside?.clan?.name ?? '(없음)', '| 래더', outside?.rating)
console.info('   /league/supply/player/' + outside?.playerId)

// 3) 이적 이력이 있는 선수 (로스터 2건 이상)
const memberships = await prisma.leagueRosterMembership.findMany({
  where: { leagueId: l.id }, select: { playerId: true },
})
const counts = new Map<string, number>()
for (const m of memberships) counts.set(m.playerId, (counts.get(m.playerId) ?? 0) + 1)
const moved = [...counts.entries()].filter(([, n]) => n > 1).map(([playerId, n]) => ({ playerId, _count: n }))
for (const m of moved.slice(0, 1)) {
  const p = await prisma.player.findUnique({ where: { id: m.playerId }, select: { name: true } })
  console.info('3) 이적 이력 선수:', p?.name, '(소속 이력', m._count, '건)')
  console.info('   /league/supply/player/' + m.playerId)
}
if (moved.length === 0) console.info('3) 이적 이력 선수: 없음 (Beta 기간이 짧다)')

// 4) 래더 반영된 경기 (클랜 상세에서 펼칠 것)
const rated = await prisma.match.findFirst({
  where: { leagueId: l.id, stats: { some: { formulaVersion: 'sacloud-d145' } } },
  orderBy: { startAt: 'desc' },
  select: { id: true, official: true, redLeagueClanId: true, blueLeagueClanId: true },
})
const rc = rated ? await prisma.leagueClan.findUnique({ where: { id: rated.redLeagueClanId }, select: { clan: { select: { slug: true, name: true, sourceClanId: true } } } }) : null
console.info('4) 래더 반영 경기:', rated?.id, '| official', rated?.official, '| 레드클랜', rc?.clan.name, rc?.clan.slug)
console.info('   /league/supply/clan/' + rc?.clan.slug + '  (기록실에서 이 경기 펼치기)')

// 5) 무기 기록이 있는 선수
const ws = await prisma.leaguePlayerWeaponStat.findFirst({
  where: { leaguePlayer: { leagueId: l.id } },
  select: { weapon: true, win: true, lose: true, leaguePlayer: { select: { playerId: true, player: { select: { name: true } } } } },
})
console.info('5) 무기 기록 있는 선수:', ws?.leaguePlayer.player.name, '| weapon', ws?.weapon, `${ws?.win}승${ws?.lose}패`)
console.info('   /league/supply/player/' + ws?.leaguePlayer.playerId)
await prisma.$disconnect()
