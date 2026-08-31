/**
 * **운영 DB 의 통계·디스크·정렬 상태를 재는 자** (2026-09-01, D-227 후속).
 *
 * ```
 * node scripts/prod-run.mjs prod-health              # 운영 DB
 * node scripts/prod-run.mjs prod-health --skip-slow  # ⑥ 느린 질의 비교를 건너뛴다
 * pnpm --filter @sacloud/worker exec tsx src/dev/prodHealthProbe.ts   # 로컬 DB
 * ```
 *
 * ── 왜 필요한가
 *   로컬에서 `pg_stat_user_tables` 의 `last_analyze`/`last_autoanalyze` 가 **전부 null**
 *   이었다. 플래너가 361만 행짜리 `MatchPlayerStat` 을 **99행**으로 알고 있었고,
 *   그래서 「136건 찾겠다고 361만 행을 거꾸로 훑는」 계획이 나왔다 (D-227).
 *   **운영도 같은지** 봐야 `ANALYZE` 를 돌릴지 판정할 수 있다.
 *
 *   또 하나. `MatchPlayerStat(playerId, matchId) INCLUDE (weapon)` 커버링 인덱스는
 *   228MB 다. 만들 디스크 여유가 있는지 **확인하지 않은 채** 미뤄 뒀다.
 *   여기서 잰다.
 *
 * ── **읽기만 한다.** `SELECT` 와 Prisma 의 `count`/`findMany` 뿐이다.
 *   `ANALYZE` 도 `VACUUM` 도 `CREATE INDEX` 도 **돌리지 않는다.** 필요 여부만 판정한다.
 *
 * ⚠ 진단 도구다. 고치는 것은 이 결과를 보고 사람이 따로 한다.
 */
import { prisma } from '@sacloud/db'

const SKIP_SLOW = process.argv.includes('--skip-slow')
/** `--skip-old` — ⑥ 의 **옛 모양 한 질의만** 건너뛴다 (운영에서 115초짜리다) */
const SKIP_OLD = process.argv.includes('--skip-old')

/** 대상 표 — 화면이 실제로 무겁게 때리는 것들 */
const TABLES = ['MatchPlayerStat', 'Match', 'LeaguePlayer', 'LeagueClan', 'Clan'] as const

/** 한 번 재고 밀리초를 돌려준다 */
async function time<T>(label: string, run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = process.hrtime.bigint()
  const value = await run()
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  console.info(`  ${ms.toFixed(0).padStart(8)} ms  ${label}`)
  return { ms, value }
}

function pad(text: string, width: number) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}
function padStart(text: string, width: number) {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text
}

