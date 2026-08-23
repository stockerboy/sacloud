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
    /* ── 안전장치 (D-116) ──────────────────────────────────────────────
       이 스크립트는 `supply`가 E2E 발판이던 시절에 쓰였다. 지금 `supply`는
       **공개 Beta 운영 리그**이고 실제 수집 경기가 들어 있다.
       실수집 경기가 하나라도 있으면 지우지 않고 멈춘다.
       지워야 한다면 사람이 이 검사를 보고 판단해야 한다. */
    const collected = await prisma.match.count({
      where: { leagueId: league.id, origin: { not: 'mock' } },
    })
    if (collected > 0) {
      console.error(
        `중단: supply 리그에 실수집 경기 ${collected}건이 있다. ` +
          '이 스크립트는 실운영 데이터를 지우지 않는다.',
      )
      console.error('정말 지워야 한다면 백업 후 수동으로 진행해라.')
      await prisma.$disconnect()
      process.exitCode = 1
      return
    }

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
