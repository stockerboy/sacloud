/**
 * 로컬에서 투영한 **IPL 경기**를 운영에 밀어 넣는다 (D-219 후속).
 *
 * ```
 * node scripts/prod-run.mjs ipl-project-push              # 미리보기
 * node scripts/prod-run.mjs ipl-project-push --confirm    # 실제 저장
 * ```
 *
 * ── 옮겨 온 것은 **안정된 키뿐이다**
 *   `sourceMatchId` · 클랜 slug · 시작시각 · 승자. `id` 는 두 DB 가 다르므로 안 옮긴다.
 *   부리그(division)와 맵 id 는 **이 DB 에서 다시 읽는다** — 옮기면 운영 등록과 어긋난다.
 *
 * ── 못 잇는 것은 **건너뛴다.** 추측하지 않는다
 *   · 클랜 slug 가 이 DB 의 IPL 등록 클랜에 없으면 건너뛴다
 *   · 양쪽이 같은 클랜이면 건너뛴다 (있을 수 없는 경기다)
 *
 * 멱등이다 — `(leagueId, origin, sourceMatchId)` 로 upsert 한다. 다시 돌려도 늘지 않는다.
 */
import { readFileSync } from 'node:fs'
import { prisma, type Prisma } from '@sacloud/db'
import { allocateInternalMatchId } from '../lib/internalMatchId.js'

const IPL_SLUG = 'nolink'
const ORIGIN = 'nexon_barracks'
const MAP_NAME = '제3보급창고'

const fileIndex = process.argv.indexOf('--file')
const file = (fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined) ?? 'ipl-project-export.json'
const confirm = process.argv.includes('--confirm')
/** 이미 있는 행까지 덮어쓴다. 기본은 건너뛴다 */
const forceUpdate = process.argv.includes('--force-update')

interface Row {
  sourceMatchId: string
  startAt: string
  winnerSide: string
  playerCount: number
  redClanSlug: string
  blueClanSlug: string
  redClanName?: string
  blueClanName?: string
}

const input = JSON.parse(readFileSync(file, 'utf8')) as { matches: Row[]; count?: number }
const rows = input.matches ?? []

const league = await prisma.league.findUnique({ where: { slug: IPL_SLUG }, select: { id: true } })
if (!league) throw new Error(`리그 ${IPL_SLUG} 이 없다`)

const map = await prisma.gameMap.findFirst({ where: { name: MAP_NAME }, select: { id: true } })
if (!map) throw new Error(`맵 "${MAP_NAME}" 이 없다`)

/** 이 DB 의 IPL 등록 클랜: clan slug -> LeagueClan */
const regs = await prisma.leagueClan.findMany({
  where: { leagueId: league.id },
  select: { id: true, division: true, clan: { select: { slug: true, name: true } } },
})
const bySlug = new Map(regs.map((r) => [r.clan.slug, { id: r.id, division: r.division }]))

/*
  이름 대체 열쇠.

  slug 는 두 DB 가 다를 수 있다 — 로컬에서 만든 클랜은 `ipl-<병영수첩slug>` 꼴이고
  운영에는 다른 slug 로 들어가 있다. 실측(2026-08-31): `ipl-4473`(evermore) ·
  `ipl-ckdals2457`(hardcores) 때문에 2,366건이 막혔다.
  이름이 겹치면 **버린다** — 어느 쪽인지 모르는 채로 잇지 않는다.
*/
const nameCount = new Map<string, number>()
for (const r of regs) nameCount.set(r.clan.name, (nameCount.get(r.clan.name) ?? 0) + 1)
const byName = new Map<string, { id: string; division: number }>()
for (const r of regs) {
  if ((nameCount.get(r.clan.name) ?? 0) === 1) {
    byName.set(r.clan.name, { id: r.id, division: r.division })
  }
}

const resolve = (slug: string, name?: string) => bySlug.get(slug) ?? (name ? byName.get(name) : undefined) ?? null

/*
  이미 있는 경기를 **한 번에** 읽는다.

  처음에는 행마다 `findUnique` 를 했다. 운영은 원격이라 왕복이 2만 번이 되고
  미리보기만 10분을 넘겼다. 키를 한 번에 받아 메모리에서 맞춘다.
*/
const existingRows = await prisma.match.findMany({
  where: { leagueId: league.id, origin: ORIGIN },
  select: { id: true, sourceMatchId: true },
})
const existingBySource = new Map(
  existingRows.filter((r) => r.sourceMatchId).map((r) => [r.sourceMatchId!, r.id]),
)
console.info(`운영에 이미 있는 IPL 경기 ${existingBySource.size.toLocaleString()}건`)

