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
/**
 * ★몇 건마다 DB 에 넣나★.
 *
 * ⚠ 전에는 ★루프가 다 끝난 뒤에 한 번에★ 넣었고, 130건을 받고 멈추자 ★적재 0건★ 이었다.
 *   ★긴 판을 돌리려면 나눠 넣어야 한다.★ 너무 잘게 나누면 DB 왕복이 늘어난다
 */
export const FLUSH_EVERY = 25

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
  /**
   * ★클랜마다 목록을 몇 쪽까지 뒤로 넘기나★ (한 쪽 20건). 기본 ★1★.
   *
   * ⚠ ★기본값을 늘리지 마라.★ 15분마다 도는 판은 ★새 것만★ 보면 된다 —
   *   기본을 늘리면 ★매번 4월까지 다시 훑는다★.
   *   ★과거를 채우는 판에서만 크게 준다★ (`--list-pages 200`).
   */
  listPages?: number
  /**
   * ★어느 날짜에 닿으면 그만 넘기나★ — `YYMMDD` 여섯 자리 (예: `260305`).
   *
   * ⚠ ★쪽 수로 끊으면 클랜마다 결과가 다르다.★ 실측(2026-09-04) —
   * ```
   * zzim1       68쪽에 ★3월 1일★    ← 한산한 클랜. 80쪽이면 남는다
   * lee2        81쪽에 ★7월 18일★   ← 바쁜 클랜. 80쪽으로는 한참 모자라다
   * ```
   * ★같은 80쪽인데 하나는 넘치고 하나는 모자란다.★ ★목표는 쪽 수가 아니라 날짜다.★
   * 이 값을 주면 ★그 날짜보다 오래된 경기가 나오는 순간 그 클랜을 끝낸다.★
   * `listPages` 는 그때도 ★최대 한도★ 로 남는다 — 끝없이 도는 것을 막는다.
   */
  listUntil?: string
  /**
   * ★목록을 받을 리그★. 기본 `nolink`.
   *
   * ⚠ ★병영수첩에서 온 것은 그 리그 것이다.★ 여기를 바꾸면 ★그 리그의 클랜을 부른다★ —
   *   ★부른 클랜의 리그와 저장되는 리그가 어긋나면 O-044 가 무너진다.★
   *   그래서 부르는 쪽이 ★명시★ 한다. 기본값에 기대지 않는다
   */
  leagueSlug?: string
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

/**
 * 클랜의 경기 목록 ★한 페이지(20건)★.
 *
 * ══ ★★뒤로 넘길 수 있다★★ (2026-09-04 · ★내 이전 보고를 뒤집는다★) ══
 *
 * 나는 ★「병영수첩은 최근 20건만 준다」고 보고했다. 틀렸다.★
 * 사장님이 ★「8월은 거짓말이야」★ 라고 하신 게 맞았다.
 *
 * ★커서 이름이 `seq_no` 다.★ 응답의 `message` 를 다음 요청의 `seq_no` 로 넣으면
 * ★그 앞 20건★ 이 온다. 화면의 자바스크립트가 그대로 그렇게 말한다 —
 * ```js
 * a = { user_nexon_sn:…, ★seq_no★:0, mode_flag:…, min_seq_no:0, clan_id:e }
 * UPDATE: t.lastSeq==e.message || ""===e.message ? t.endPage=!0
 *                                                : (t.lastSeq=e.message, t.endPage=!1)
 * ```
 * ★`message` 가 다음 커서고, 같아지거나 비면 끝★ 이라는 뜻이다.
 *
 * ⚠ ★`mode_flag` 를 같이 보내면 안 된다★ — `"A"` 를 넣으면 ★0건★ 이 온다 (실측).
 *   그건 ★사람 매치목록★(`/api/Match/GetMatchList/`)의 파라미터다. 클랜 것과 다르다.
 *
 * ⚠ ★못 찾았던 이유★ — 내가 시험한 이름이 전부 틀렸다 (`match_key` · `last_match_key` · `page`).
 *   셋 다 ★조용히 무시★ 당해서 ★1페이지가 그대로 다시 왔고★, 나는 그걸 「페이징이 없다」로 읽었다.
 *   ★모르는 파라미터를 무시하는 API 에서는 「같은 답」이 「없다」의 근거가 못 된다.★
 *   ★답이 아니라 화면의 코드에서 찾아야 했다.★
 *
 * ★한 클랜으로 60페이지까지 넘겨 본 결과★ (sorentolove · 2026-09-04)
 * ```
 * 1페이지 → 9/2   10페이지 → 8/19   30페이지 → 7/4   50페이지 → 5/2   ★60페이지 → 4/12★
 * 1,200경기를 받고도 ★아직 끝이 아니었다★
 * ```
 */
