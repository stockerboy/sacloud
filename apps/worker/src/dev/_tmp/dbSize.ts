/** 읽기 전용 — 운영 DB 용량과 큰 표 */
import { prisma } from '@sacloud/db'
const main = async (): Promise<void> => {
  const total = await prisma.$queryRaw<Array<{ size: string; bytes: bigint }>>`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
           pg_database_size(current_database()) AS bytes`
  console.log('DB 전체', total[0]!.size, `(${Number(total[0]!.bytes) / 1e9} GB)`)
  const tables = await prisma.$queryRaw<Array<{ name: string; size: string; bytes: bigint }>>`
    SELECT relname AS name, pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
           pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 12`
  for (const t of tables) console.log(`  ${t.name.padEnd(28)} ${t.size}`)
  await prisma.$disconnect()
}
void main()
