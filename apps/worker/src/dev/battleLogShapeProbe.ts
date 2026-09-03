import { prisma } from '@sacloud/db'
async function main() {
  const r = await prisma.$queryRaw<{ k: string; e: unknown }[]>`
    SELECT r."matchKey" AS k, jsonb_agg(e ORDER BY ord) AS e
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') WITH ORDINALITY AS t(e, ord)
     WHERE r."status" = 'ok'
     GROUP BY 1 LIMIT 1
  `
  const evs = (r[0]!.e as Record<string, unknown>[])
  console.info('이벤트 수', evs.length)
  console.info('★칸 이름★', Object.keys(evs[0] ?? {}).join(' · '))
  for (const e of evs.slice(0, 12)) console.info('  ', JSON.stringify(e))
  const texts = new Map<string, number>()
  for (const e of evs) texts.set(String(e.event_text), (texts.get(String(e.event_text)) ?? 0) + 1)
  console.info('\n★이 경기의 event_text 종류★')
  for (const [t, n] of [...texts].sort((a, b) => b[1] - a[1])) console.info(`   ${t} — ${n}회`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