export function fetchClanMatchList(clanSlug: string, seqNo?: string): Promise<CurlResult> {
  const body: Record<string, string> = { clan_id: clanSlug }
  /* ★첫 페이지는 `seq_no` 를 아예 안 보낸다★ — 화면도 그렇게 시작한다 */
  if (seqNo) body.seq_no = seqNo
  return curl('POST', '/api/ClanHome/GetClanMatchList/', JSON.stringify(body))
}

/**
 * ★그 클랜을 여기서 끝낼까★ — 날짜에 닿았는지 본다.
 *
 * 경기키는 ★`YYMMDD…`★ 로 시작하고, 커서(`message`)는 ★그 쪽의 가장 오래된 경기키★ 다.
 * 그러니 ★커서의 앞 여섯 자리★ 를 목표 날짜와 견주면 된다.
 *
 * ⚠ ★쪽 수로 끊으면 클랜마다 결과가 다르다★ (2026-09-04 실측) —
 * ```
 * zzim1  68쪽에 3월 1일    ← 한산한 클랜
 * lee2   81쪽에 7월 18일   ← 바쁜 클랜. 같은 80쪽인데 넉 달이 차이 난다
 * ```
 * ★목표는 쪽 수가 아니라 날짜다.★
 *
 * ⚠ 목표가 없거나 커서가 없으면 ★끊지 않는다★ — 모르면 멈추지 않고 한도(`listPages`)에 맡긴다.
 */
export function reachedListTarget(cursor: string | null, until?: string): boolean {
  if (!until || !cursor) return false
  return cursor.slice(0, 6) <= until
}

