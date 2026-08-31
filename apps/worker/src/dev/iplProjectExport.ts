/**
 * 로컬에서 투영한 **IPL 경기**를 운영으로 옮길 파일로 내보낸다 (D-219 후속).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplProjectExport.ts
 * ```
 *
 * ── 왜 원문을 안 올리고 결과만 옮기나
 *   IPL 원문(`BarracksClanMatchRaw`)이 **445MB** 다. 운영으로 올릴 이유가 없다 —
 *   원문은 로컬과 수집 파일에 그대로 보존되고(3-A 1번), 운영이 필요한 것은 **경기**뿐이다.
 *   결과만 옮기는 것은 이 저장소의 기존 방식이다 (`matchFirstSidePush` 와 같은 모양).
 *
 * ── 무엇을 옮기나 — **id 를 옮기지 않는다**
 *   로컬과 운영은 `LeagueClan.id` · `Match.id` 가 다르다. 그래서 **안정된 키만** 옮긴다.
 *   ```
 *   sourceMatchId   넥슨 경기번호 — 두 DB 에서 같다
 *   clan slug       클랜을 가리키는 이름 (두 DB 가 다를 수 있어 이름도 함께 싣는다)
 *   clan name       slug 가 어긋날 때 쓰는 대체 열쇠
 *   startAt · winnerSide · playerCount
 *   ```
 *   부리그(division)는 **운영에서 다시 읽는다.** 로컬 값을 옮기면 운영 등록과 어긋난다.
 */
import { writeFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'

const IPL_SLUG = 'nolink'
const ORIGIN = 'nexon_barracks'

const fileIndex = process.argv.indexOf('--out')
const out = (fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined) ?? 'ipl-project-export.json'

const league = await prisma.league.findUnique({ where: { slug: IPL_SLUG }, select: { id: true } })
if (!league) throw new Error(`리그 ${IPL_SLUG} 이 없다`)

const rows = await prisma.match.findMany({
  where: { leagueId: league.id, origin: ORIGIN },
  select: {
    sourceMatchId: true,
    startAt: true,
    winnerSide: true,
    playerCount: true,
    redClan: { select: { clan: { select: { slug: true, name: true } } } },
    blueClan: { select: { clan: { select: { slug: true, name: true } } } },
  },
  orderBy: { startAt: 'asc' },
})

const matches = rows
  .filter((r) => r.sourceMatchId)
  .map((r) => ({
    sourceMatchId: r.sourceMatchId!,
    startAt: r.startAt.toISOString(),
    winnerSide: r.winnerSide,
    playerCount: r.playerCount,
    redClanSlug: r.redClan.clan.slug,
    blueClanSlug: r.blueClan.clan.slug,
    /* slug 는 두 DB 가 다를 수 있다(로컬에서 만든 `ipl-*`). 이름을 대체 열쇠로 함께 싣는다 */
    redClanName: r.redClan.clan.name,
    blueClanName: r.blueClan.clan.name,
  }))

const payload = {
  origin: ORIGIN,
  leagueSlug: IPL_SLUG,
  exportedAt: new Date().toISOString(),
  count: matches.length,
  matches,
}

writeFileSync(out, JSON.stringify(payload), 'utf8')
console.info(`IPL 경기 ${matches.length.toLocaleString()}건을 ${out} 에 썼다`)
if (rows.length !== matches.length) {
  console.info(`⚠ sourceMatchId 가 없는 행 ${rows.length - matches.length}건은 뺐다`)
}

await prisma.$disconnect()
