/**
 * 병영수첩 **클랜전 목록** 원문 적재 — IPL 기록 이관.
 *
 * ── 흐름
 * ```
 * 병영수첩 GetClanMatchList (사용자의 로그인된 브라우저가 받은 JSON)
 *   → 내려받기 폴더의 파일
 *   → BarracksClanMatchRaw     원문 그대로 보존 (멱등)
 * ```
 *
 * ── 왜 파일로 받는가
 *   Node 에서 병영수첩을 부르면 **403**(WAF 봇차단)이다. UA 를 위조해 뚫지 않는다
 *   (`CLAUDE.md` 3-A 5번 · `docs/IPL_SPEC.md` 7장). 수집은 정상 브라우저가 하고
 *   여기서는 읽기만 한다.
 *
 * ── 여기서 하지 않는 것
 *   **`Match` 로 투영하지 않는다.** 진영·클랜 연결·래더는 규칙이 따로 있고
 *   (D-155 · `CLAUDE.md` 3-B) 별도 작업이다. 잘못 이으면 운영까지 번진다.
 *   이 파일은 **원문 보존까지만** 한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { contentHash } from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'

const SOURCE = 'nexon_barracks'
/** 끝 슬래시가 필요하다 (`docs/IPL_SPEC.md` 7장 실측) */
const DEFAULT_ENDPOINT = '/api/ClanHome/GetClanMatchList/'

/** 우리가 받은 리그 경기는 이 맵 하나다. 판별은 `map_name` 으로 한다 */
export const LEAGUE_MAP_NAME = '제3보급창고'

/* ============================================================ 파일 찾기 === */

/**
 * 수집기가 저장하는 한 줄.
 *
 * ```
 * { "subject": "fdd8", "raw": { ...GetClanMatchList 응답의 한 항목 그대로... } }
 * ```
 */
export interface IplMatchRow {
  /** 조회한 클랜의 병영수첩 slug (`clan_id`). **경기의 주인이 아니다** */
  subject?: string
  clan_id?: string
  source?: string
  endpoint?: string
  raw?: Record<string, unknown>
}

/** 한 줄에서 조회 주체를 고른다 */
function subjectOf(row: IplMatchRow): string | null {
  const value = row.subject ?? row.clan_id
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** 한 줄에서 경기 번호를 고른다. `match_key` 앞 12자리가 경기 시각이다 */
export function matchKeyOf(row: IplMatchRow): string | null {
  const key = row.raw?.match_key
  if (key === null || key === undefined) return null
  const text = String(key).trim()
  return text === '' ? null : text
}

/** 파일 하나를 살펴보는 데 이보다 오래 걸리면 포기한다 */
const SNIFF_TIMEOUT_MS = 5_000

/**
 * 이 파일이 우리가 찾는 목록 파일인가 — **앞부분만 읽어 판정한다.**
 *
 * 크롬이 이름을 못 바꿔 `.tmp` 로 남는 경우가 있다 (D-203). 내용은 멀쩡한 JSON 이라
 * 확장자를 믿지 않고 **내용으로** 고른다. 배틀로그 수집 파일과 섞이지 않도록
 * 목록 응답에만 있는 칸(`red_clan_name`)까지 확인한다.
 *
 * ── 왜 비동기이고 왜 시간을 재는가
 *   내려받기 폴더에는 **다른 프로그램이 붙잡고 있는 파일**이 섞인다. 동기 읽기로 그런
 *   파일을 열면 커널에서 영영 멈춘다 — 실제로 남의 `.tmp` 하나 때문에 적재가 통째로
 *   9분 넘게 멈춰 있었다 (2026-08-31 실측). 비동기로 읽고 시간을 재면 그 파일만 버린다.
 */
async function looksLikeClanMatchFile(path: string): Promise<boolean> {
  const sniff = async (): Promise<boolean> => {
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(16 * 1024)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const head = buffer.subarray(0, bytesRead).toString('utf8')
      if (head.trimStart()[0] !== '[') return false
      return head.includes('"subject"') && head.includes('"red_clan_name"')
    } finally {
      await handle.close()
    }
  }
  /* 멈춘 읽기는 되돌아오지 않는다. 그래도 **기다리기만 멈춘다** — 그 뒤 파일은 계속 본다 */
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SNIFF_TIMEOUT_MS))
  try {
    const verdict = await Promise.race([sniff(), timeout])
    if (verdict === null) {
      warn(`살펴보다 멈춰 건너뛴다 (${SNIFF_TIMEOUT_MS / 1000}초 초과): ${path}`)
      return false
    }
    return verdict
  } catch {
    return false
  }
}

