/**
 * **선수 상세(육각형)를 살리는 커버링 인덱스** (2026-09-01 · D-230 후속 ②).
 *
 * ```
 * node scripts/prod-run.mjs perf-dist-index              # 미리보기
 * node scripts/prod-run.mjs perf-dist-index --confirm    # 실제
 * ```
 *
 * ── 왜 두 번째 인덱스가 필요한가
 *   첫 인덱스(`perf-covering-index`)로 **클랜 상세는 살았는데 선수 상세가 여전히 500** 이었다.
 *
 *   ```
 *   운영 열산(20만 경기) 상위 선수 4명   전부 500 · 11~17초
 *   운영 DPL 상위 8명                    첫 인덱스 뒤 전부 200 (1.3~6.6초)
 *   ```
 *
 *   가지별로 재니 **`playerTraits`(육각형) 하나가 전부**였다 — 나머지 넷을 다 더해야 0.7초다.
 *   ```
 *   playerLadderTotals  583ms   buildPlayerForm    54ms
 *   playerTodayTally     17ms   playerTierBreakdown 70ms
 *   playerTraits       6,557ms  ← 여기
 *   ```
 *
 * ── 왜 무거운가
 *   육각형 백분위는 **그 리그 같은 무기 선수 전원의 분포**가 있어야 나온다. 그래서
 *   리그 전체 참가기록을 `groupBy(playerId, weapon)` 한다 — 열산은 200만 행이다.
 *   진입은 `Match`(leagueId+startAt) → matchId 이고 거기서 `MatchPlayerStat` 을 matchId 로
 *   찾는데, **필요한 칸(playerId·weapon·kill·damage)이 인덱스에 없어** 매번 힙으로 내려간다.
 *
 *   `INCLUDE` 로 그 넷을 얹으면 index-only 가 된다. **로컬 실측 6.6초 → 1.05초.**
 *
 *   ⚠ 프로세스 안 캐시가 있지만(`clearTraitDistributionCache`) **서버리스는 매번 차갑다.**
 *     캐시는 콜드 스타트를 못 덮는다. 그래서 질의 자체를 싸게 만들어야 한다.
 *
 * ── 안전
 *   `CONCURRENTLY` 라 쓰기를 잠그지 않는다. 아무것도 지우지 않는다 — **추가만 한다.**
 *   ⚠ 풀러(6543)는 문장을 트랜잭션으로 감싸 `CONCURRENTLY` 를 거부한다.
 *     그래서 `prod-migrate.mjs` 와 같이 **세션 풀러(5432)** 로 붙는다.
 */
import { PrismaClient } from '@sacloud/db'

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
const INDEX = 'MatchPlayerStat_matchId_dist_idx'

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
const before = await listIndexes()
console.info('\n지금 인덱스')
for (const row of before) {
  console.info(`  ${row.valid === false ? '무효' : '정상'}  ${row.indexname.padEnd(46)} ${row.size}`)
}

const already = before.find((row) => row.indexname === INDEX)
if (already) {
  console.info(`\n${INDEX} 는 이미 있다 (${already.size} · ${already.valid === false ? '무효' : '정상'})`)
  await prisma.$disconnect()
  process.exit(0)
}

console.info(`\n만들 것  ${INDEX}`)
console.info('         ON "MatchPlayerStat" ("matchId") INCLUDE ("playerId","weapon","kill","damage")')
console.info('         CONCURRENTLY — 쓰기를 잠그지 않는다 · 아무것도 안 지운다')

if (!confirm) {
  console.info('\n--confirm 없이는 한 줄도 쓰지 않았다')
  await prisma.$disconnect()
  process.exit(0)
}

const started = Date.now()
console.info('\n만드는 중…')
await prisma.$executeRawUnsafe(`
  CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX}"
    ON "MatchPlayerStat" ("matchId") INCLUDE ("playerId", "weapon", "kill", "damage")
`)
console.info(`생성 완료  ${((Date.now() - started) / 1000).toFixed(1)} 초`)

const analyzeStarted = Date.now()
console.info('\nANALYZE — 안 하면 플래너가 새 인덱스를 안 쓴다')
await prisma.$executeRawUnsafe(`ANALYZE "MatchPlayerStat"`)
console.info(`ANALYZE 완료  ${((Date.now() - analyzeStarted) / 1000).toFixed(1)} 초`)

console.info('\n뒤 인덱스')
for (const row of await listIndexes()) {
  console.info(`  ${row.valid === false ? '무효' : '정상'}  ${row.indexname.padEnd(46)} ${row.size}`)
}
console.info(`\nDB 크기  ${await dbSize()}`)

await prisma.$disconnect()
