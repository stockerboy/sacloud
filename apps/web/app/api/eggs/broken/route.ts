import { prisma } from '@sacloud/db'
import { guard, ok } from '@/lib/server/respond'

/**
 * `GET /api/eggs/broken` — **깨진 알 목록** (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * 화면(`app/_egg/EggBoot.tsx`)이 「어느 알이 깨졌나」를 알 유일한 길이다.
 *
 * ── 왜 공개인가
 *   깨짐 여부는 이미 화면에 보인다 — 마크가 빛나고 지표가 열린다. 감출 것이 아니다.
 *   감출 것은 **근거**다: 관리자가 강제로 깬 것인지 본인 인증으로 깬 것인지는
 *   `reason` 에만 있고 여기서는 내려보내지 않는다 (관리자는 `GET /api/admin/eggs` 로 본다).
 *
 * ── 왜 식별자만 주는가
 *   `brokenAt` 을 주면 「언제 가입했는지」가 새어 나간다. 화면이 필요로 하는 것은
 *   깨졌다/아니다 하나뿐이므로 그것만 준다.
 *
 * ── 캐시
 *   붙이지 않는다. 알을 깬 직후에 화면이 그대로면 사용자는 **안 깨졌다고 읽는다.**
 *   그 한 번의 오해가 이 시스템 전체의 목적을 깎는다. 조회는 인덱스 두 개짜리 스캔이다.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return guard(async () => {
    const rows = await prisma.eggBreak.findMany({
      select: { targetKind: true, targetId: true },
    })

    const players: string[] = []
    const clans: string[] = []
    for (const row of rows) {
      if (row.targetKind === 'player') players.push(row.targetId)
      else if (row.targetKind === 'clan') clans.push(row.targetId)
    }

    return ok({ players, clans })
  })
}
