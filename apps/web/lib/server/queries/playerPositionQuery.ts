/**
 * 좌표로 판정한 **포지션** 을 읽는다 (D-199).
 *
 * 판정 자체는 `apps/worker` 의 `position-build` 가 하고 `PlayerPositionProfile` 에 담는다.
 * 여기서는 읽기만 한다.
 *
 * 판정이 없는 선수는 `null` 이다. **비어 있는 것을 채우지 않는다** (D-106) —
 * 지금 판정이 있는 선수는 517명뿐이고, 나머지는 배틀로그 좌표가 없어서 못 정한다.
 */
import { prisma } from '@sacloud/db'
import { POSITION_CLASSIFIER_VERSION } from '@sacloud/nexon'

export async function playerJudgedPosition(playerId: string): Promise<string | null> {
  const row = await prisma.playerPositionProfile.findFirst({
    /* 판정 규칙 버전을 **반드시 건다.** 규칙이 바뀌면 옛 줄이 남으므로,
       필터가 없으면 DB 반환 순서에 따라 아무 쪽이나 이긴다 */
    where: { playerId, classifierVersion: POSITION_CLASSIFIER_VERSION },
    select: { position: true },
  })
  return row?.position ?? null
}