/**
 * 폴더에서 목록 파일을 고른다.
 *
 * `ipl-<클랜slug>-<건수>.json` 이 정상 이름이고, `.tmp` 로 남은 것도 같이 훑는다.
 * 그 외 확장자는 열어 보지도 않는다.
 */
export async function findClanMatchFiles(dir: string, since?: Date): Promise<string[]> {
  const names = readdirSync(dir)
  const found: string[] = []
  for (const name of names) {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.json') && !lower.endsWith('.tmp')) continue
    const path = join(dir, name)
    try {
      const stat = statSync(path)
      if (!stat.isFile()) continue
      /*
        `--since` 는 **열어 보기 전에** 거른다.

        내려받기 폴더에는 상관없는 `.tmp` 가 수백 개 있고, 백신이 열 때마다 검사해서
        한 개 살펴보는 데 1초 가까이 걸린다 (2026-08-31 실측 · 450개에 10분 이상).
        수집한 날짜를 알면 그 앞은 볼 필요가 없다.
      */
      if (since && stat.mtime < since) continue
    } catch {
      continue
    }
    if (await looksLikeClanMatchFile(path)) found.push(path)
  }
  return found.sort()
}

/* ============================================================== 적재 === */

export interface IplMatchImportFileReport {
  file: string
  rows: number
  /** 이 파일에서 본 조회 주체들 (보통 한 곳) */
  subjects: string[]
  stored: number
  duplicate: number
  skipped: number
  error?: string
}

export interface IplMatchImportResult {
  files: number
  failedFiles: number
  rows: number
  stored: number
  duplicate: number
  /** 주체나 경기번호를 몰라 넣지 않은 줄 */
  skipped: number
  /** 파일 전체에서 본 고유 경기 수 (양쪽 클랜 목록의 같은 경기는 한 번만 센다) */
  uniqueMatches: number
  /** 파일 전체에서 본 고유 (경기, 주체) 짝 — DB 행 수와 맞아야 한다 */
  uniquePairs: number
  earliestMatchKey: string | null
  latestMatchKey: string | null
  /** `제3보급창고` 가 아닌 줄 */
  otherMaps: Record<string, number>
  perFile: IplMatchImportFileReport[]
}

interface PendingRow {
  matchKey: string
  subject: string
  payloadHash: string
  payload: Record<string, unknown>
  source: string
  endpoint: string
}

/**
 * DB 왕복 한 번에 다루는 줄 수.
 *
 * 크게 잡으면 빠르지만 로컬 PostgreSQL(Windows)이 WAL 을 못 따라가 죽는 일이 있었다
 * (2026-08-31 · `PANIC: could not open file "pg_wal/..."`). **속도보다 완주가 낫다.**
 */
const CHUNK = 100

/**
 * 묶음 사이에 잠깐 쉰다 — 체크포인터가 WAL 을 재활용할 틈을 준다.
 *
 * 200줄씩 쉬지 않고 밀어 넣었더니 로컬 DB 가 두 번 죽었다. 9만 건이면 이 쉼표로
 * 2분 남짓 더 걸릴 뿐이다. **완주가 속도보다 중요하다.**
 */