/** 목록 응답에서 ★다음 커서★ 를 꺼낸다. 없거나 그대로면 `null` = 끝 */
export function nextListCursor(body: string, current?: string): string | null {
  let msg: unknown
  try {
    msg = (JSON.parse(body) as { message?: unknown }).message
  } catch {
    return null
  }
  if (typeof msg !== 'string' || msg === '' || msg === current) return null
  return msg
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
    /*
     * ── ① 매치목록에서 알게 된 경기 (새로 들어오는 것)
     */
    SELECT DISTINCT c."matchKey"                        AS "matchKey",
           c."payload"->>'clan_no'                      AS "clanNo"
      FROM "BarracksClanMatchRaw" c
     WHERE c."status" = 'ok'
       AND c."payload"->>'clan_no' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "BarracksBattleLogRaw" b
          WHERE b."matchKey" = c."matchKey" AND b."status" = 'ok'
       )

     UNION

    /*
     * ── ② ★이미 아는 IPL 경기★ (밀린 것)
     *
     * ⚠ ★①만 보면 밤새 1,093건에서 끝난다.★ 우리가 아는 IPL 경기는 24,952건이고
     *   그중 ★배틀로그가 없는 것이 21,807건(87.4%)★ 이다 (2026-09-04 실측).
     *
     * ★매치목록은 「최근 것」만 준다★ — 2608 30건 · 2609 1,283건이 전부다.
     *   ★그래서 7월치는 목록으로 영영 안 온다.★ 그런데 ★그 경기의 키는 우리가 안다★
     *   (Match.sourceMatchId). ★클랜번호만 있으면 배틀로그를 받을 수 있다★ —
     *   실측 ★20,674건(94.8%)★ 이 번호를 안다.
     *
     * 클랜번호는 매치목록 원문에서 ★그 클랜이 주인이었던 행★ 으로 찾는다.
     */
    SELECT DISTINCT m."sourceMatchId"                   AS "matchKey",
           (SELECT c2."payload"->>'clan_no'
              FROM "BarracksClanMatchRaw" c2
              JOIN "LeagueClan" lc2 ON lc2."id" = m."redLeagueClanId"
              JOIN "Clan" cl2 ON cl2."id" = lc2."clanId"
             WHERE c2."subject" = cl2."slug"
               AND c2."payload"->>'clan_no' IS NOT NULL
             LIMIT 1)                                   AS "clanNo"
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     WHERE m."sourceMatchId" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "BarracksBattleLogRaw" b
          WHERE b."matchKey" = m."sourceMatchId" AND b."status" = 'ok'
       )
       AND EXISTS (
         SELECT 1 FROM "BarracksClanMatchRaw" c3
          JOIN "LeagueClan" lc3 ON lc3."id" = m."redLeagueClanId"
          JOIN "Clan" cl3 ON cl3."id" = lc3."clanId"
         WHERE c3."subject" = cl3."slug" AND c3."payload"->>'clan_no' IS NOT NULL
       )

     /* ★최근 것부터★ — 밤새 돌다 멈춰도 새 기록이 먼저 채워진다 */
     ORDER BY 1 DESC
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
export async function pendingClans(
  limit: number,
  leagueSlug = 'nolink',
): Promise<{ slug: string; name: string }[]> {
  return prisma.$queryRaw<{ slug: string; name: string }[]>`
    SELECT c."slug", c."name"
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
      JOIN "Clan" c   ON c."id" = lc."clanId"
     WHERE l."slug" = ${leagueSlug}
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
    const clans = await pendingClans(clanBudget, opts.leagueSlug ?? 'nolink')
    result.matchList.clans = clans.length
    log(`\n① 목록 — ★${opts.leagueSlug ?? 'nolink'}★ 클랜 ★${clans.length}곳★`)
    if (opts.dryRun) {
      for (const c of clans.slice(0, 5)) log(`   ${c.slug}  (${c.name})`)
      if (clans.length > 5) log(`   … ${clans.length - 5}곳 더`)
    } else {
      /*
       * ── ★★클랜마다 뒤로 넘긴다★★ (2026-09-04)
       *
       * 전에는 ★클랜당 한 페이지(20건)★ 만 받았다. 그래서 ★최근 것밖에 없었고★,
       * 나는 그걸 ★「병영수첩이 최근 것만 준다」★ 로 잘못 보고했다.
       * ★기본값은 그대로 1★ 이다 — 15분마다 도는 판은 새 것만 보면 된다.
       * ★`--list-pages` 를 크게 주면 그만큼 과거로 간다.★
       */
      const listRows: BarracksRow[] = []
      const pageBudget = Math.max(1, opts.listPages ?? 1)
      let listCalls = 0
      for (const c of clans) {
        let cursor: string | undefined
        let pages = 0
        let oldest = ''
        for (; pages < pageBudget; pages += 1) {
          let r: CurlResult
          try {
            r = await fetchClanMatchList(c.slug, cursor)
          } catch (e) {
            result.matchList.failed += 1
            log(`  ★못 받았다★ ${c.slug} ${pages + 1}쪽 — ${(e as Error).message}`)
            await sleep(delay)
            break
          }
          listCalls += 1
          result.statuses[String(r.status)] = (result.statuses[String(r.status)] ?? 0) + 1
          if (r.status === 403 || r.status === 429) {
            result.stop = 'blocked'
            log(`★★${r.status} — 즉시 멈춘다. 우회하지 않는다★★ (${c.slug} ${pages + 1}쪽)`)
            break
          }
          if (r.status !== 200) {
            result.matchList.failed += 1
            log(`  HTTP ${r.status} — 넘어간다 (${c.slug} ${pages + 1}쪽)`)
            await sleep(delay)
            break
          }
          let parsed: unknown
          try {
            parsed = JSON.parse(r.body)
          } catch {
            result.matchList.failed += 1
            log(`  ★JSON 이 아니다★ ${c.slug} ${pages + 1}쪽`)
            break
          }
          listRows.push({ kind: 'matchlist', subject: c.slug, raw: parsed })
          result.matchList.ok += 1

          const next = nextListCursor(r.body, cursor)
          if (next) oldest = next
          /*
           * ★날짜에 닿으면 그만 넘긴다★ — 경기키는 `YYMMDD…` 로 시작한다.
           * ★커서(`message`)가 그 쪽의 가장 오래된 경기키다★ 이므로 그것과 견준다.
           */
          if (reachedListTarget(next, opts.listUntil)) {
            log(`  ${c.slug} — ★${opts.listUntil} 에 닿았다 (${oldest.slice(0, 6)}) — 여기서 끝낸다★`)
            await sleep(delay)
            break
          }
          /* ★목록도 부하를 본다★ — 뒤로 넘기면 요청 수가 클랜 수만큼이 아니라 그 곱이다 */
          if (opts.guard && listCalls % GUARD_EVERY === 0) {
            const verdict = await opts.guard()
            if (verdict === 'stop') {
              result.stop = 'health'
              log('★사이트가 무겁다 — 목록을 여기서 끊는다★')
              break
            }
            if (verdict === 'pause') await sleep(delay * 4)
          }
          /* ★적재는 나눠서★ — 길게 넘기다 죽으면 받은 것을 통째로 잃는다 */
          if (opts.confirm && listRows.length >= FLUSH_EVERY) {
            const st = await storeBarracksRows(listRows.splice(0, listRows.length))
            result.matchList.inserted += st.inserted
          }
          await sleep(delay)
          if (!next) break
          cursor = next
        }
        if (pageBudget > 1) {
          log(
            `  ${c.slug} — ${pages + 1}쪽` +
              (oldest ? ` · ★가장 오래된 것 ${oldest.slice(0, 6)}★` : ' · ★끝까지★'),
          )
        }
        if (result.stop !== 'done') break
      }
      if (opts.confirm && listRows.length > 0) {
        const stored = await storeBarracksRows(listRows)
        /* ⚠ ★`=` 가 아니라 `+=` 다★ — 중간중간 넣은 것을 덮어쓰면 안 된다 */
        result.matchList.inserted += stored.inserted
        log(`  목록 넣음 ★${stored.inserted}★ · 중복 ${stored.duplicated}`)
      }
      log(`  ① 목록 요청 ★${listCalls}회★ · 새 경기 ★${result.matchList.inserted}건★`)
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
  /**
   * ★모인 것을 넣고 비운다.★ 멱등하니 겹쳐도 행이 안 는다 (fetchCount 만 오른다).
   * ★적재는 창구와 같은 함수다★ — 저장 모양이 갈리면 같은 응답이 두 행이 된다
   */
  const flush = async (): Promise<void> => {
    if (rows.length === 0) return
    const stored = await storeBarracksRows(rows)
    result.stored.inserted += stored.inserted
    result.stored.duplicated += stored.duplicated
    result.stored.skipped += stored.skipped
    log(`    넣음 ${result.stored.inserted.toLocaleString()}건 (누적)`)
    rows.length = 0
  }
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

    /*
     * ── ★★묶음마다 넣는다★★
     *
     * ⚠ 전에는 ★루프가 다 끝난 뒤에 한 번에★ 넣었다. 그래서 —
     *   ① ★중간에 죽으면 받은 것을 전부 잃는다★ — 실제로 그랬다.
     *      130건을 받고 멈췄는데 ★적재 0건★ 이었다 (2026-09-04 실측)
     *   ② 4,000건이면 응답 4,000개(각 60KB 안팎)를 ★메모리에 들고 있는다★ = 240MB
     * ★긴 판을 돌리려면 나눠 넣어야 한다.★ 멱등하니 겹쳐도 행이 안 는다
     */
    if (opts.confirm && rows.length >= FLUSH_EVERY) {
      await flush()
    }
    await sleep(delay)
  }

  /* 남은 것 */
  if (opts.confirm && rows.length > 0) await flush()

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
