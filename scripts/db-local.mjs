/**
 * 로컬 개발용 PostgreSQL 기동/정지.
 *
 * 왜 이런 방식인가 (docs/DECISIONS.md D-022)
 * - 이 개발 PC에는 Docker도 PostgreSQL도 설치돼 있지 않고, 관리자 권한 설치를 요구하고 싶지 않다.
 * - `embedded-postgres`는 PostgreSQL 공식 바이너리를 node_modules 안에 내려받아
 *   일반 사용자 권한으로 띄운다. **개발 전용**이며 운영에는 쓰지 않는다.
 * - 포트는 5433. 나중에 시스템에 PostgreSQL을 따로 설치해도 기본 포트(5432)와 겹치지 않는다.
 *
 * 사용법
 *   node scripts/db-local.mjs start
 *   node scripts/db-local.mjs stop
 *   node scripts/db-local.mjs reset   ← 데이터 디렉터리를 지우고 다시 만든다 (개발 DB 한정)
 *
 * 주의: `reset`은 로컬 개발 DB에만 쓴다. 운영 DB 초기화는 사용자 승인 없이 하지 않는다
 * (CLAUDE.md 3-A).
 */
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 데이터 디렉터리를 **저장소 밖 ASCII 경로**에 둔다.
 *
 * 이유: 이 저장소 경로에 한글이 들어있다(`C:\Users\LG\Desktop\서플라이`).
 * Windows에서 initdb는 경로를 시스템 코드페이지(CP949)로 다루기 때문에
 * 한글 경로를 주면 `invalid byte sequence for encoding "UTF8"`로 초기화가 실패한다.
 * (실제로 실패하는 것을 확인했다.)
 */
const dataDir =
  process.env.SACLOUD_PGDATA ?? path.join(os.homedir(), 'AppData', 'Local', 'sacloud', 'pgdata')

export const LOCAL_DB = {
  user: 'sacloud',
  password: 'sacloud',
  port: 5433,
  database: 'sacloud',
}

function createServer() {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    user: LOCAL_DB.user,
    password: LOCAL_DB.password,
    port: LOCAL_DB.port,
    persistent: true,
    /**
     * 한국어 Windows에서 initdb를 통과시키기 위한 조합이다. 두 문제를 각각 피한다.
     *
     * 1. `--locale=C`
     *    기본 로케일이 `Korean_Korea.949`면 initdb가
     *    "could not find suitable text search configuration"으로 실패한다.
     *
     * 2. `--encoding=SQL_ASCII`
     *    post-bootstrap 단계에서 `pg_import_system_collations()`가 Windows의
     *    시스템 collation 이름을 CP949 바이트로 읽어 넣는다. 템플릿 DB가 UTF8이면
     *    `invalid byte sequence for encoding "UTF8": 0xbc`로 죽는다.
     *    템플릿을 SQL_ASCII로 만들면 이 검사를 피할 수 있다.
     *
     * **실제 사용 DB(`sacloud`)는 아래 `createUtf8Database()`에서 UTF8로 따로 만든다.**
     * 템플릿만 SQL_ASCII이고 우리 데이터는 UTF8이다.
     */
    initdbFlags: ['--locale=C', '--encoding=SQL_ASCII'],
    onLog: () => {},
    onError: () => {},
  })
}

/**
 * 실제 사용할 DB를 **UTF8**로 만든다.
 *
 * 템플릿(`template1`)은 SQL_ASCII라서 그대로 복제하면 한글이 깨진다.
 * `TEMPLATE template0`을 지정해야 다른 인코딩으로 만들 수 있다.
 * 이미 있으면 아무것도 하지 않는다 (idempotent).
 */
async function createUtf8Database(pg) {
  const client = pg.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      LOCAL_DB.database,
    ])
    if (rows.length > 0) {
      console.info(`데이터베이스 확인: ${LOCAL_DB.database} (이미 존재)`)
      return
    }
    await client.query(
      `CREATE DATABASE "${LOCAL_DB.database}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
    )
    console.info(`데이터베이스 생성: ${LOCAL_DB.database} (UTF8)`)
  } finally {
    await client.end()
  }
}

async function start({ fresh = false } = {}) {
  if (fresh && existsSync(dataDir)) {
    console.info('개발 DB 데이터 디렉터리 삭제…')
    rmSync(dataDir, { recursive: true, force: true })
  }

  const pg = createServer()
  const initialised = existsSync(dataDir)

  if (!initialised) {
    console.info(`PostgreSQL 초기화 (최초 1회) — ${dataDir}`)
    mkdirSync(path.dirname(dataDir), { recursive: true })
    await pg.initialise()
  }

  console.info(`PostgreSQL 시작 — 127.0.0.1:${LOCAL_DB.port}`)
  await pg.start()

  await createUtf8Database(pg)

  console.info('준비 완료.')
  console.info(
    `DATABASE_URL="postgresql://${LOCAL_DB.user}:${LOCAL_DB.password}@127.0.0.1:${LOCAL_DB.port}/${LOCAL_DB.database}?schema=public"`,
  )
  console.info('')
  console.info('※ 이 프로세스가 살아 있는 동안만 DB가 뜬다.')
  console.info('  창을 닫거나 Ctrl+C를 누르면 PostgreSQL도 함께 종료되고,')
  console.info('  API가 500을 반환한다. 개발하는 동안은 이 창을 그대로 둔다.')

  // Ctrl+C로 끊을 때 데이터 디렉터리를 깨끗한 상태로 남긴다
  const shutdown = async () => {
    console.info('\nPostgreSQL 정지…')
    try {
      await pg.stop()
    } catch {
      /* 이미 내려갔으면 무시 */
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

async function stop() {
  if (!existsSync(dataDir)) {
    console.info('데이터 디렉터리가 없다. 기동된 적이 없는 것으로 본다.')
    return
  }
  const pg = createServer()
  console.info('PostgreSQL 정지…')
  await pg.stop()
  console.info('정지 완료.')
}

const command = process.argv[2] ?? 'start'

try {
  if (command === 'start') await start()
  else if (command === 'reset') await start({ fresh: true })
  else if (command === 'stop') await stop()
  else {
    console.error(`알 수 없는 명령: ${command} (start | stop | reset)`)
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
