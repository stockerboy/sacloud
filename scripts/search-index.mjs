/**
 * 검색 인덱스를 **운영에 잠금 없이** 만든다 (O-009 · 2026-09-02).
 *
 * ```
 * node scripts/search-index.mjs            # 무엇을 할지 보여주기만 한다
 * node scripts/search-index.mjs --confirm  # 실제 생성
 * node scripts/search-index.mjs --drop --confirm   # 되돌리기
 * ```
 *
 * ── 왜 마이그레이션이 아니라 스크립트인가
 *   `prisma migrate` 는 트랜잭션 안에서 돌아 `CREATE INDEX CONCURRENTLY` 를 쓸 수 없다.
 *   그냥 `CREATE INDEX` 로 만들면 **만드는 동안 테이블이 잠긴다.** 운영 DB 자리는
 *   5개뿐이라(Supavisor 풀) 잠기면 사이트가 통째로 선다.
 *   `20260901030000_perf_indexes` 가 같은 이유로 큰 인덱스를 마이그레이션 밖으로 뺐다.
 *
 * ── 운영 순서
 *   1) 이 스크립트로 CONCURRENTLY 생성
 *   2) `node scripts/prod-migrate.mjs --confirm` — 마이그레이션은 `IF NOT EXISTS` 라 건너뛴다
 *
 * ── 되돌리는 법 (먼저 적어 둔다)
 *   `--drop --confirm` 이 아래를 돈다. 인덱스를 지워도 검색은 그대로 돈다 — 느려질 뿐이다.
 *   ```
 *   DROP INDEX CONCURRENTLY IF EXISTS "Player_name_trgm_idx";
 *   DROP INDEX CONCURRENTLY IF EXISTS "Clan_name_trgm_idx";
 *   ```
 *   `pg_trgm` 확장은 **지우지 않는다.** 다른 것이 쓰고 있으면 실패하고, 두어도 값이 없다.
 *
 * ── 안전한 이유
 *   · `--confirm` 없이는 한 줄도 안 바꾼다
 *   · 전부 `IF NOT EXISTS` / `IF EXISTS` 라 두 번 돌려도 같다
 *   · `CONCURRENTLY` 라 읽기·쓰기를 막지 않는다 (대신 더 오래 걸린다)
 *   · 운영 접속 주소를 **명령줄에 노출하지 않는다** — `prod-migrate.mjs` 와 같은 방식으로
 *     `packages/db/.env.production.local` 에서 읽어 자식 프로세스에만 넘긴다
 *
 * ⚠ `CONCURRENTLY` 는 실패하면 **쓸 수 없는 인덱스(invalid)** 를 남긴다.
 *   그때는 `--drop --confirm` 으로 지우고 다시 돌린다. 아래 마지막에 상태를 찍는다.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const confirm = process.argv.includes('--confirm')
const drop = process.argv.includes('--drop')

let url
try {
  const text = readFileSync('packages/db/.env.production.local', 'utf8')
  url = (text.match(/DATABASE_URL="([^"]+)"/) ?? [])[1]
} catch {
  console.error('packages/db/.env.production.local 을 읽지 못했다. 저장소 루트에서 실행해야 한다.')
  process.exit(1)
}
if (!url) {
  console.error('그 파일에 DATABASE_URL 이 없다.')
  process.exit(1)
}

/*
 * 인덱스 생성은 **풀러로 돌리면 안 된다** (`prod-migrate.mjs` 와 같은 이유).
 * 풀러(6543)는 세션을 돌려쓰기 때문에 `CONCURRENTLY` 처럼 세션에 걸치는 작업이 깨진다.
 * 직결(5432)로 바꾼다.
 */
/*
 * ⚠ 문자열 치환으로 하면 안 된다. `?pgbouncer=true&connection_limit=1` 에서
 *   `?pgbouncer=true` 만 떼면 **물음표가 같이 사라져** DB 이름이
 *   `postgres&connection_limit=1` 이 된다 (2026-09-02 에 이걸로 P1003 을 봤다).
 *   `prod-migrate.mjs` 의 `migrationUrlOf` 와 같은 방식으로 URL 파서를 쓴다.
 */