const BREATHE_MS = 150

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 몇 묶음마다 체크포인트를 한 번 부를지.
 *
 * ── 2026-08-31 재조정: **40 → 400** (4,000행마다 → 4만행마다)
 *
 * 40 은 `min_wal_size = 80MB` 시절에 나온 값이다. 그때는 WAL 이 불어나면 죽었으니
 * 자주 비워 주는 것이 살길이었다. **지금은 설정이 정반대다** (D-216) —
 * 조각을 넉넉히 남겨 두고 재활용하게 해서 "새로 만들기" 를 피한다.
 * 거기에 4,000행마다 전체 버퍼 플러시를 강제로 때리면 새 설정이 하려는 일을 매번 취소한다.
 *
 * 실측이 그것을 그대로 보여 줬다 (`pg_stat_activity`, 2026-08-31):
 * ```
 * pid=22036  CHECKPOINT              20.3초째 붙들고 있음
 * pid=20476  INSERT …RawtRaw         11.0초  wait=LWLock/WALWrite
 * pid=8128   INSERT "League"          9.0초  wait=LWLock/WALWrite
 * 대기 중인 락(NOT granted) 0        ← 락 경합이 아니다
 * ```
 * 나머지가 `IPC/CheckpointDone` 으로 그 뒤에 줄을 섰다. **100행 INSERT 하나가 11초** 걸렸다.
 *
 * ⚠ **0 으로 두지 마라.** 체크포인트를 아예 안 부르면 이번엔 WAL 이 `max_wal_size` 를
 * 넘기며 자동 체크포인트가 몰아서 돈다. 드물게, 그러나 계속 부르는 것이 맞다.
 *
 * 옛 값이 필요하면 `SACLOUD_CHECKPOINT_EVERY=40` 으로 돌릴 수 있다 (`CLAUDE.md` 10-4).
 */
const CHECKPOINT_EVERY = Number(process.env.SACLOUD_CHECKPOINT_EVERY ?? 400)

/**
 * 체크포인트를 직접 부른다 — **WAL 이 쌓이다 못해 DB 가 죽는 것을 막는다.**
 *
 * 20만 건을 쉬지 않고 넣으면 자동 체크포인트가 쓰기 속도를 못 따라간다.
 * 실측으로 `pg_wal` 이 15 → 66 조각(1GB)까지 불어났고, 그러다 새 조각을 못 만들어
 * `PANIC: could not open file "pg_wal/..."` 로 서버가 죽었다 (2026-08-31 · Windows).
 * 중간중간 불러 주면 WAL 조각이 재활용돼 그 자리에서 멈춘다.
 *
 * 권한이 없으면 **한 번만 알리고 조용히 넘어간다.** 이것 때문에 적재를 멈추지 않는다.
 */
let checkpointAllowed = true
async function checkpoint(): Promise<void> {
  if (!checkpointAllowed) return
  try {
    await prisma.$executeRawUnsafe('CHECKPOINT')
  } catch (error) {
    checkpointAllowed = false
    warn(`체크포인트를 못 불렀다 — 그냥 진행한다 (${String(error).slice(0, 120)})`)
  }
}

/**
 * 한 묶음이 실패하면 잠깐 쉬고 다시 해 본다 (`CLAUDE.md` 3-A 4번).
 *
 * 로컬 PostgreSQL 이 WAL 파일을 새로 만들다 실패해 재시작하는 일이 실제로 있었다
 * (2026-08-31 · Windows). 그때 9만 건짜리 적재가 통째로 죽으면 안 된다.
 * 적재 자체가 멱등이므로 되풀이해도 행이 늘지 않는다.
 */
