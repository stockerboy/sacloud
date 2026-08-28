/**
 * 선수 `포지션` 이 API 응답까지 실제로 나온다 (D-161).
 *
 * ── 왜 이 테스트가 있나
 *   이 줄은 한 번 **잘못 지워졌다** (`docs/UI_PARITY_AUDIT.md` 6-2 정정 박스).
 *   계약과 화면만 고쳐 두면 조회에서 컬럼을 안 읽어 조용히 `null` 이 될 수 있다 —
 *   그러면 겉보기에는 "원본에도 대부분 없는 값" 과 구분되지 않는다.
 *   그래서 **DB 에 값이 있는 선수를 찾아** 그 값이 응답까지 오는지 본다.
 *
 * ── 데이터가 없으면 건너뛴다
 *   `position` 은 선수가 직접 설정하는 값이라 21,107명 중 1,185명(5.6%)만 가진다.
 *   그중 우리가 표기를 아는 코드는 하나뿐이라 실제로 채워지는 선수는 더 적다.
 *   적재 전 작업공간에서는 한 명도 없을 수 있다. 그때 **실패로 만들지 않는다** —
 *   이 테스트는 배선을 보는 것이지 적재 여부를 보는 것이 아니다.
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

describe.runIf(up)('선수 포지션 (D-161)', () => {
  it('DB 에 값이 있으면 응답 player.position 으로 나온다', async () => {
    const row = await prisma.leaguePlayer.findFirst({
      where: { player: { position: { not: null }, origin: '3rd.supply' } },
      select: {
        playerId: true,
        player: { select: { position: true } },
        league: { select: { slug: true } },
      },
    })
    if (!row) {
      /* 아직 적재 전이다. 지어낸 데이터로 통과시키지 않는다 */
      expect(row).toBeNull()
      return
    }

    const detail = await getLeaguePlayerDetail(row.league.slug, row.playerId)
    expect(detail).not.toBeNull()
    /* 계약을 통과해야 화면이 읽는다 */
    const parsed = LeaguePlayerDetail.parse(detail)
    expect(parsed.player.position).toBe(row.player.position)
    /* 코드를 그대로 흘려보내지 않는다 — 화면에 `3` 이 뜨면 안 된다 */
    expect(parsed.player.position).not.toMatch(/^\d+$/)
  })

  it('값이 없는 선수는 null 이다 — `-` 나 `알수없음` 으로 채우지 않는다', async () => {
    const row = await prisma.leaguePlayer.findFirst({
      where: { player: { position: null, origin: '3rd.supply' } },
      select: { playerId: true, league: { select: { slug: true } } },
    })
    if (!row) return

    const detail = await getLeaguePlayerDetail(row.league.slug, row.playerId)
    expect(detail).not.toBeNull()
    const parsed = LeaguePlayerDetail.parse(detail)
    expect(parsed.player.position).toBeNull()
  })
})