function directUrlOf(runtimeUrl) {
  const parsed = new URL(runtimeUrl)
  if (parsed.port === '6543') parsed.port = '5432'
  parsed.searchParams.delete('pgbouncer')
  parsed.searchParams.delete('connection_limit')
  parsed.searchParams.delete('pool_timeout')
  return parsed.toString()
}
const direct = directUrlOf(url)

/** 주소는 **호스트만** 찍는다. 전체 URL 은 절대 찍지 않는다 */
console.info(`대상 ${new URL(direct).host}\n`)

const STEPS = drop
  ? [
      ['Player 인덱스 지우기', 'DROP INDEX CONCURRENTLY IF EXISTS "Player_name_trgm_idx"'],
      ['Clan 인덱스 지우기', 'DROP INDEX CONCURRENTLY IF EXISTS "Clan_name_trgm_idx"'],
    ]
  : [
      ['pg_trgm 확장', 'CREATE EXTENSION IF NOT EXISTS pg_trgm'],
      [
        'Player 이름 인덱스',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Player_name_trgm_idx" ON "Player" USING gin (name gin_trgm_ops)',
      ],
      [
        'Clan 이름 인덱스',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Clan_name_trgm_idx" ON "Clan" USING gin (name gin_trgm_ops)',
      ],
      ['Player 통계 갱신', 'ANALYZE "Player"'],
      ['Clan 통계 갱신', 'ANALYZE "Clan"'],
    ]

console.info(drop ? '되돌리기 — 인덱스를 지운다' : '검색 인덱스를 만든다 (CONCURRENTLY · 잠그지 않는다)')
for (const [label, sql] of STEPS) console.info(`  ${label}\n    ${sql}`)

if (!confirm) {
  console.info('\n--confirm 없이는 아무것도 하지 않는다. 위 문장만 보여 줬다.')
  process.exit(0)
}

/**
 * psql 대신 prisma 로 한 문장씩 돈다 — 이 저장소에 psql 이 없다.
 *
 * ⚠ **저장소 루트에서는 `prisma db execute` 가 없다** (`CLI.UNKNOWN_COMMAND`).
 *   `packages/db` 안의 prisma 를 써야 한다. 그래서 `cwd` 를 거기로 옮긴다.
 *   (2026-09-02 에 루트에서 돌렸다가 이걸로 실패했다 — npm 경고에 가려져 원인이 안 보였다)
 */
function run(sql) {
  const result = spawnSync(
    'npx',
    ['prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
    {
      cwd: 'packages/db',
      input: sql,
      env: { ...process.env, DATABASE_URL: direct },
      encoding: 'utf8',
      shell: true,
    },
  )
  const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  /* prisma 는 실패해도 status 0 을 줄 때가 있다 — 본문의 `"ok":false` 로도 판정한다 */
  const failed = result.status !== 0 || /"ok"\s*:\s*false/.test(out)
  if (!failed) return null
  return out
    .split('\n')
    .filter((line) => line.trim() && !/npm warn|DeprecationWarning|--trace-deprecation/.test(line))
    .join('\n')
    .trim()
}

for (const [label, sql] of STEPS) {
  process.stdout.write(`  ${label} … `)
  const error = run(sql)
  console.info(error ? `실패\n    ${error.split('\n').slice(0, 3).join('\n    ')}` : '완료')
  if (error) {
    console.error('\n멈춘다. 위 오류를 먼저 본다.')
    console.error('CONCURRENTLY 가 중간에 깨졌으면 쓸 수 없는 인덱스가 남는다 —')
    console.error('  node scripts/search-index.mjs --drop --confirm  으로 지우고 다시 돈다.')
    process.exit(1)
  }
}

console.info('\n끝났다. 확인하려면 운영에서 이걸 본다:')
console.info(`  SELECT indexname, indisvalid FROM pg_indexes
    JOIN pg_class ON relname = indexname
    JOIN pg_index ON indexrelid = pg_class.oid
   WHERE tablename IN ('Player','Clan') AND indexname LIKE '%trgm%';`)
console.info('  indisvalid 가 false 면 실패한 것이다 — --drop --confirm 후 다시 돈다.')