function iso(value: Date | string | null) {
  if (value === null || value === undefined) return 'null'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

console.info('연결을 먼저 연다 (첫 질의에 접속 시간이 섞이지 않게)')
await time('워밍업 SELECT 1', () => prisma.$queryRaw`SELECT 1`)

/* ─────────────────────────────────────────────────────────────
   ④ 먼저 나오는 게 좋다 — 여기부터 판정이 갈린다
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ ④ 데이터베이스 정렬(collation) · 버전')
const dbInfo = await prisma.$queryRaw<
  { datname: string; datcollate: string; datctype: string; encoding: string; version: string }[]
>`
  SELECT d.datname,
         d.datcollate,
         d.datctype,
         pg_encoding_to_char(d.encoding) AS encoding,
         version() AS version
  FROM pg_database d
  WHERE d.datname = current_database()
`
for (const row of dbInfo) {
  console.info(`  datname   : ${row.datname}`)
  console.info(`  datcollate: ${row.datcollate}   ← 로컬은 'C' 였다`)
  console.info(`  datctype  : ${row.datctype}`)
  console.info(`  encoding  : ${row.encoding}`)
  console.info(`  version   : ${row.version}`)
}

/* cuid 는 ASCII 소문자+숫자다. DB 정렬과 JS 비교(`>`)가 같은지 **실제로** 물어본다.
   `admin/queries.ts` 가 `id` 최댓값을 JS 로 고르므로 이게 갈리면 값이 달라진다. */
const collationProbe = await prisma.$queryRaw<{ sample: string }[]>`
  SELECT string_agg(x, ',' ORDER BY x) AS sample
  FROM (VALUES ('cm0'),('cM0'),('cm_0'),('cm00'),('c-m0'),('CM0')) AS t(x)
`
const dbOrder = collationProbe[0]?.sample ?? ''
const jsOrder = ['cm0', 'cM0', 'cm_0', 'cm00', 'c-m0', 'CM0'].sort().join(',')
console.info(`\n  DB 정렬 : ${dbOrder}`)
console.info(`  JS 정렬 : ${jsOrder}`)
console.info(`  일치    : ${dbOrder === jsOrder ? '예 — JS 비교가 DB 와 같다' : '아니오 — 갈린다'}`)

/**
 * 위 표본에는 `-` `_` 대문자가 섞여 있어 `en_US.UTF-8` 에서 당연히 갈린다.
 * 그런데 **cuid 는 소문자+숫자 25자뿐이다.** 실제로 우리 `id` 에서도 갈리는지 물어본다.
 * `admin/queries.ts` 가 `id` 최댓값을 JS 로 고르므로 여기가 진짜 판정 지점이다.
 */
console.info('\n  ── cuid 모양(`[0-9a-z]` 고정길이)에서도 갈리는가')
const cuidProbe = await prisma.$queryRaw<{ dbmax: string; shapes: string; lens: string }[]>`
  SELECT max(id)                                     AS dbmax,
         count(*) FILTER (WHERE id ~ '^[0-9a-z]+$')::text || '/' || count(*)::text AS shapes,
         count(DISTINCT length(id))::text            AS lens
  FROM (SELECT id FROM "MatchPlayerStat" LIMIT 200000) t
`
const cuidRows = await prisma.$queryRaw<{ id: string }[]>`
  SELECT id FROM "MatchPlayerStat" LIMIT 200000
`
let jsMax: string | null = null
for (const row of cuidRows) if (!jsMax || row.id > jsMax) jsMax = row.id
console.info(`  표본 20만행 중 [0-9a-z] 만인 것 : ${cuidProbe[0]?.shapes}  · 서로 다른 길이 ${cuidProbe[0]?.lens}종`)
console.info(`  DB max(id) : ${cuidProbe[0]?.dbmax}`)
console.info(`  JS max(id) : ${jsMax}`)
console.info(
  `  일치       : ${cuidProbe[0]?.dbmax === jsMax ? '예 — cuid 범위에서는 DB 정렬 == JS 비교' : '⛔ 아니오 — JS 로 최댓값을 고르면 안 된다'}`,
)

/* ─────────────────────────────────────────────────────────────
   ① pg_stat_user_tables
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ ① 통계 갱신 상태 (pg_stat_user_tables)')
const stats = await prisma.$queryRaw<
  {
    relname: string
    n_live_tup: string
    n_dead_tup: string
    last_analyze: Date | null
    last_autoanalyze: Date | null
    last_vacuum: Date | null
    last_autovacuum: Date | null
    analyze_count: string
    autoanalyze_count: string
    autovacuum_count: string
    n_mod_since_analyze: string
  }[]
>`
  SELECT relname,
         n_live_tup::text          AS n_live_tup,
         n_dead_tup::text          AS n_dead_tup,
         last_analyze,
         last_autoanalyze,
         last_vacuum,
         last_autovacuum,
         analyze_count::text       AS analyze_count,
         autoanalyze_count::text   AS autoanalyze_count,
         autovacuum_count::text    AS autovacuum_count,
         n_mod_since_analyze::text AS n_mod_since_analyze
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND relname = ANY(${[...TABLES]}::text[])
  ORDER BY n_live_tup DESC
`
console.info(
  `  ${pad('표', 17)}${padStart('n_live_tup', 12)}${padStart('n_dead_tup', 11)}  ${pad('last_analyze', 22)}${pad('last_autoanalyze', 22)}${pad('last_autovacuum', 22)}`,
)
for (const row of stats) {
  console.info(
    `  ${pad(row.relname, 17)}${padStart(Number(row.n_live_tup).toLocaleString(), 12)}${padStart(Number(row.n_dead_tup).toLocaleString(), 11)}  ${pad(iso(row.last_analyze), 22)}${pad(iso(row.last_autoanalyze), 22)}${pad(iso(row.last_autovacuum), 22)}`,
  )
}
console.info('')
console.info(`  ${pad('표', 17)}${padStart('analyze', 9)}${padStart('autoanalyze', 13)}${padStart('autovacuum', 12)}${padStart('mod_since_analyze', 19)}`)
for (const row of stats) {
  console.info(
    `  ${pad(row.relname, 17)}${padStart(row.analyze_count, 9)}${padStart(row.autoanalyze_count, 13)}${padStart(row.autovacuum_count, 12)}${padStart(Number(row.n_mod_since_analyze).toLocaleString(), 19)}`,
  )
}

/* autovacuum 이 아예 꺼져 있는지도 본다 */
const av = await prisma.$queryRaw<{ name: string; setting: string }[]>`
  SELECT name, setting FROM pg_settings
  WHERE name IN ('autovacuum','autovacuum_analyze_scale_factor','autovacuum_analyze_threshold',
                 'autovacuum_naptime','default_statistics_target','maintenance_work_mem',
                 'min_wal_size','max_wal_size','shared_buffers','work_mem')
  ORDER BY name
`
console.info('\n  ── 관련 설정')
for (const row of av) console.info(`  ${pad(row.name, 34)} ${row.setting}`)

/* 표별로 autovacuum 이 꺼져 있는지 (reloptions) */
const relopts = await prisma.$queryRaw<{ relname: string; reloptions: string | null }[]>`
  SELECT c.relname, array_to_string(c.reloptions, ', ') AS reloptions
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY(${[...TABLES]}::text[])
`
console.info('\n  ── 표별 reloptions (null 이면 기본값)')
for (const row of relopts) console.info(`  ${pad(row.relname, 17)} ${row.reloptions ?? 'null'}`)

/* ─────────────────────────────────────────────────────────────
   ② 플래너가 아는 행 수 vs 실제 행 수
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ ② 플래너가 아는 행 수 (pg_class.reltuples) vs 실제 count(*)')
const relt = await prisma.$queryRaw<{ relname: string; reltuples: number; relpages: number }[]>`
  SELECT c.relname, c.reltuples::float8 AS reltuples, c.relpages::int AS relpages
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY(${[...TABLES]}::text[])
  ORDER BY c.reltuples DESC
`
const reltMap = new Map(relt.map((r) => [r.relname, r]))

const actual = new Map<string, number>()
for (const table of TABLES) {
  const { value } = await time(`실제 count(*) — ${table}`, async () => {
    const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "${table}"`,
    )
    return Number(rows[0]?.n ?? 0)
  })
  actual.set(table, value)
}

console.info('')
console.info(`  ${pad('표', 17)}${padStart('reltuples(플래너)', 20)}${padStart('실제 count(*)', 16)}${padStart('배율', 12)}  판정`)
for (const table of TABLES) {
  const planner = reltMap.get(table)?.reltuples ?? -1
  const real = actual.get(table) ?? 0
  const ratio = planner > 0 ? real / planner : Infinity
  const verdict =
    planner < 0
      ? '표를 못 찾았다'
      : planner === -1
        ? '통계 없음 (-1)'
        : ratio > 10 || ratio < 0.1
          ? '⚠ 크게 어긋남 — ANALYZE 필요'
          : ratio > 1.5 || ratio < 0.67
            ? '△ 어긋남'
            : '정상'
  console.info(
    `  ${pad(table, 17)}${padStart(planner.toLocaleString(), 20)}${padStart(real.toLocaleString(), 16)}${padStart(Number.isFinite(ratio) ? `${ratio.toFixed(1)}배` : '—', 12)}  ${verdict}`,
  )
}

/* ─────────────────────────────────────────────────────────────
   ③ 디스크
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ ③ 디스크')
const dbSize = await prisma.$queryRaw<{ pretty: string; bytes: string }[]>`
  SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty,
         pg_database_size(current_database())::text AS bytes
`
console.info(`  DB 전체 : ${dbSize[0]?.pretty} (${Number(dbSize[0]?.bytes ?? 0).toLocaleString()} bytes)`)

/* 스키마 전체 상위 15개 표 */
const tableSizes = await prisma.$queryRaw<
  { relname: string; total: string; heap: string; idx: string; total_bytes: string }[]
>`
  SELECT c.relname,
         pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
         pg_size_pretty(pg_relation_size(c.oid))       AS heap,
         pg_size_pretty(pg_indexes_size(c.oid))        AS idx,
         pg_total_relation_size(c.oid)::text           AS total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 15
`
console.info(`\n  ── 표 크기 상위 15 (total = 본체 + 인덱스 + TOAST)`)
console.info(`  ${pad('표', 30)}${padStart('total', 12)}${padStart('본체', 12)}${padStart('인덱스', 12)}`)
for (const row of tableSizes) {
  console.info(`  ${pad(row.relname, 30)}${padStart(row.total, 12)}${padStart(row.heap, 12)}${padStart(row.idx, 12)}`)
}

/* 대상 표의 인덱스를 하나씩 */
const indexSizes = await prisma.$queryRaw<
  { tablename: string; indexname: string; size: string; bytes: string; scans: string; indexdef: string }[]
>`
  SELECT t.relname   AS tablename,
         i.relname   AS indexname,
         pg_size_pretty(pg_relation_size(i.oid)) AS size,
         pg_relation_size(i.oid)::text           AS bytes,
         COALESCE(s.idx_scan, 0)::text           AS scans,
         pg_get_indexdef(i.oid)                  AS indexdef
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
  WHERE n.nspname = 'public' AND t.relname = ANY(${[...TABLES]}::text[])
  ORDER BY t.relname, pg_relation_size(i.oid) DESC
`
console.info(`\n  ── 인덱스 크기 · 사용 횟수`)
console.info(`  ${pad('표', 17)}${pad('인덱스', 46)}${padStart('크기', 11)}${padStart('idx_scan', 12)}`)
for (const row of indexSizes) {
  console.info(
    `  ${pad(row.tablename, 17)}${pad(row.indexname, 46)}${padStart(row.size, 11)}${padStart(Number(row.scans).toLocaleString(), 12)}`,
  )
}

/* 문제의 인덱스 두 개를 콕 집어 본다 */
const TARGET_IDX = 'MatchPlayerStat_playerId_matchId_idx'
const target = indexSizes.find((r) => r.indexname === TARGET_IDX)
console.info(`\n  ── 커버링 인덱스 판정 재료`)
console.info(`  ${TARGET_IDX} : ${target ? `${target.size} — 이미 있다` : '없다'}`)
if (target) console.info(`    정의: ${target.indexdef}`)
const mpsTotal = tableSizes.find((r) => r.relname === 'MatchPlayerStat')
console.info(`  MatchPlayerStat total : ${mpsTotal?.total ?? '확인 못함'}`)

/* Supabase 플랜/디스크 상한 — SQL 로 알 수 있는 게 있으면 찍는다.
   (대개는 알 수 없다. 그러면 「확인 못함」으로 보고한다) */
const quota = await prisma.$queryRaw<{ name: string; setting: string }[]>`
  SELECT name, setting FROM pg_settings
  WHERE name IN ('temp_file_limit','max_connections','server_version')
  ORDER BY name
`
console.info(`\n  ── 상한 관련으로 SQL 에서 읽히는 값 (플랜 용량 자체는 SQL 로 안 나온다)`)
for (const row of quota) console.info(`  ${pad(row.name, 20)} ${row.setting}`)
const tblspc = await prisma.$queryRaw<{ spcname: string; loc: string | null }[]>`
  SELECT spcname, pg_tablespace_location(oid) AS loc FROM pg_tablespace
`
for (const row of tblspc) console.info(`  tablespace ${pad(row.spcname, 12)} ${row.loc || '(기본 데이터 디렉터리)'}`)

/* 파일시스템 여유 — 대개 권한이 없어 실패한다. 실패하면 「확인 못함」으로 보고한다 */
for (const probe of [
  { label: 'pg_ls_dir(.) 접근', sql: `SELECT count(*)::text AS v FROM pg_ls_dir('.')` },
  { label: 'WAL 조각 수', sql: `SELECT count(*)::text AS v FROM pg_ls_waldir()` },
  { label: 'WAL 총 크기', sql: `SELECT pg_size_pretty(sum(size))::text AS v FROM pg_ls_waldir()` },
  { label: '모든 DB 합계', sql: `SELECT pg_size_pretty(sum(pg_database_size(datname)))::text AS v FROM pg_database` },
]) {
  try {
    const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(probe.sql)
    console.info(`  ${pad(probe.label, 20)} ${rows[0]?.v}`)
  } catch (error) {
    /* split 결과 첫 칸은 타입상 undefined 일 수 있다. 진단 도구가 진단 중에 죽으면 안 된다 */
    const firstLine = (error as Error).message.split(String.fromCharCode(10))[0] ?? String(error)
    console.info(`  ${pad(probe.label, 20)} 확인 못함 - ${firstLine.slice(0, 90)}`)
  }
}

/* ─────────────────────────────────────────────────────────────
   ⑤ 오늘 적용한 인덱스가 운영에 있는가
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ ⑤ D-227 인덱스 두 개가 운영에 있는가')
const wanted = ['Match_startAt_idx', 'Match_origin_idx']
const found = await prisma.$queryRaw<{ indexname: string; indexdef: string; size: string }[]>`
  SELECT i.relname AS indexname,
         pg_get_indexdef(i.oid) AS indexdef,
         pg_size_pretty(pg_relation_size(i.oid)) AS size
  FROM pg_class i
  JOIN pg_namespace n ON n.oid = i.relnamespace
  WHERE n.nspname = 'public' AND i.relname = ANY(${wanted}::text[])
`
for (const name of wanted) {
  const hit = found.find((r) => r.indexname === name)
  console.info(`  ${pad(name, 24)} ${hit ? `있다 (${hit.size})  ${hit.indexdef}` : '⛔ 없다'}`)
}

/* 마이그레이션 이력에도 있는지 */
const migrations = await prisma.$queryRaw<
  { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
>`
  SELECT migration_name, finished_at, rolled_back_at
  FROM "_prisma_migrations"
  ORDER BY started_at DESC
  LIMIT 6
`
console.info(`\n  ── 최근 마이그레이션 6건`)
for (const row of migrations) {
  console.info(
    `  ${pad(row.migration_name, 46)} ${row.rolled_back_at ? '⛔ 되돌림' : row.finished_at ? iso(row.finished_at) : '미완료'}`,
  )
}

/* ─────────────────────────────────────────────────────────────
   ⑥ 느린 질의 — 옛 모양 vs 새 모양
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ ⑥ 관리자 요약이 던지던 질의 — 옛 모양 vs 새 모양')
if (SKIP_SLOW) {
  console.info('  --skip-slow 라 건너뛴다')
} else {
  console.info('  ① 옛 모양: MatchPlayerStat.findFirst(orderBy id desc, match.origin=nexon)')
  console.info('     ⚠ 로컬에서 32,925 ms 였다. 오래 걸릴 수 있다 (읽기만 한다)')
  const old = SKIP_OLD
    ? { ms: Number.NaN, value: null as { id: string; formulaVersion: string | null } | null }
    : await time('옛 모양 (findFirst + orderBy id desc + match relation)', () =>
        prisma.matchPlayerStat.findFirst({
          where: { match: { origin: 'nexon' }, formulaVersion: { not: null } },
          orderBy: { id: 'desc' },
          select: { id: true, formulaVersion: true },
        }),
      )
  if (SKIP_OLD) console.info('     --skip-old 라 건너뛴다')
  else console.info(`     결과: ${old.value ? `${old.value.id} / ${old.value.formulaVersion}` : 'null'}`)

  console.info('\n  ② 새 모양: matchId IN + JS 정렬 (두 걸음)')
  const step1 = await time('새 모양 ②-1 Match.findMany(origin=nexon) → id 목록', () =>
    prisma.match.findMany({ where: { origin: 'nexon' }, select: { id: true } }),
  )
  const ids = step1.value.map((r) => r.id)
  console.info(`     경기 ${ids.length.toLocaleString()}건`)

  const step2 = await time('새 모양 ②-2 MatchPlayerStat.findMany(matchId IN, 정렬 없음)', () =>
    prisma.matchPlayerStat.findMany({
      where: { matchId: { in: ids }, formulaVersion: { not: null } },
      select: { id: true, formulaVersion: true },
    }),
  )
  let newest: { id: string; formulaVersion: string | null } | null = null
  for (const row of step2.value) if (!newest || row.id > newest.id) newest = row
  console.info(`     참가기록 ${step2.value.length.toLocaleString()}행 → 최댓값 ${newest ? `${newest.id} / ${newest.formulaVersion}` : 'null'}`)

  const step3 = await time('새 모양 ②-3 MatchPlayerStat.count(matchId IN, ratingUpdate not null)', () =>
    prisma.matchPlayerStat.count({
      where: { matchId: { in: ids }, ratingUpdate: { not: null } },
    }),
  )
  console.info(`     ratingUpdate 있는 행 ${step3.value.toLocaleString()}건`)

  const newTotal = step1.ms + step2.ms + step3.ms
  console.info('')
  console.info(`  옛 모양 합계 : ${old.ms.toFixed(0)} ms`)
  console.info(`  새 모양 합계 : ${newTotal.toFixed(0)} ms  (②-1 ${step1.ms.toFixed(0)} + ②-2 ${step2.ms.toFixed(0)} + ②-3 ${step3.ms.toFixed(0)})`)
  console.info(`  개선폭       : ${newTotal > 0 ? (old.ms / newTotal).toFixed(1) : '—'}배`)

  /* 값이 같은지도 본다 — 빨라졌는데 답이 달라지면 소용없다 */
  const same = (old.value?.formulaVersion ?? null) === (newest?.formulaVersion ?? null)
  console.info(`  formulaVersion 일치 : ${same ? '예' : `아니오 (옛 ${old.value?.formulaVersion} / 새 ${newest?.formulaVersion})`}`)

  /* 관리자 경기 목록 — Match_startAt_idx 가 실제로 먹는지 */
  console.info('\n  ③ 관리자 경기 목록 (ORDER BY startAt DESC LIMIT 50)')
  await time('Match.findMany(orderBy startAt desc, take 50)', () =>
    prisma.match.findMany({ orderBy: { startAt: 'desc' }, take: 50, select: { id: true, startAt: true } }),
  )
  console.info('\n  ④ origin 별 건수 (Match_origin_idx 가 먹는지)')
  await time("Match.count(origin='nexon')", () => prisma.match.count({ where: { origin: 'nexon' } }))
  await time("Match.count(origin='3rd.supply')", () => prisma.match.count({ where: { origin: '3rd.supply' } }))
}

/* ─────────────────────────────────────────────────────────────
   부록 — 실행계획. 플래너가 무엇을 얼마로 보고 있는지 그대로 찍는다
   ───────────────────────────────────────────────────────────── */
console.info('\n═══ 부록 · 실행계획 (EXPLAIN — 실행하지 않는다)')
async function explain(label: string, sql: string) {
  console.info(`\n  [${label}]`)
  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, string>[]>(`EXPLAIN ${sql}`)
    for (const row of rows) console.info(`    ${Object.values(row)[0]}`)
  } catch (error) {
    console.info(`    실패: ${(error as Error).message.split('\n')[0]}`)
  }
}
await explain(
  '옛 모양 — MatchPlayerStat ⨯ Match, ORDER BY id DESC LIMIT 1',
  `SELECT s.id FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
   WHERE m.origin = 'nexon' AND s."formulaVersion" IS NOT NULL
   ORDER BY s.id DESC LIMIT 1`,
)
await explain('Match ORDER BY "startAt" DESC LIMIT 50', `SELECT id FROM "Match" ORDER BY "startAt" DESC LIMIT 50`)
await explain('Match WHERE origin = \'nexon\'', `SELECT count(*) FROM "Match" WHERE origin = 'nexon'`)

console.info('\n끝. 이 스크립트는 아무것도 쓰지 않았다.')
await prisma.$disconnect()
