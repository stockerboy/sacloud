/**
 * 실데이터 E2E 정리 (Phase 10).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/e2eTeardown.ts
 *
 * `e2eSetup.ts`가 만든 것만 지운다. **수집한 넥슨 원본·스테이징은 건드리지 않는다.**
 * mock 시드도 건드리지 않는다.
 *
 * 왜 필요한가
 *   `pnpm compare`는 "DB에 mock 시드만 있다"는 전제로 mock↔live를 대조한다.
 *   실운영 리그가 하나라도 있으면 리그 개수가 달라져 대조가 깨진다.
 *   그 대조를 확인할 때만 잠깐 정리하고, 다시 `e2eSetup.ts`를 돌리면 된다.
 */
import { prisma } from '@sacloud/db'

const LEAGUE_SLUG = 'supply'

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
    select: { id: true },
  })

  if (league) {
    // League → LeagueClan · LeagueRosterMembership · Season · Match 는 cascade로 지워진다
    await prisma.match.deleteMany({ where: { leagueId: league.id } })
    await prisma.league.delete({ where: { id: league.id } })
    console.info('실운영 리그(supply) 정리 완료')
  }

  const identities = await prisma.nexonIdentity.deleteMany({ where: { ouid: { startsWith: 'E2E-OUID-' } } })
  const players = await prisma.player.deleteMany({ where: { id: { startsWith: 'E2E-' } } })
  const clans = await prisma.clan.deleteMany({ where: { slug: { startsWith: 'real-' } } })
  const testClans = await prisma.clan.deleteMany({ where: { slug: { startsWith: 'admin-test-clan' } } })

  // 상세 참가자의 해석 결과도 되돌린다 (원본 응답은 그대로 둔다)
  await prisma.nexonMatchParticipant.updateMany({
    where: { resolvedPlayerId: { startsWith: 'E2E-' } },
    data: { resolvedPlayerId: null, resolutionStatus: 'unresolved' },
  })
  await prisma.nexonMatch.updateMany({
    where: { sourceMatchId: { not: '' }, projectionStatus: 'projected' },
    data: { projectionStatus: 'pending', projectedMatchId: null, projectedAt: null },
  })

  console.info(
    `신원 ${identities.count} · 선수 ${players.count} · 클랜 ${clans.count + testClans.count} 정리`,
  )
  console.info('넥슨 원본·스테이징·mock 시드는 그대로 남아 있다')
}

main()
  .catch((error: unknown) => console.error(error))
  .finally(() => prisma.$disconnect())
