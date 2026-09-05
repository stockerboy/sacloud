/** ★원문 한 줄이 실제로 무슨 칸을 주는가★ — 정규화를 짓기 전에 본다 (읽기만) */
import { prisma } from '@sacloud/db'
const rows = await prisma.$queryRawUnsafe<Array<{ payload: Record<string, unknown> }>>(
  `SELECT "payload" FROM "BarracksClanMatchRaw" ORDER BY "fetchedAt" DESC LIMIT 3`)
const keys = new Set<string>()
for (const r of rows) for (const k of Object.keys(r.payload)) keys.add(k)
console.info('★칸 이름 전부★ (' + keys.size + '개)')
console.info('  ' + [...keys].sort().join(' · '))
console.info('\n★맨 앞 한 줄★')
console.info(JSON.stringify(rows[0]?.payload, null, 1).slice(0, 1400))
await prisma.$disconnect()