async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  /*
    죽은 DB 가 복구를 마치는 데 **20분 넘게** 걸린 적이 있다 (2026-08-31 실측).
    짧게 포기하면 20만 건짜리 적재를 사람이 계속 다시 돌려야 한다. 넉넉히 기다린다 (합 ~30분).
  */
  const waits = [2_000, 5_000, 10_000, 20_000, 30_000, 45_000, ...Array(28).fill(60_000)]
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (attempt > 0) {
        console.info(`  ${label} — ${attempt}번째 재시도가 성공했다`)
      }
      return await run()
    } catch (error) {
      const wait = waits[attempt]
      if (wait === undefined) throw error
      /*
        ── 조용히 기다리지 않는다 (2026-08-31)

        이 백오프의 합이 30분이다. 그동안 `warn`(stderr) 한 줄씩만 찍었더니
        **"CPU 는 오르는데 행이 안 는다" 로 보였고 원인 규명이 통째로 빗나갔다.**
        묶음 크기·락·메모리를 의심하며 시간을 태웠는데 실제로는 DB 가 죽어 있었다.

        3회 연속 실패부터는 **눈에 띄게** 찍는다. 배틀로그 26만 건에서 같은 일이 나면
        몇 시간을 태운다.
      */
      if (attempt + 1 >= 3) {
        const total = waits.slice(0, attempt + 1).reduce((a, b) => a + b, 0)
        console.info(
          [
            '',
            '################################################################',
            `  ${label} — ${attempt + 1}회 연속 실패. 지금까지 ${Math.round(total / 1000)}초 기다렸다`,
            '  DB 가 죽었을 가능성이 높다. 확인:',
            '    netstat -ano | findstr :5433',
            '    ls "C:/Users/LG/AppData/Local/sacloud/pgdata/global/pg_control"  ← 시각이 안 움직이면 얼어붙은 것이다',
            '  얼어붙었으면 startup 프로세스만 끊고 다시 띄운다 (docs/DECISIONS.md D-216)',
            `  마지막 오류: ${String(error).slice(0, 200)}`,
            '################################################################',
            '',
          ].join('\n'),
        )
      }
      warn(`${label} 실패 — ${wait / 1000}초 쉬고 다시 한다 (${String(error).slice(0, 160)})`)
      await sleep(wait)
    }
  }
}

/**
 * 수집 파일들 → `BarracksClanMatchRaw`.
 *
 * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등하다 — 같은 파일을 다시 넣어도
 * 행이 늘지 않고, 같은 내용이면 `fetchCount` 만 오른다. 중단해도 넣은 데까지는 남는다.
 */
