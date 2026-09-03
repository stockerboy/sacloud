/**
 * **병영수첩을 사람 손 없이 긁는다** (O-051 · 2026-09-03).
 *
 * ══ 왜 새로 만드나 ══
 *
 * 지금까지 긁는 길은 ★브라우저 콘솔 스니펫★ 하나뿐이었다
 * (`scripts/battlelog-collect-snippet.js` · 런북 2장:
 *  «병영수첩을 ★로그인한 채로★ 열고 F12 에 붙여 넣는다»).
 *
 * 사장님: «★나는 크롬 못켜놓는다★ ★무조건 자동화 방안 알아봐 15분에 한번 갱신되는★»
 * → ★그 방식이 통째로 빠졌다.★ 사람이 없어도 도는 것이 필요하다.
 *
 * ══ ★★그런데 Node 로는 못 부른다 — curl 로는 된다★★ ══
 *
 * 2026-09-03 실측 (D-268 · 집 IP · 같은 순간 · 같은 요청 · ★UA/쿠키 위조 없음★):
 * ```
 * ★curl★       GET /                          ★200★ ·  2,847 bytes
 *              POST /api/ClanHome/…           ★200★ · 23,377 bytes
 *              POST /api/BattleLog/… + {}     ★200★ · 63,875 bytes
 * ★Node fetch★ GET /                          ★403★
 * ```
 * ★403 뒤에 curl 을 다시 보내 200 을 확인했다 — 차단이 아니라 클라이언트가 갈린다.★
 *
 * 그래서 이 잡은 ★`curl` 을 그대로 실행한다.★ Node 의 `fetch` 를 쓰지 않는다.
 *
 * ⚠ ★왜 갈리는지는 파지 않는다.★ 지문으로 보이지만 ★확인해서 흉내 내면 그건 탐지 회피다★
 *   (`CLAUDE.md` 3-A 5번). ★curl 이 열려 있으니 curl 을 쓴다.★ 그뿐이다.
 * ⚠ ★UA·쿠키·Referer 를 손으로 만들지 않는다.★ 위 200 은 curl 이 평소 보내는 그대로다.
 * ⚠ ★로그인이 필요 없다.★ 위 실측은 쿠키 한 개도 없이 받은 것이다.
 *
 * ══ ★모든 POST 에 본문을 넣는다★ ══
 *
 * ```
 * POST /api/BattleLog/… (본문 없음)  → ★405★
 * POST /api/BattleLog/… + {}        → ★200★
 * ```
 * ★경로가 다 맞아도 본문이 없으면 405 다.★ 우리 탐침이 그 실수로 「막혔다」고
 * 답할 뻔했다 (D-268). ★405 가 다시 나오면 그때는 진짜 막힌 것이다.★
 *
 * ══ 원본에 대한 예의 (D-266 그대로) ══
 *
 * ```
 * 간격    기본 1500ms · ★하한 1000ms★ — 그 아래로 내리지 않는다
 * 정지    ★첫 403·429 에서 즉시 멈춘다★ — 「연속 N건」을 기다리지 않는다
 * 동시    ★1★ — 순차로만 부른다
 * ```
 * ⚠ ★D-266 의 집 IP 차단이 풀렸다고 빨리 돌리지 않는다.★ 상한은 그대로다.
 */
import { spawn } from 'node:child_process'
import { storeBarracksRows, type BarracksRow } from '@sacloud/db/ops'
import { prisma } from '@sacloud/db'

/* --------------------------------------------------------------- 상수 --- */

const ORIGIN = 'https://barracks.sa.nexon.com'
/** ★이 아래로 내리지 않는다★ (D-266) */
export const MIN_DELAY_MS = 1000
export const DEFAULT_DELAY_MS = 1500
/** 한 응답이 90KB 안팎이다. 그보다 훨씬 큰 것이 오면 뭔가 다른 것이다 */
const MAX_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_S = 30
/** ★몇 건마다 부하를 보나★ — 매 건마다 보면 감시자 자신이 부하가 된다 */
export const GUARD_EVERY = 10

/** 이 잡이 멈춘 이유 */
export type StopReason = 'done' | 'blocked' | 'limit' | 'health' | 'error'

