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

/**
 * CSP `img-src` 가 여는 호스트.
 *
 * **단일 진실 원천은 `apps/web/next.config.ts` 의 `CLAN_MARK_HOSTS` 다.**
 * `apps/worker` 는 `apps/web` 을 import 하지 않으므로 여기에 옮겨 적는다.
 * 한쪽만 고치면 다시 "DB 엔 있는데 화면엔 없는" 상태가 된다 — **둘을 같이 고친다.**
 * `apps/web/tests/clanMarkCsp.test.ts` 가 web 쪽 목록을 지킨다.
 */
/**
 * ⚠ **정정 (2026-09-01)** — `static.3rd.supply` 를 뺐다. `next.config.ts` 와 **같이** 고쳤다.
 * 근거는 그쪽 주석에 있다 (운영 402곳 치환 완료 · 새 적재도 넥슨 주소 · 읽기 때 한 번 더 거름).
 */
const ALLOWED_MARK_HOSTS = ['https://img.sa.nexon.com']

/** 주소에서 오리진만 꺼낸다. 주소가 깨졌으면 그렇다고 알린다 */
const hostOf = (url: string | null): string | null => {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return '(주소형식오류)'
  }
}

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

  /* ③ 주소는 있는데 CSP 가 막는 것 — 화면에서는 「마크 없음」과 똑같이 보인다 */
  const blocked = rows.filter((r) => {
    if (!official(r.clan)) return false
    const hosts = [hostOf(r.clan.markBgUrl), hostOf(r.clan.markFrontUrl)].filter(
      (h): h is string => h !== null,
    )
    return hosts.length > 0 && hosts.some((h) => !ALLOWED_MARK_HOSTS.includes(h))
  })

  console.info(
    `
[${league.slug}] ${league.name} — 등록 ${rows.length}곳 / 판정거짓 ${notOfficial.length}` +
      ` / 마크없음 ${noMark.length} / CSP차단 ${blocked.length}`,
  )
  for (const r of blocked) {
    console.info(
      `  ✗차단 ${r.clan.name} (${r.clan.slug}) host=${hostOf(r.clan.markBgUrl) ?? hostOf(r.clan.markFrontUrl)}`,
    )
  }
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
