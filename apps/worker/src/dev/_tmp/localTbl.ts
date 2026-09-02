import { prisma } from '@sacloud/db'
const main = async (): Promise<void> => {
  const r = await prisma.$queryRaw<Array<{ name: string; size: string; bytes: bigint }>>`
    SELECT relname AS name, pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
           pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND relname IN ('BarracksBattleLogRaw','MatchClanHexV2','ClanHexV2Summary','BarracksClanNumber')`
  for (const t of r) console.log(`  ${t.name.padEnd(24)} ${t.size}  (${Number(t.bytes)} bytes)`)
  const n = await prisma.barracksBattleLogRaw.count()
  const row = r.find((x) => x.name === 'BarracksBattleLogRaw')
  if (row) console.log(`  → 행당 평균 ${Math.round(Number(row.bytes) / n / 1024)} KB · ${n}행`)
  await prisma.$disconnect()
}
void main()
