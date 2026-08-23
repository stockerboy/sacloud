import { prisma } from '@sacloud/db'
import { publicOriginWhere } from './queries/publicScope'

/**
 * `/infos`가 내려주는 전역 설정.
 *
 * 값의 출처
 * - `BOARD_WRITE_INTERVAL` / `ENTRY_TIME_LIMIT` / `RANK_REFRESH_INTERVAL` 은 **원본 관측값**이다.
 *   Mock 픽스처(`packages/mock/src/dataset.ts`)와 같은 값을 쓴다.
 * - `ENTRY_TIME_LIMIT`의 정확한 용도는 여전히 `[미확인]`이다.
 * - `CURRENT_SEASON`은 DB의 진행 중 시즌에서 읽는다. 상수로 박지 않는다.
 */

/** 글쓰기 rate limit (초). 관측: 5분 */
export const BOARD_WRITE_INTERVAL = 300

/** 관측값. 용도는 [미확인] */
export const ENTRY_TIME_LIMIT = 3600

/** 랭킹 갱신 주기 (초). 관측: 1시간 */
export const RANK_REFRESH_INTERVAL = 3600

/**
 * 현재 시즌 번호.
 *
 * 시즌은 리그마다 따로 진행되지만 `/infos`는 전역 값 하나를 내려준다(Mock과 동일).
 * 진행 중인 시즌 중 가장 큰 번호를 쓴다. 시즌이 하나도 없으면 0.
 */
export async function currentSeasonNumber(): Promise<number> {
  /* 시드 리그의 시즌은 세지 않는다 (D-116).
     예전에는 픽스처 리그 4개의 `Season 8 active`가 이겨서, 실제로는 베타 중인데
     `CURRENT_SEASON=8`이 내려갔고 새로 만든 리그가 시즌 8로 시작했다. */
  const season = await prisma.season.findFirst({
    where: { status: 'active', league: { ...publicOriginWhere() } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  return season?.number ?? 0
}

export async function buildConfigs(): Promise<Record<string, string | number | boolean>> {
  return {
    BOARD_WRITE_INTERVAL,
    ENTRY_TIME_LIMIT,
    RANK_REFRESH_INTERVAL,
    CURRENT_SEASON: await currentSeasonNumber(),
  }
}