const result = {
  input: rows.length,
  created: 0,
  updated: 0,
  skippedExisting: 0,
  unknownClan: 0,
  sameClan: 0,
}
const missing = new Map<string, number>()

/** 한 번에 넣을 개수. 너무 크면 한 덩어리가 실패했을 때 되돌리기 어렵다 */
const INSERT_CHUNK = 500
const pending: Prisma.MatchCreateManyInput[] = []
/** 이번 실행에서 이미 쓴 id — 아직 DB 에 없어서 조회로는 안 걸린다 */
const usedIds = new Set<string>()

async function flush() {
  if (!pending.length) return
  await prisma.match.createMany({ data: pending, skipDuplicates: true })
  console.info(`  ... ${result.created.toLocaleString()}건 넣었다`)
  pending.length = 0
}

for (const row of rows) {
  const red = resolve(row.redClanSlug, row.redClanName)
  const blue = resolve(row.blueClanSlug, row.blueClanName)
  if (!red || !blue) {
    result.unknownClan += 1
    for (const [s, n] of [
      [row.redClanSlug, row.redClanName],
      [row.blueClanSlug, row.blueClanName],
    ] as const) {
      if (!resolve(s, n)) missing.set(`${s} (${n ?? '이름없음'})`, (missing.get(`${s} (${n ?? '이름없음'})`) ?? 0) + 1)
    }
    continue
  }
  if (red.id === blue.id) {
    result.sameClan += 1
    continue
  }

  const startAt = new Date(row.startAt)

  const existingId = existingBySource.get(row.sourceMatchId) ?? null

  if (!confirm) {
    if (existingId) result.skippedExisting += 1
    else result.created += 1
    continue
  }

  const matchId =
    existingId ??
    (await allocateInternalMatchId(startAt, async (candidate) => {
      if (usedIds.has(candidate)) return true
      const found = await prisma.match.findUnique({ where: { id: candidate }, select: { id: true } })
      return found !== null
    }))
  usedIds.add(matchId)

  const data = {
    leagueId: league.id,
    mapId: map.id,
    playerCount: row.playerCount,
    startAt,
    endAt: null,
    playTime: null,
    blueFirst: null,
    winnerSide: row.winnerSide,
    mvpPlayerId: null,
    redLeagueClanId: red.id,
    blueLeagueClanId: blue.id,
    /* 부리그는 **이 DB 의 등록값**을 쓴다. 로컬 값을 옮기면 운영 등록과 어긋난다 */
    redDivisionAtMatch: red.division,
    blueDivisionAtMatch: blue.division,
    origin: ORIGIN,
    sourceMatchId: row.sourceMatchId,
  }

  if (existingId) {
    /*
      이미 있는 행은 **건드리지 않는다.**
      옮기는 값이 원본에서 바뀌지 않으므로 다시 쓸 이유가 없고, 재실행할 때마다
      2만 건을 원격으로 UPDATE 하느라 잡이 타임아웃으로 죽었다 (2026-08-31).
      값을 강제로 덮어야 하면 `--force-update` 를 준다.
    */
    if (forceUpdate) {
      await prisma.match.update({ where: { id: matchId }, data })
      result.updated += 1
    } else {
      result.skippedExisting += 1
    }
  } else {
    /*
      **일괄로 모았다가 한 번에 넣는다.**
      한 건씩 upsert 하니 원격 왕복이 2만 번이라 3시간짜리가 됐다 (2026-08-31 실측:
      20분에 2,582건). 신규는 묶어 넣고, 이미 있는 것만 한 건씩 고친다.
    */
    pending.push({ id: matchId, ...data })
    result.created += 1
    if (pending.length >= INSERT_CHUNK) await flush()
  }
}
await flush()

console.info(
  `${confirm ? '반영' : '미리보기'} — 입력 ${result.input.toLocaleString()} · ` +
    `신규 ${result.created.toLocaleString()} · 갱신 ${result.updated.toLocaleString()} · ` +
    `이미있음 ${result.skippedExisting.toLocaleString()} · ` +
    `클랜모름 ${result.unknownClan.toLocaleString()} · 같은클랜 ${result.sameClan}`,
)
if (missing.size) {
  console.info('이 DB 의 IPL 등록에 없는 클랜 slug (많이 나온 순)')
  for (const [slug, n] of [...missing].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.info(`  ${slug} — ${n.toLocaleString()}건`)
  }
}
if (!confirm) console.info('--confirm 없이는 한 줄도 쓰지 않았다')

await prisma.$disconnect()
