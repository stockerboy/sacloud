/**
 * ★IPL 의 인정 맵 표를 채운다★ (2026-09-05 · Part 3 ④단계).
 *
 * ── 왜
 *   `nolink` 의 `LeagueMap` 이 ★0행★ 이었다. 옛 투영은 코드에 `'제3보급창고'` 를 박아 뒀기
 *   때문에 표가 없어도 돌았다. ★새 통합 투영은 표를 본다★ — 표가 비면 안 거른다.
 *   그러면 원문에 섞인 ★듀오 965건 · A보급창고 796건★ 같은 다른 모드가 IPL 로 들어온다.
 *
 * ── 근거
 *   ★IPL 경기 27,244건이 전부 제3보급창고다★ (실측 2026-09-05 · 다른 맵 0건).
 *   ★코드에 박던 것을 데이터로 옮기는 것★ 이지 새 규칙을 만드는 것이 아니다.
 *
 * ⚠ 이것은 ★맵 필터를 코드에 박는 것과 반대★ 다 — 리그가 자기 맵을 갖게 하는 일이다.
 */
import { prisma } from '@sacloud/db'
const confirm = process.argv.includes('--confirm')
const MAP = '제3보급창고'

const league = await prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } })
if (!league) throw new Error('nolink 리그가 없다')
const map = await prisma.gameMap.findUnique({ where: { name: MAP }, select: { id: true } })
if (!map) throw new Error(`맵 ${MAP} 이 없다`)

const before = await prisma.leagueMap.count({ where: { leagueId: league.id } })
const used = await prisma.$queryRawUnsafe<Array<{ name: string; n: number }>>(`
  SELECT g.name, COUNT(*)::int AS n FROM "Match" m
  JOIN "GameMap" g ON g.id=m."mapId" WHERE m."leagueId"=$1 GROUP BY 1 ORDER BY 2 DESC`, league.id)
console.info(`지금 표 ${before}행 · 실제 쓴 맵 ${JSON.stringify(used)}`)

if (used.some((u) => u.name !== MAP)) {
  throw new Error('★IPL 이 다른 맵도 쓴다 — 표를 하나로 정하면 안 된다★')
}
if (!confirm) {
  console.info(`미리보기 — --confirm 을 붙이면 ${MAP} 한 줄을 넣는다`)
} else {
  await prisma.leagueMap.upsert({
    where: { leagueId_mapId: { leagueId: league.id, mapId: map.id } },
    update: {},
    create: { leagueId: league.id, mapId: map.id },
  })
  const after = await prisma.leagueMap.count({ where: { leagueId: league.id } })
  console.info(`★넣었다★ ${before}행 → ${after}행`)
}
await prisma.$disconnect()
