/**
 * 병영수첩 주소를 붙여 넣으면 **정말 그 선수가 나오는가** — 읽기 전용 대조 (D-254).
 * `apps/web/lib/server/queries/search.ts` 의 `findPlayerByName` 을 그대로 다시 밟는다.
 * **아무것도 쓰지 않는다.**
 */
import { prisma } from '@sacloud/db'
import {
  barracksUsnOf,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
  playerRefsFromBarracksUrl,
} from '@sacloud/contract'

const w = { origin: { not: 'mock' } }
const ci = (v: string) => ({ equals: v, mode: 'insensitive' as const })

/* ── 로그가 아니라 DB 를 센다 (CLAUDE.md 3-A 6번) ───────────────────────── */
const rows = await prisma.playerPositionProfile.findMany({ select: { userNexonSn: true, playerId: true } })
const usnRows = rows.filter((r) => /^[0-9A-Fa-f]{16}SA$/.test(r.userNexonSn))
console.info('── 운영 PlayerPositionProfile')
console.info(`총 행 ${rows.length} · str_usn 형태 ${usnRows.length} · playerId 이어진 고유 ${new Set(usnRows.filter((r) => r.playerId).map((r) => r.userNexonSn)).size}`)
console.info(`PlayerRoundProfile 총 행 ${await prisma.playerRoundProfile.count()}`)
console.info(`공개 선수 ${await prisma.player.count({ where: w })}`)

async function playerByUsn(usn: string) {
  const id =
    (await prisma.nexonIdentity.findFirst({ where: { barracksUsn: usn, playerId: { not: null } }, select: { playerId: true } }))?.playerId ??
    (await prisma.playerPositionProfile.findFirst({ where: { userNexonSn: ci(usn), playerId: { not: null } }, orderBy: [{ computedAt: 'desc' }], select: { playerId: true } }))?.playerId
  return id ? prisma.player.findFirst({ where: { id, ...w }, select: { id: true, name: true } }) : null
}

async function findPlayerByName(input: string) {
  const k = normalizePastedQuery(input)
  if (!k) return null
  if (isBarracksUrl(k)) {
    for (const ref of playerRefsFromBarracksUrl(k)) {
      if (ref.kind === 'usn') {
        const f = await playerByUsn(ref.value)
        if (f) return f
        continue
      }
      if (ref.kind === 'nickname') {
        const f = await prisma.player.findFirst({ where: { name: ci(ref.value), ...w }, orderBy: [{ id: 'asc' }], select: { id: true, name: true } })
        if (f) return f
      }
    }
  }
  const byName = await prisma.player.findFirst({ where: { name: ci(k), ...w }, orderBy: [{ id: 'asc' }], select: { id: true, name: true } })
  if (byName) return byName
  const usn = barracksUsnOf(k)
  return usn ? playerByUsn(usn) : null
}

console.info('')
console.info('── 선수 (★ 가 사용자 주소)')
for (const input of [
  '★ https://barracks.sa.nexon.com/D9EBC75CCBD60C12SA/match',
  'https://barracks.sa.nexon.com/BE60BA2EA16C2A94SA/match',
  'https://barracks.sa.nexon.com/BE670A90968922B5SA/match',
  'https://barracks.sa.nexon.com/C348189581244C65SA/match',
  'https://barracks.sa.nexon.com/5680A2E6F8308820SA/match',
  'barracks.sa.nexon.com/FBD6DA3C1C1526C4SA/match',
  '  https://barracks.sa.nexon.com/0316133F90948FC6SA/match  ',
  'D596137C144C183CSA',
  'd596137c144c183csa',
  'https://barracks.sa.nexon.com/record/huwho',
  ' huwho ',
]) {
  const url = input.replace(/^★ /, '')
  const f = await findPlayerByName(url)
  console.info(`${f ? '✓' : '✗'} ${input} → ${f ? `${f.id} (${f.name})` : '없음'}`)
}

console.info('')
console.info('── 클랜')
for (const input of ['https://barracks.sa.nexon.com/clan/ddorr/clanMatch', 'barracks.sa.nexon.com/clan/uava01']) {
  const slug = clanSlugFromBarracksUrl(normalizePastedQuery(input))
  const c = slug ? await prisma.clan.findFirst({ where: { slug: ci(slug), ...w }, select: { slug: true, name: true } }) : null
  console.info(`${c ? '✓' : '✗'} ${input} → ${c ? `${c.slug} (${c.name})` : '없음'}`)
}
await prisma.$disconnect()
