import { prisma } from '@sacloud/db'
import { guardPublic, okPublic } from '@/lib/server/respond'

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
 *
 * ── ⚠ **정정 (2026-09-01 · D-240) — 10초만 붙인다**
 *
 *   위 판단은 «캐시가 걸리면 낡은 값을 본다» 를 걱정한 것이다. 그런데 실제로 일어난 일은
 *   그것보다 나빴다 — **이 경로가 500 을 냈다.**
 *
 *   ```
 *   /api/eggs/broken   200 → 500 (20.1초)   2026-09-01 실측, 여러 번
 *   ```
 *
 *   사이트와 수집이 DB 한 대를 다투는 동안(D-240) 캐시가 없는 경로는 **매 요청이 DB 까지 가고**,
 *   DB 가 눌려 있으면 그대로 죽는다. **낡은 목록보다 죽은 목록이 나쁘다** —
 *   500 이 나면 화면은 「깨진 알이 하나도 없다」로 그린다. 걱정하던 오해가 **더 크게** 난다.
 *
 *   그래서 **10초**만 붙인다. 알을 깬 사람이 10초 안에 되돌아오는 일은 드물고,
 *   `stale-while-revalidate` 덕에 DB 가 죽어 있어도 **마지막으로 성공한 목록**을 계속 내준다.
 *   D-222 ⑤ 의 「캐시 금지」는 이 값으로 **완화된다.** 다시 0 으로 돌리려면
 *   DB 가 요청을 안정적으로 받는 상태여야 한다.
 */
export const dynamic = 'force-dynamic'

/** 깨진 직후를 가리지 않을 만큼만. 값의 근거는 위 「⚠ 정정」에 있다 */
const EGG_CACHE_SECONDS = 10

export async function GET() {
  return guardPublic('/api/eggs/broken', 600, async () => {
    const rows = await prisma.eggBreak.findMany({
      select: { targetKind: true, targetId: true },
    })

    const players: string[] = []
    const clans: string[] = []
    for (const row of rows) {
      if (row.targetKind === 'player') players.push(row.targetId)
      else if (row.targetKind === 'clan') clans.push(row.targetId)
    }

    return okPublic({ players, clans }, undefined, EGG_CACHE_SECONDS)
  })
}