export async function importIplMatches(input: {
  dir?: string
  files?: string[]
  since?: Date
  confirm?: boolean
}): Promise<IplMatchImportResult> {
  const files = input.files ?? (input.dir ? await findClanMatchFiles(input.dir, input.since) : [])
  const result: IplMatchImportResult = {
    files: files.length,
    failedFiles: 0,
    rows: 0,
    stored: 0,
    duplicate: 0,
    skipped: 0,
    uniqueMatches: 0,
    uniquePairs: 0,
    earliestMatchKey: null,
    latestMatchKey: null,
    otherMaps: {},
    perFile: [],
  }

  /* 파일들 사이의 중복을 세려면 전역 집합이 필요하다. 9만 건이면 문자열 집합으로 충분하다 */
  const seenMatches = new Set<string>()
  const seenPairs = new Set<string>()

  for (const file of files) {
    const report: IplMatchImportFileReport = {
      file,
      rows: 0,
      subjects: [],
      stored: 0,
      duplicate: 0,
      skipped: 0,
    }

    let rows: IplMatchRow[]
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (!Array.isArray(parsed)) throw new Error('배열이 아니다')
      rows = parsed as IplMatchRow[]
    } catch (error) {
      /* 실패한 파일은 건너뛰고 **기록한다.** 한 파일 때문에 나머지를 버리지 않는다 */
      report.error = error instanceof Error ? error.message : String(error)
      result.failedFiles += 1
      result.perFile.push(report)
      warn(`건너뜀 ${file} — ${report.error}`)
      continue
    }

    const subjects = new Set<string>()
    const pending: PendingRow[] = []
    /* 한 파일 안의 완전 중복(같은 경기·주체·내용)은 DB 를 부르기 전에 접는다 */
    const localKeys = new Set<string>()

    for (const row of rows) {
      report.rows += 1
      result.rows += 1
      const subject = subjectOf(row)
      const matchKey = matchKeyOf(row)
      const raw = row.raw
      if (!subject || !matchKey || !raw || typeof raw !== 'object') {
        /* 주인이나 경기를 모르면 넣지 않는다. 추측해서 키를 만들지 않는다 */
        report.skipped += 1
        result.skipped += 1
        continue
      }
      subjects.add(subject)

      const mapName = typeof raw.map_name === 'string' ? raw.map_name : '(없음)'
      if (mapName !== LEAGUE_MAP_NAME) {
        result.otherMaps[mapName] = (result.otherMaps[mapName] ?? 0) + 1
      }

      seenMatches.add(matchKey)
      seenPairs.add(`${matchKey} ${subject}`)
      const stamp = matchKey.slice(0, 12)
      if (result.earliestMatchKey === null || stamp < result.earliestMatchKey) {
        result.earliestMatchKey = stamp
      }
      if (result.latestMatchKey === null || stamp > result.latestMatchKey) {
        result.latestMatchKey = stamp
      }

      const payloadHash = contentHash(raw)
      const key = `${matchKey} ${subject} ${payloadHash}`
      if (localKeys.has(key)) {
        report.duplicate += 1
        result.duplicate += 1
        continue
      }
      localKeys.add(key)
      pending.push({
        matchKey,
        subject,
        payloadHash,
        payload: raw,
        source: typeof row.source === 'string' ? row.source : SOURCE,
        endpoint: typeof row.endpoint === 'string' ? row.endpoint : DEFAULT_ENDPOINT,
      })
    }

    report.subjects = [...subjects].sort()

    if (input.confirm) {
      let sinceCheckpoint = 0
      for (const batch of chunked(pending, CHUNK)) {
        /* 이미 있는 것을 먼저 찾는다 — 같은 내용이면 다시 넣지 않고 fetchCount 만 올린다 */
        const existing = await withRetry('이미 있는 것 조회', () =>
          prisma.barracksClanMatchRaw.findMany({
            where: { matchKey: { in: batch.map((item) => item.matchKey) } },
            select: { id: true, matchKey: true, subject: true, payloadHash: true },
          }),
        )
        const idByKey = new Map<string, string>()
        for (const found of existing) {
          idByKey.set(`${found.matchKey} ${found.subject} ${found.payloadHash}`, found.id)
        }

        const fresh: PendingRow[] = []
        let already = 0
        for (const item of batch) {
          if (idByKey.has(`${item.matchKey} ${item.subject} ${item.payloadHash}`)) already += 1
          else fresh.push(item)
        }
        report.duplicate += already
        result.duplicate += already

        if (fresh.length > 0) {
          const created = await withRetry('원문 적재', () =>
            prisma.barracksClanMatchRaw.createMany({
              data: fresh.map((item) => ({
                source: item.source,
                endpoint: item.endpoint,
                matchKey: item.matchKey,
                subject: item.subject,
                payload: item.payload as object,
                payloadHash: item.payloadHash,
                status: 'ok',
              })),
              /* 유일키가 막아 준다. 중단 후 재개해도 안전하다 */
              skipDuplicates: true,
            }),
          )
          report.stored += created.count
          result.stored += created.count
          const raced = fresh.length - created.count
          report.duplicate += raced
          result.duplicate += raced
        }
        /*
          이미 있는 줄은 **건드리지 않는다.**

          예전에는 `fetchCount` 를 올렸다. 그런데 20만 건짜리 적재를 중단 후 재개하면
          이미 넣은 15만 줄을 전부 UPDATE 하게 된다 — 새로 넣는 것보다 쓰기가 많다.
          그 쓰기 폭주가 로컬 PostgreSQL 을 실제로 죽였다 (2026-08-31).
          **재개는 싸야 한다.** 언제 처음 받았는지는 `fetchedAt` 에 남아 있다.
        */
        if (fresh.length > 0) {
          await sleep(BREATHE_MS)
          sinceCheckpoint += 1
          if (sinceCheckpoint >= CHECKPOINT_EVERY) {
            sinceCheckpoint = 0
            await checkpoint()
          }
        }
      }
      /* 파일 하나를 끝낼 때마다 한 번 더. 다음 파일이 깨끗한 WAL 에서 시작한다 */
      if (pending.length > 0) await checkpoint()
    } else {
      /* 미리보기 — 한 줄도 쓰지 않는다. 무엇이 들어갈지만 센다 */
      report.stored = pending.length
      result.stored += pending.length
    }

    result.perFile.push(report)
    log(
      `${input.confirm ? '적재' : '미리보기'} ${file} — ` +
        `주체 ${report.subjects.join(',') || '(없음)'} · 줄 ${report.rows} · ` +
        `신규 ${report.stored} · 중복 ${report.duplicate} · 건너뜀 ${report.skipped}`,
    )
  }

  result.uniqueMatches = seenMatches.size
  result.uniquePairs = seenPairs.size
  return result
}

