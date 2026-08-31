/**
 * **클랜 상세를 살리는 커버링 인덱스** (2026-09-01 · D-230 후속).
 *
 * ```
 * node scripts/prod-run.mjs perf-covering-index              # 미리보기
 * node scripts/prod-run.mjs perf-covering-index --confirm    # 실제
 * node scripts/prod-run.mjs perf-covering-index --drop-old --confirm   # 옛 인덱스 정리
 * ```
 *
 * ── 왜 필요한가 (미룰 수 없게 된 이유)
 *   최대 클랜 `lpcrew`(8,755경기)의 **클랜 상세가 운영에서 500** 이었다.
 *   느린 게 아니라 **함수 제한시간을 넘겨 죽는다.**
 *
 *   ```
 *   운영  /clans/lpcrew/show      12.0초 → 500
 *         /clans/lpcrew/players    8.0초 → 200 (경계선)
 *   로컬  같은 두 경로            21.4초 · 10.6초
 *   ```
 *
 *   ⚠ 앞서 「클랜 상세 1.2초」로 잰 것은 **엣지 캐시 HIT** 였다 (D-223 이 붙인 30초).
 *     캐시가 진짜 비용을 가리고 있었다. **캐시 뒤의 값을 재라.**
 *
 * ── 무엇을 고치나
 *   `clanRoster.ts` → `resolvePositionsOf` 의 weapon `groupBy` 가 범인이다.
 *   기존 인덱스 `(playerId, matchId)` 로 클랜원 63명분 8만 행을 뽑은 뒤,
 *   **`weapon` 이 인덱스에 없어서** 1.9GB 표에서 힙 페치 3만 블록을 한다.
 *   `INCLUDE ("weapon")` 하나로 index-only 가 된다.
 *
 *   로컬 실측 (인덱스 + ANALYZE 후):
 *   ```
 *   /clans/lpcrew/show     21.4초 → 2.3초
 *   /clans/lpcrew/players  10.6초 → 0.64초
 *   ```
 *
 * ── 안전
 *   `CONCURRENTLY` 라 **쓰기를 잠그지 않는다.** 마이그레이션 안에서는 못 한다 —
 *   트랜잭션 안이라 `CONCURRENTLY` 가 거부된다. 그래서 이 스크립트다.
 *   실패하면 무효 인덱스가 남는데, 그건 `--drop-invalid` 로 치운다.
 *
 * ── 순서
 *   ① 새 인덱스를 만든다 (기존 것을 지우지 않는다 — 되돌릴 자리를 남긴다)
 *   ② `ANALYZE` 로 통계를 갱신한다 (안 하면 플래너가 새 인덱스를 안 쓴다)
 *   ③ 화면을 재 보고 좋아졌으면 **그때** `--drop-old` 로 옛 인덱스를 지운다
 *      선두 칼럼이 같으므로 옛 인덱스를 쓰던 질의는 새 것으로 그대로 넘어간다
 */
import { PrismaClient } from '@sacloud/db'

/**
 * **풀러(6543)로는 `CONCURRENTLY` 가 안 된다.** `prod-migrate.mjs` 와 같은 이유다.
 *
 * 운영 `DATABASE_URL` 은 Supabase **transaction pooler** 라 모든 문장을 트랜잭션으로
 * 감싼다. 그래서 실제로 이렇게 거부당했다 (2026-09-01):
 * ```
 * ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block   (25001)
 * ```
 * 같은 호스트의 **5432 는 session pooler** 다. 자격증명은 같고 포트만 다르다.
 * 여기서 포트를 바꾸고 풀러 전용 옵션(`pgbouncer` · `connection_limit`)을 뗀다.
 * **이 프로세스 안에서만 만든 주소이고, 앱이 쓰는 주소는 건드리지 않는다.**
 *
 * 로컬(127.0.0.1:5433)은 직결이라 그대로 쓴다.
 */
function sessionUrlOf(url: string): string {
  if (url.includes('127.0.0.1') || url.includes('localhost')) return url
  const parsed = new URL(url)
  if (parsed.port === '6543') parsed.port = '5432'
  parsed.searchParams.delete('pgbouncer')
  parsed.searchParams.delete('connection_limit')
  return parsed.toString()
}

const runtimeUrl = process.env.DATABASE_URL ?? ''
if (!runtimeUrl) {
  console.error('DATABASE_URL 이 없다')
  process.exit(1)
}
const sessionUrl = sessionUrlOf(runtimeUrl)
const prisma = new PrismaClient({ datasources: { db: { url: sessionUrl } } })
console.info(
  `접속  ${new URL(sessionUrl).host}` +
    (sessionUrl === runtimeUrl ? '' : '  ← 세션 풀러로 바꿨다 (CONCURRENTLY 때문)'),
)

const confirm = process.argv.includes('--confirm')
const dropOld = process.argv.includes('--drop-old')
const dropInvalid = process.argv.includes('--drop-invalid')

const NEW_INDEX = 'MatchPlayerStat_playerId_matchId_weapon_idx'
const OLD_INDEX = 'MatchPlayerStat_playerId_matchId_idx'

