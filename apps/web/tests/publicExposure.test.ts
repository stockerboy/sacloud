/**
 * 가오픈 노출 회귀 테스트 (D-147).
 *
 * 개발용 fixture 가 실제 사용자 화면에 새어 나가지 않는지 고정한다.
 *
 * 실제로 났던 문제 —
 *   리그 목록의 대표 클랜 미리보기가 `_count` 와 **다른 조건**으로 조회돼,
 *   비활성 처리된 개발용 클랜(`real-` 접두)이 공개 리그 목록에 그대로 나왔다.
 *   개수는 44라고 하면서 목록에는 비활성 클랜이 보였다.
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { listLeagues } from '../lib/server/queries/leagues'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
const up = await dbUp()

describe.skipIf(!up)('공개 노출 범위', () => {
  it('리그 목록의 대표 클랜에 비활성 클랜이 들어가지 않는다', async () => {
    const page = await listLeagues(null, 20)
    const shown = page.items.flatMap((league) => league.clans.map((clan) => clan.slug))
    if (shown.length === 0) return

    const inactive = await prisma.clan.findMany({
      where: { active: false },
      select: { slug: true },
    })
    for (const clan of inactive) {
      expect(shown, `비활성 클랜 ${clan.slug} 가 노출됐다`).not.toContain(clan.slug)
    }
  })

  it('대표 클랜은 개수(clan_count)가 세는 집합에서만 나온다', async () => {
    const page = await listLeagues(null, 20)
    for (const league of page.items) {
      const activeCount = await prisma.leagueClan.count({
        where: { leagueId: league.id, clan: { active: true } },
      })
      expect(league.clan_count).toBe(activeCount)
      // 보여 주는 것은 세는 것의 부분집합이어야 한다
      expect(league.clans.length).toBeLessThanOrEqual(activeCount)
    }
  })

  it('개발용 시드 리그(origin=mock)는 공개 목록에 없다', async () => {
    const page = await listLeagues(null, 50)
    const mockLeagues = await prisma.league.findMany({
      where: { origin: 'mock' },
      select: { slug: true },
    })
    const shown = page.items.map((league) => league.slug)
    for (const league of mockLeagues) {
      expect(shown, `시드 리그 ${league.slug} 가 노출됐다`).not.toContain(league.slug)
    }
  })
})