export interface CollectOptions {
  /** 배틀로그를 몇 건까지 받나 */
  limit: number
  /**
   * ★목록을 받을 클랜 수★ (①단계).
   *
   * ⚠ ★운영의 `BarracksClanMatchRaw` 는 0행이다★ (2026-09-03 실측).
   *   그 표가 「무엇을 받아야 하는지」의 재료인데 비어 있으면 ②단계가 ★언제나 0건★ 이다.
   *   런북에 적힌 20만 행은 ★로컬 미러 DB★ 였다 — 운영과 다르다.
   */
  clans?: number
  /** 요청 사이 간격(ms). `MIN_DELAY_MS` 아래로는 못 내린다 */
  delayMs?: number
  /** ★참이면 요청을 한 건도 보내지 않는다★ — 무엇을 받을지만 찍는다 */
  dryRun?: boolean
  /** 참이면 DB 에 넣는다. 거짓이면 받기만 하고 안 넣는다 */
  confirm?: boolean
  /** 한 사이클 전후로 부하를 볼 때 부르는 함수. 「쉬어라/멈춰라」를 돌려준다 */
  guard?: () => Promise<'go' | 'pause' | 'stop'>
  log?: (line: string) => void
}

export interface CollectResult {
  /** ①목록 단계 */
  matchList: { clans: number; ok: number; failed: number; inserted: number }
  planned: number
  requested: number
  ok: number
  failed: number
  stored: { inserted: number; duplicated: number; skipped: number }
  stop: StopReason
  /** 마지막으로 본 HTTP 상태들 — 판단 근거를 남긴다 */
  statuses: Record<string, number>
}

/* --------------------------------------------------------------- curl --- */

interface CurlResult {
  status: number
  body: string
  ms: number
}

/**
 * `curl` 을 그대로 실행한다.
 *
 * ⚠ ★헤더를 만들지 않는다★ — `Content-Type` 하나뿐이고 그건 본문의 모양을 알리는 것이지
 *   신원을 꾸미는 것이 아니다. UA·Referer·쿠키는 ★한 개도 넣지 않는다★.
 */
function curl(method: 'GET' | 'POST', path: string, body: string | null): Promise<CurlResult> {
  const args = [
    '-sS',
    '--max-time',
    String(REQUEST_TIMEOUT_S),
    '-w',
    '\\n__STATUS__%{http_code}',
    '-X',
    method,
  ]
  if (body !== null) {
    args.push('-H', 'Content-Type: application/json', '--data', body)
  }
  args.push(`${ORIGIN}${path}`)

  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { windowsHide: true })
    let out = ''
    let err = ''
    let killed = false
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString('utf8')
      /* ★응답이 터무니없이 크면 끊는다★ — 메모리를 통째로 먹게 두지 않는다 */
      if (out.length > MAX_BYTES && !killed) {
        killed = true
        child.kill()
      }
    })
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString('utf8')
    })
    child.on('error', (e) => reject(e))
    child.on('close', () => {
      if (killed) {
        reject(new Error(`응답이 ${MAX_BYTES} 바이트를 넘었다 — 끊었다`))
        return
      }
      const at = out.lastIndexOf('\n__STATUS__')
      if (at < 0) {
        reject(new Error(`curl 이 상태를 안 줬다: ${err.slice(0, 200)}`))
        return
      }
      resolve({
        status: Number(out.slice(at + '\n__STATUS__'.length).trim()),
        body: out.slice(0, at),
        ms: Date.now() - started,
      })
    })
  })
}

/** 클랜의 최근 경기 목록 */
export function fetchClanMatchList(clanSlug: string): Promise<CurlResult> {
  return curl('POST', '/api/ClanHome/GetClanMatchList/', JSON.stringify({ clan_id: clanSlug }))
}

/**
 * 경기 하나의 배틀로그.
 *
 * ⚠ ★본문 `{}` 가 반드시 있어야 한다★ — 없으면 405 다 (D-268).
 */
export function fetchBattleLog(matchKey: string, clanNo: string): Promise<CurlResult> {
  return curl('POST', `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`, '{}')
}

/* --------------------------------------------------------------- 본체 --- */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * ★아직 배틀로그를 안 받은 경기★ 를 고른다.
 *
 * 재료는 `BarracksClanMatchRaw`(무엇이 있는지)이고,
 * 이미 받은 것은 `BarracksBattleLogRaw` 에 있다. 그 차집합이 할 일이다.
 */
export async function pendingPairs(limit: number): Promise<{ matchKey: string; clanNo: string }[]> {
  return prisma.$queryRaw<{ matchKey: string; clanNo: string }[]>`
    SELECT DISTINCT c."matchKey"                        AS "matchKey",
           c."payload"->>'clan_no'                      AS "clanNo"
      FROM "BarracksClanMatchRaw" c
     WHERE c."status" = 'ok'
       AND c."payload"->>'clan_no' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "BarracksBattleLogRaw" b
          WHERE b."matchKey" = c."matchKey" AND b."status" = 'ok'
       )
     ORDER BY c."matchKey" DESC
     LIMIT ${limit}
  `
}