interface IndexRow {
  indexname: string
  size: string
  valid: boolean | null
}

async function listIndexes(): Promise<IndexRow[]> {
  return prisma.$queryRawUnsafe<IndexRow[]>(`
    SELECT indexname,
           pg_size_pretty(pg_relation_size(quote_ident(indexname)::regclass)) AS size,
           (SELECT indisvalid FROM pg_index i
              JOIN pg_class c ON c.oid = i.indexrelid
             WHERE c.relname = indexname) AS valid
      FROM pg_indexes
     WHERE tablename = 'MatchPlayerStat'
     ORDER BY indexname
  `)
}

async function dbSize(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(
    `SELECT pg_size_pretty(pg_database_size(current_database()))::text AS v`,
  )
  return rows[0]?.v ?? '?'
}

console.info(`DB 크기  ${await dbSize()}`)
console.info('\n지금 인덱스')
for (const row of await listIndexes()) {
  console.info(`  ${row.valid === false ? '무효' : '정상'}  ${row.indexname.padEnd(46)} ${row.size}`)
}

const before = await listIndexes()
const already = before.find((row) => row.indexname === NEW_INDEX)

if (dropInvalid) {
  const invalid = before.filter((row) => row.valid === false)
  if (invalid.length === 0) {
    console.info('\n무효 인덱스가 없다.')
  } else if (!confirm) {
    console.info(`\n지울 무효 인덱스: ${invalid.map((row) => row.indexname).join(', ')}`)
    console.info('--confirm 없이는 한 줄도 쓰지 않았다')
  } else {
    for (const row of invalid) {
      console.info(`무효 인덱스 삭제 ${row.indexname}`)
      await prisma.$executeRawUnsafe(`DROP INDEX CONCURRENTLY "${row.indexname}"`)
    }
  }
  await prisma.$disconnect()
  process.exit(0)
}

if (dropOld) {
  const target = before.find((row) => row.indexname === OLD_INDEX)
  const replacement = before.find((row) => row.indexname === NEW_INDEX)
  if (!replacement || replacement.valid === false) {
    console.error('\n새 인덱스가 없거나 무효다. 옛 것을 지우면 안 된다.')
    await prisma.$disconnect()
    process.exit(1)
  }
  if (!target) {
    console.info('\n옛 인덱스가 이미 없다.')
  } else if (!confirm) {
    console.info(`\n지울 것: ${OLD_INDEX} (${target.size})`)
    console.info('--confirm 없이는 한 줄도 쓰지 않았다')
  } else {
    console.info(`\n옛 인덱스 삭제 ${OLD_INDEX} (${target.size})`)
    await prisma.$executeRawUnsafe(`DROP INDEX CONCURRENTLY "${OLD_INDEX}"`)
    console.info('삭제 완료')
  }
  await prisma.$disconnect()
  process.exit(0)
}

if (already) {
  console.info(`\n${NEW_INDEX} 는 이미 있다 (${already.size} · ${already.valid === false ? '무효' : '정상'})`)
  if (already.valid === false) console.info('  → `--drop-invalid --confirm` 으로 치우고 다시 만들어라')
  await prisma.$disconnect()
  process.exit(0)
}

console.info(`\n만들 것  ${NEW_INDEX}`)
console.info('         ON "MatchPlayerStat" ("playerId","matchId") INCLUDE ("weapon")')
console.info('         CONCURRENTLY — 쓰기를 잠그지 않는다')
console.info(`         옛 인덱스(${OLD_INDEX})는 **지우지 않는다** — 되돌릴 자리를 남긴다`)

if (!confirm) {
  console.info('\n--confirm 없이는 한 줄도 쓰지 않았다')
  await prisma.$disconnect()
  process.exit(0)
}

const started = Date.now()
console.info('\n만드는 중… (몇 분 걸린다)')
await prisma.$executeRawUnsafe(`
  CREATE INDEX CONCURRENTLY IF NOT EXISTS "${NEW_INDEX}"
    ON "MatchPlayerStat" ("playerId", "matchId") INCLUDE ("weapon")
`)
console.info(`생성 완료  ${((Date.now() - started) / 1000).toFixed(1)} 초`)

console.info('\nANALYZE — 안 하면 플래너가 새 인덱스를 안 쓴다')
const analyzeStarted = Date.now()
await prisma.$executeRawUnsafe(`ANALYZE "MatchPlayerStat"`)
console.info(`ANALYZE 완료  ${((Date.now() - analyzeStarted) / 1000).toFixed(1)} 초`)

console.info('\n뒤 인덱스')
for (const row of await listIndexes()) {
  console.info(`  ${row.valid === false ? '무효' : '정상'}  ${row.indexname.padEnd(46)} ${row.size}`)
}
console.info(`\nDB 크기  ${await dbSize()}`)
console.info('\n다음: 클랜 상세를 재 보고 좋아졌으면 `--drop-old --confirm` 으로 옛 인덱스를 지운다')

await prisma.$disconnect()