/* ============================================================== 대조 === */

/** `YYMMDDHHMMSS` → 읽을 수 있는 시각. 절대시각은 `match_key` 에서만 나온다 */
export function formatMatchStamp(stamp: string | null): string {
  if (!stamp || stamp.length < 12) return '(없음)'
  const yy = stamp.slice(0, 2)
  const mm = stamp.slice(2, 4)
  const dd = stamp.slice(4, 6)
  const hh = stamp.slice(6, 8)
  const mi = stamp.slice(8, 10)
  const ss = stamp.slice(10, 12)
  return `20${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

export interface IplMatchCheckResult {
  passed: boolean
  /** 파일을 안 준 경우 `null` */
  fileUniqueMatches: number | null
  fileUniquePairs: number | null
  fileRows: number | null
  dbRows: number
  dbUniqueMatches: number
  dbSubjects: number
  earliestMatchKey: string | null
  latestMatchKey: string | null
  /** `제3보급창고` 가 아닌 행 (맵 이름별) */
  otherMaps: Record<string, number>
  /** 2026-04-01(KST) 이전 경기 — 시즌0 창(D-175)과 IPL 창(2026-01-01)은 다르다 */
  beforeApril: number
  beforeYear: number
  /** 양쪽이 다 등록 클랜인 경기 수 */
  bothRegistered: number
  /** 한쪽만 등록 클랜인 경기 수 */
  oneRegistered: number
  /** 데이터에서 도출한 등록 클랜 이름 (slug → 클랜명) */
  registered: { subject: string; clanName: string; rows: number; ratio: number }[]
  failures: string[]
}

interface CountRow {
  count: bigint
}

/**
 * 숫자 대조. **로그가 아니라 숫자로 판정한다** (`CLAUDE.md` 3-A 6번).
 *
 * 등록 클랜 이름은 **데이터에서 도출한다** — 어느 slug 의 목록이든 그 클랜 자신은
 * 모든 줄에 red 나 blue 로 나오기 때문이다. 명단을 코드에 박지 않는다.
 */
export async function checkIplMatches(input: {
  dir?: string
  since?: Date
}): Promise<IplMatchCheckResult> {
  const failures: string[] = []

  const [dbRows, uniq] = await Promise.all([
    prisma.barracksClanMatchRaw.count(),
    prisma.$queryRaw<{ matches: bigint; subjects: bigint; lo: string | null; hi: string | null }[]>`
      SELECT COUNT(DISTINCT "matchKey")::bigint AS matches,
             COUNT(DISTINCT "subject")::bigint  AS subjects,
             MIN(LEFT("matchKey", 12))          AS lo,
             MAX(LEFT("matchKey", 12))          AS hi
      FROM "BarracksClanMatchRaw"
    `,
  ])
  const dbUniqueMatches = Number(uniq[0]?.matches ?? 0)
  const dbSubjects = Number(uniq[0]?.subjects ?? 0)

  const mapRows = await prisma.$queryRaw<{ map_name: string | null; count: bigint }[]>`
    SELECT "payload"->>'map_name' AS map_name, COUNT(*)::bigint AS count
    FROM "BarracksClanMatchRaw"
    WHERE "payload"->>'map_name' IS DISTINCT FROM ${LEAGUE_MAP_NAME}
    GROUP BY 1
    ORDER BY 2 DESC
  `
  const otherMaps: Record<string, number> = {}
  for (const row of mapRows) otherMaps[row.map_name ?? '(없음)'] = Number(row.count)

  const [beforeAprilRows, beforeYearRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT "matchKey")::bigint AS count
      FROM "BarracksClanMatchRaw" WHERE LEFT("matchKey", 6) < '260401'
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT "matchKey")::bigint AS count
      FROM "BarracksClanMatchRaw" WHERE LEFT("matchKey", 6) < '260101'
    `,
  ])

  /*
    slug → 그 클랜의 이름들.

    목록의 주인은 **모든 줄에 red 나 blue 로 나온다.** 그런데 이름이 하나가 아니다 —
    기간(2026-04~08) 안에 **개명한 클랜이 여럿 있다** (실측: `luvme` ↔ `Iuvme` 처럼
    동형문자만 바꾼 경우까지). 가장 많이 나온 이름 하나만 고르면 절반만 덮인다.

    그래서 **덮기(set cover)** 로 고른다 — 아직 안 덮인 줄을 가장 많이 덮는 이름을
    차례로 집어, 그 주체의 줄이 전부 덮일 때까지. 상대 클랜은 일부 줄에만 나오므로
    주인 이름이 먼저 뽑힌다. 진전이 없으면 멈춘다. **명단을 코드에 박지 않는다.**
  */
  const sideRows = await prisma.$queryRaw<{ subject: string; red: string | null; blue: string | null }[]>`
    SELECT "subject",
           "payload"->>'red_clan_name'  AS red,
           "payload"->>'blue_clan_name' AS blue
    FROM "BarracksClanMatchRaw"
  `
  const bySubject = new Map<string, { red: string | null; blue: string | null }[]>()
  for (const row of sideRows) {
    const list = bySubject.get(row.subject)
    if (list) list.push({ red: row.red, blue: row.blue })
    else bySubject.set(row.subject, [{ red: row.red, blue: row.blue }])
  }

  const registered: IplMatchCheckResult['registered'] = []
  for (const [subject, rows] of [...bySubject].sort((a, b) => a[0].localeCompare(b[0]))) {
    const uncovered = new Set(rows.map((_, index) => index))
    const chosen: { name: string; rows: number }[] = []
    /* 개명이 아무리 잦아도 몇 번이면 끝난다. 무한히 집지 않는다 */
    while (uncovered.size > 0 && chosen.length < 8) {
      const tally = new Map<string, number>()
      for (const index of uncovered) {
        const row = rows[index]
        if (!row) continue
        for (const name of [row.red, row.blue]) {
          if (name) tally.set(name, (tally.get(name) ?? 0) + 1)
        }
      }
      let best: string | null = null
      let bestCount = 0
      for (const [name, count] of tally) {
        if (count > bestCount) {
          best = name
          bestCount = count
        }
      }
      if (best === null || bestCount === 0) break
      for (const index of [...uncovered]) {
        const row = rows[index]
        if (row && (row.red === best || row.blue === best)) uncovered.delete(index)
      }
      chosen.push({ name: best, rows: bestCount })
    }
    const covered = rows.length - uncovered.size
    for (const pick of chosen) {
      registered.push({
        subject,
        clanName: pick.name,
        rows: pick.rows,
        /* 이 주체의 줄 중 **이 이름 하나로** 덮인 비율. 개명하면 여러 줄로 나뉜다 */
        ratio: rows.length === 0 ? 0 : pick.rows / rows.length,
      })
    }
    if (covered < rows.length) {
      failures.push(
        `${subject} 의 클랜명을 못 정했다 — ` +
          `${rows.length} 줄 중 ${covered} 줄만 덮였다 (고른 이름 ${chosen.length}개)`,
      )
    }
  }
  const names = [...new Set(registered.map((item) => item.clanName))]

  let bothRegistered = 0
  let oneRegistered = 0
  if (names.length > 0) {
    const [both, one] = await Promise.all([
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT "matchKey")::bigint AS count FROM "BarracksClanMatchRaw"
        WHERE "payload"->>'red_clan_name'  = ANY(${names}::text[])
          AND "payload"->>'blue_clan_name' = ANY(${names}::text[])
      `,
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT "matchKey")::bigint AS count FROM "BarracksClanMatchRaw"
        WHERE ("payload"->>'red_clan_name'  = ANY(${names}::text[]))
           <> ("payload"->>'blue_clan_name' = ANY(${names}::text[]))
      `,
    ])
    bothRegistered = Number(both[0]?.count ?? 0)
    oneRegistered = Number(one[0]?.count ?? 0)
  }

  /* ---- 파일 쪽 ---- */
  let fileUniqueMatches: number | null = null
  let fileUniquePairs: number | null = null
  let fileRows: number | null = null
  if (input.dir) {
    const seenMatches = new Set<string>()
    const seenPairs = new Set<string>()
    let rows = 0
    for (const file of await findClanMatchFiles(input.dir, input.since)) {
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'))
      } catch (error) {
        failures.push(`파일을 읽지 못했다: ${file} — ${String(error)}`)
        continue
      }
      if (!Array.isArray(parsed)) {
        failures.push(`배열이 아니다: ${file}`)
        continue
      }
      for (const row of parsed as IplMatchRow[]) {
        rows += 1
        const subject = subjectOf(row)
        const matchKey = matchKeyOf(row)
        if (!subject || !matchKey) continue
        seenMatches.add(matchKey)
        seenPairs.add(`${matchKey} ${subject}`)
      }
    }
    fileUniqueMatches = seenMatches.size
    fileUniquePairs = seenPairs.size
    fileRows = rows

    /* 파일이 DB 보다 많으면 아직 안 넣은 것이 있다는 뜻이다. 그대로 실패로 적는다 */
    if (fileUniqueMatches !== dbUniqueMatches) {
      failures.push(`고유 경기 수가 다르다 — 파일 ${fileUniqueMatches} · DB ${dbUniqueMatches}`)
    }
    if (fileUniquePairs !== dbRows) {
      failures.push(`(경기,주체) 짝이 DB 행 수와 다르다 — 파일 ${fileUniquePairs} · DB ${dbRows}`)
    }
  }

  const otherMapTotal = Object.values(otherMaps).reduce((sum, value) => sum + value, 0)
  if (otherMapTotal > 0) {
    failures.push(`${LEAGUE_MAP_NAME} 가 아닌 행이 ${otherMapTotal} 건 섞였다`)
  }
  const beforeApril = Number(beforeAprilRows[0]?.count ?? 0)
  const beforeYear = Number(beforeYearRows[0]?.count ?? 0)
  if (beforeYear > 0) {
    failures.push(`IPL 이관 창(2026-01-01) 이전 경기가 ${beforeYear} 건 섞였다`)
  }

  return {
    passed: failures.length === 0,
    fileUniqueMatches,
    fileUniquePairs,
    fileRows,
    dbRows,
    dbUniqueMatches,
    dbSubjects,
    earliestMatchKey: uniq[0]?.lo ?? null,
    latestMatchKey: uniq[0]?.hi ?? null,
    otherMaps,
    beforeApril,
    beforeYear,
    bothRegistered,
    oneRegistered,
    registered,
    failures,
  }
}