/**
 * ★목록을 받을 IPL 클랜★ 을 고른다.
 *
 * ⚠ ★병영수첩에서 온 것은 IPL 이다★ — SPL·10mountain 클랜을 부르면
 *   그 경기가 IPL 로 들어간다. ★한 건도 새면 안 된다★ (O-044).
 *   그래서 ★`nolink` 리그에 등록된 클랜만★ 고른다.
 *
 * 오래 안 받은 것부터 고른다 — 한 번도 안 받은 클랜이 먼저 온다.
 */
export async function pendingClans(limit: number): Promise<{ slug: string; name: string }[]> {
  return prisma.$queryRaw<{ slug: string; name: string }[]>`
    SELECT c."slug", c."name"
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
      JOIN "Clan" c   ON c."id" = lc."clanId"
     WHERE l."slug" = 'nolink'
     ORDER BY (
       SELECT max(m."fetchedAt") FROM "BarracksClanMatchRaw" m WHERE m."subject" = c."slug"
     ) ASC NULLS FIRST, c."slug"
     LIMIT ${limit}
  `
}

export async function collectBarracks(opts: CollectOptions): Promise<CollectResult> {
  const log = opts.log ?? ((l: string) => console.info(l))
  const delay = Math.max(MIN_DELAY_MS, opts.delayMs ?? DEFAULT_DELAY_MS)
  const result: CollectResult = {
    matchList: { clans: 0, ok: 0, failed: 0, inserted: 0 },
    planned: 0,
    requested: 0,
    ok: 0,
    failed: 0,
    stored: { inserted: 0, duplicated: 0, skipped: 0 },
    stop: 'done',
    statuses: {},
  }

  /* ── ★①단계 · 목록★ — 무엇을 받아야 하는지의 재료를 먼저 만든다 */
  const clanBudget = opts.clans ?? 0
  if (clanBudget > 0) {
    const clans = await pendingClans(clanBudget)
    result.matchList.clans = clans.length
    log(`\n① 목록 — IPL 클랜 ★${clans.length}곳★`)
    if (opts.dryRun) {
      for (const c of clans.slice(0, 5)) log(`   ${c.slug}  (${c.name})`)
      if (clans.length > 5) log(`   … ${clans.length - 5}곳 더`)
    } else {
      const listRows: BarracksRow[] = []
      for (const c of clans) {
        let r: CurlResult
        try {
          r = await fetchClanMatchList(c.slug)
        } catch (e) {
          result.matchList.failed += 1
          log(`  ★못 받았다★ ${c.slug} — ${(e as Error).message}`)
          await sleep(delay)
          continue
        }
        result.statuses[String(r.status)] = (result.statuses[String(r.status)] ?? 0) + 1
        if (r.status === 403 || r.status === 429) {
          result.stop = 'blocked'
          log(`★★${r.status} — 즉시 멈춘다. 우회하지 않는다★★ (${c.slug})`)
          break
        }
        if (r.status !== 200) {
          result.matchList.failed += 1
          log(`  HTTP ${r.status} — 넘어간다 (${c.slug})`)
          await sleep(delay)
          continue
        }
        try {
          listRows.push({
            kind: 'matchlist',
            subject: c.slug,
            raw: JSON.parse(r.body),
          })
          result.matchList.ok += 1
        } catch {
          result.matchList.failed += 1
          log(`  ★JSON 이 아니다★ ${c.slug}`)
        }
        await sleep(delay)
      }
      if (opts.confirm && listRows.length > 0) {
        const stored = await storeBarracksRows(listRows)
        result.matchList.inserted = stored.inserted
        log(`  목록 넣음 ★${stored.inserted}★ · 중복 ${stored.duplicated}`)
      }
    }
    if (result.stop === 'blocked') return result
  }

  /* ── ★②단계 · 배틀로그★ */
  const pairs = await pendingPairs(opts.limit)
  result.planned = pairs.length
  log(`받을 것 ★${pairs.length}건★ · 간격 ${delay}ms · ${opts.dryRun ? '★미리보기(요청 0건)★' : opts.confirm ? '★쓰기★' : '받기만(안 넣는다)'}`)

  if (opts.dryRun) {
    for (const p of pairs.slice(0, 5)) log(`   ${p.matchKey} / ${p.clanNo}`)
    if (pairs.length > 5) log(`   … ${pairs.length - 5}건 더`)
    log('\n★요청을 한 건도 보내지 않았다★')
    if (pairs.length === 0 && (opts.clans ?? 0) === 0) {
      log('⚠ ★목록(①단계)을 안 돌리면 ②단계는 언제나 0건이다★ — `--clans N` 을 준다')
    }
    return result
  }

  const rows: BarracksRow[] = []
  let i = 0
  for (const p of pairs) {
    /*
     * ── 부하를 본다. ★사람이 없으니 이게 유일한 안전장치다★ (O-017 조건)
     *
     * ⚠ ★매 건마다 재면 감시자 자신이 부하가 된다.★ 100건이면 우리 사이트를
     *   100번(콜드 재측정까지 치면 그 이상) 두드린다 — ★재려던 것을 재는 행위가 망친다.★
     *   그래서 ★`GUARD_EVERY` 건마다★ 본다. 첫 건은 시작 전에 이미 쟀다.
     */
    i += 1
    if (opts.guard && i % GUARD_EVERY === 0) {
      const verdict = await opts.guard()
      if (verdict === 'stop') {
        result.stop = 'health'
        log('★사이트가 무겁다 — 이 판을 끝낸다★')
        break
      }
      if (verdict === 'pause') {
        log('  사이트가 조금 무겁다 — 한 사이클 쉰다')
        await sleep(delay * 4)
      }
    }

    let r: CurlResult
    try {
      r = await fetchBattleLog(p.matchKey, p.clanNo)
    } catch (e) {
      result.failed += 1
      log(`  ★못 받았다★ ${p.matchKey} — ${(e as Error).message}`)
      await sleep(delay)
      continue
    }
    result.requested += 1
    result.statuses[String(r.status)] = (result.statuses[String(r.status)] ?? 0) + 1

    if (r.status === 403 || r.status === 429) {
      /* ★첫 403 에서 즉시 멈춘다★ (D-266). 「연속 N건」을 기다리지 않는다 */
      result.stop = 'blocked'
      log(`★★${r.status} — 즉시 멈춘다. 우회하지 않는다★★ (${p.matchKey})`)
      break
    }
    if (r.status === 405) {
      /* 본문을 넣는데도 405 면 ★그때는 진짜 막힌 것이다★ (D-268) */
      result.stop = 'error'
      log('★405 — 본문을 넣었는데도 405 다. 경로가 바뀌었거나 진짜 막혔다★')
      break
    }
    if (r.status !== 200) {
      result.failed += 1
      log(`  HTTP ${r.status} — 넘어간다 (${p.matchKey})`)
      await sleep(delay)
      continue
    }

    let raw: unknown
    try {
      raw = JSON.parse(r.body)
    } catch {
      result.failed += 1
      log(`  ★JSON 이 아니다★ ${p.matchKey} — ${r.body.slice(0, 80)}`)
      await sleep(delay)
      continue
    }
    result.ok += 1
    rows.push({ kind: 'battlelog', matchKey: p.matchKey, subject: p.clanNo, raw })
    if (result.ok % 10 === 0) log(`  ${result.ok}건 받음…`)
    await sleep(delay)
  }

  if (opts.confirm && rows.length > 0) {
    /* ★적재는 창구와 같은 함수다★ — 저장 모양이 갈리면 같은 응답이 두 행이 된다 */
    const stored = await storeBarracksRows(rows)
    result.stored = {
      inserted: stored.inserted,
      duplicated: stored.duplicated,
      skipped: stored.skipped,
    }
  }

  log(
    `\n계획 ${result.planned} · 요청 ★${result.requested}★ · 받음 ★${result.ok}★ · 실패 ${result.failed}` +
      `\n넣음 ★${result.stored.inserted}★ · 중복 ${result.stored.duplicated} · 건너뜀 ${result.stored.skipped}` +
      `\n멈춘 이유 ★${result.stop}★ · 상태 ${JSON.stringify(result.statuses)}`,
  )
  /*
   * ⚠ ★「0건 들어옴」과 「못 가져옴」을 갈라 놓는다★
   *   15분 사이에 새 경기가 없을 수 있다. 안 갈라 놓으면 ★멈춘 걸 조용히 넘어간다★ —
   *   실제로 사흘 멈춰 있던 적이 있다
   */
  if (result.requested > 0 && result.ok === 0) {
    log('★★받은 건수 0 인데 요청은 나갔다 — 이건 「새 경기가 없음」이 아니라 실패다★★')
    result.stop = 'error'
  } else if (result.planned === 0) {
    log('★받을 것이 없다 (새 경기가 없다) — 이건 정상이다★')
  }
  return result
}
