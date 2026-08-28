/**
 * 선수 **신원 표시** — 현재 닉네임 · 소속 클랜 · 클랜 마크 (D-162).
 *
 * ── 왜 이 테스트가 있나
 *   사용자가 운영 화면에서 두 가지를 지적했다.
 *     1. 선수 이름이 **옛 닉네임**이라 다른 사람처럼 보였다 (`huwho` 가 `후후시치` 로)
 *     2. 클랜 소속 선수인데 `소속 없음` 이고 마크가 우리 fallback 이었다
 *   원인은 프로필 수집이 `origin='3rd.supply'` 만 대상으로 잡아
 *   넥슨 경로로 만들어진 행(`OBS-`)을 통째로 건너뛴 것이었다.
 *
 *   화면 컴포넌트(`ProfileHeader` · `LeagueRecordHeader`)는 원래부터 `ClanMark` 를
 *   그리고 있었다. **비어 있던 것은 데이터뿐이다.** 그래서 여기서 보는 것은
 *   "조회가 마크까지 실어 보내는가" 다.
 *
 * ── 마크가 실리는 조건
 *   `toClanSummary` 는 `sourceClanId` 가 있는 클랜만 실제 마크를 내보낸다 (D-146).
 *   프로필에서 만든 클랜은 원본 클랜 id 를 그대로 넣으므로 조건을 만족한다.
 *   그 연결이 끊기면 화면이 조용히 fallback 마크로 돌아간다 — 그게 지적받은 상태다.
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { LeaguePlayerDetail } from '@sacloud/contract'
import { getLeaguePlayerDetail } from '../lib/server/queries/records'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

describe.runIf(up)('선수 신원 표시 (D-162)', () => {
  it('소속이 있는 선수는 응답에 클랜명과 **실제 마크**가 함께 실린다', async () => {
    const row = await prisma.leaguePlayer.findFirst({
      where: {
        player: {
          origin: { not: 'mock' },
          clan: { sourceClanId: { not: null }, markBgUrl: { not: null } },
        },
      },
      select: {
        playerId: true,
        league: { select: { slug: true } },
        player: { select: { clan: { select: { name: true } } } },
      },
    })
    if (!row) return

    const detail = await getLeaguePlayerDetail(row.league.slug, row.playerId)
    expect(detail).not.toBeNull()
    const parsed = LeaguePlayerDetail.parse(detail)

    /* 소속 자체가 붙어 있어야 한다. 예전에는 여기가 통째로 null 이라 `없음` 이 떴다 */
    expect(parsed.clan).not.toBeNull()
    /* 그리고 **우리 fallback 이 아니라** 그 클랜의 마크여야 한다 (사용자 지적사항) */
    expect(parsed.clan?.is_official_clan).toBe(true)
    expect(parsed.clan?.mark.bg).toBeTruthy()
  })

  it('넥슨 경로로 만들어진 행(OBS-)도 원본 닉네임을 쓴다', async () => {
    /* 이 행들이 통째로 빠져서 옛 닉네임이 남아 있었다.
       `sourcePlayerId` 가 있으면 출처와 무관하게 프로필 적재 대상이다 */
    const stale = await prisma.player.count({
      where: { id: { startsWith: 'OBS-' }, sourcePlayerId: { not: null }, renewedAt: null },
    })
    /* `renewedAt` 은 프로필 응답이 100% 주는 값이다.
       비어 있으면 그 행은 프로필을 한 번도 못 받은 것이다 */
    expect(stale).toBe(0)
  })
})
