/**
 * **클랜마크가 실제로 그려지는가**를 데이터에서 대조한다 (D-146 · 2026-08-31 확장).
 *
 * 화면은 `isOfficialLeagueClan()` 이 참일 때만 실제 마크를 내보낸다
 * (`apps/web/lib/server/mappers.ts`). 그래서 마크가 안 뜨는 이유는 둘 중 하나다.
 *
 * ```
 * ① 판정이 거짓이다        → 마크 주소가 있어도 화면이 안 읽는다
 * ② 마크 주소가 비어 있다   → 판정이 참이어도 그릴 것이 없다
 * ```
 *
 * 둘을 나눠서 센다. 리그에 **등록된** 클랜만 본다 — 등록되지 않은 클랜은
 * 원래 구름 아이콘이 맞다.
 *
 * ```
 * node scripts/prod-run.mjs clan-mark-audit
 * ```
 */
import { prisma } from '@sacloud/db'

/** 화면(`mappers.ts`)의 판정을 그대로 옮긴 것. 바뀌면 여기도 같이 고친다 */
const official = (c: { sourceClanId: string | null; category: string; tier: number | null }) =>
  Boolean(c.sourceClanId) || (c.category === 'independent' && c.tier !== null)

const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true } })

for (const league of leagues) {
  const rows = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: {
      division: true,
      clan: {
        select: {
          slug: true,
          name: true,
          markBgUrl: true,
          markFrontUrl: true,
          sourceClanId: true,
          category: true,
          tier: true,
        },
      },
    },
  })
  const notOfficial = rows.filter((r) => !official(r.clan))
  const noMark = rows.filter((r) => official(r.clan) && !r.clan.markBgUrl && !r.clan.markFrontUrl)
  console.info(
    `\n[${league.slug}] ${league.name} — 등록 ${rows.length}곳 / 판정거짓 ${notOfficial.length} / 마크없음 ${noMark.length}`,
  )
  for (const r of notOfficial) {
    console.info(
      `  ✗판정 ${r.clan.name} (${r.clan.slug}) category=${r.clan.category} tier=${r.clan.tier} source=${r.clan.sourceClanId ? 'O' : 'X'}`,
    )
  }
  for (const r of noMark) {
    console.info(`  ✗마크 ${r.clan.name} (${r.clan.slug})`)
  }
}
await prisma.$disconnect()
