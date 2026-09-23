/* DB 활동 — 누가 잠그고 있나 (연결풀 타임아웃 원인) */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const rows = await p.$queryRawUnsafe(`
  SELECT pid, state, wait_event_type, wait_event, (now()-xact_start)::text AS xact_age, (now()-query_start)::text AS q_age, application_name, left(query, 120) q
  FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
  ORDER BY xact_start NULLS LAST LIMIT 25`)
for (const r of rows) console.log(JSON.stringify(r))
const locks = await p.$queryRawUnsafe(`
  SELECT l.pid, l.mode, l.granted, c.relname FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
  WHERE c.relname IN ('Match','MatchPlayerStat','LeagueClan') AND NOT l.granted LIMIT 20`)
console.log('-- 안 풀린 잠금', JSON.stringify(locks))
const idle = await p.$queryRawUnsafe(`SELECT count(*)::int n, state FROM pg_stat_activity WHERE datname=current_database() GROUP BY state`)
console.log('-- 상태별 연결 수', JSON.stringify(idle))
await p.$disconnect()
