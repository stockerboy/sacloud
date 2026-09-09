/**
 * ★★병영수첩 클랜원 명부를 받아 온다★★ (2026-09-09 · 사장님 지시 「1단계부터 가」)
 *
 * ── ★왜 필요한가★
 *   > "소속 보는법은 병영수첩가서 보면 소속클랜 나와 병영수첩기준으로 계속 실시간으로
 *   >  반영돼야하는데 애초에 반영도 안되네" — 사장님, 2026-09-09
 *
 *   배틀로그는 ★「이 팀으로 뛰었다」까지만★ 알려 준다. 용병으로 뛰면 그 팀이 소속으로
 *   박힌다 (실측 16명 어긋남 — `아트애플` 은 화면 `ceIestial` · 병영수첩 `Atraxia`).
 *   ★진짜 소속은 병영수첩 클랜원 명부에만 있다.★
 *
 *   그 명부를 ★2026-08-31 에 사람이 브라우저 콘솔로 딱 한 번★ 받아 온 뒤로
 *   9일간 갱신이 없었다 (`scripts/ipl-clan-members-snippet.js` · `iplMemberImport.ts`).
 *   이 잡이 그 수동 절차를 대신한다.
 *
 * ── ★요청 모양★ (2026-09-09 실측)
 *   ```
 *   POST /api/ClanHome/GetClanUserList   {"clan_id": "<클랜 slug>"}
 *     → { rtnCode: 0, resultClanUserList: [{ str_usn, user_nexon_sn, user_nick,
 *                                            clan_level, clan_exp, conn_flag, ... }] }
 *   ```
 *   ⚠ `clan_no` 가 아니라 ★`clan_id`(= slug)★ 다. 클랜번호를 먼저 물을 필요가 없어
 *   클랜 하나에 ★요청 한 번★ 이면 된다.
 *
 * ── ★관측으로 쌓는다. 덮어쓰지 않는다★
 *   명부는 바뀐다. 그래서 `observedAt` 을 함께 박는다. 「지금 명단」이 아니라
 *   ★「그때 본 명단」★ 이다. 옛 관측을 지우지 않는다 (`CLAUDE.md` 2장 2번).
 *
 * ── 원본에 대한 예의
 *   ★한 번에 하나씩★ 부르고 사이를 띄운다. 재시도하지 않는다.
 *   403/429 를 보면 ★그 자리에서 멈춘다★ — 수집기와 같은 규칙이다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon barracks-roster                     # 미리보기
 * pnpm --filter @sacloud/worker nexon barracks-roster --confirm           # 반영
 * pnpm --filter @sacloud/worker nexon barracks-roster --league nolink     # 한 리그만
 * pnpm --filter @sacloud/worker nexon barracks-roster --limit 5           # 몇 곳만
 * ```
 */
import { spawn } from 'node:child_process'
import { prisma } from '@sacloud/db'
/* ★수집기와 같은 길을 탄다★ — 서버(VPS)에서는 curl 이 403 이고 크롬만 200 이다 */
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from '../nexon/browserFetch.js'
import { log, warn } from '../lib/log.js'

const ORIGIN = 'https://barracks.sa.nexon.com'
const PATH = '/api/ClanHome/GetClanUserList'

/** 기본 대상 — 화면에 클랜이 뜨는 리그 셋 (사장님: «IPL 이나 SPL 열산 셋 다») */
const DEFAULT_LEAGUES = ['nolink', 'supply', 'sanply'] as const

/** 요청 사이 간격. 수집기(`barracksCollect`)와 같은 값이다 */
const DEFAULT_DELAY_MS = 1500
/** 이 밑으로는 못 내린다 */
const MIN_DELAY_MS = 1000
const REQUEST_TIMEOUT_S = 25
/** 응답이 이보다 크면 끊는다 — 메모리를 통째로 먹게 두지 않는다 */
const MAX_BYTES = 4_000_000

export interface BarracksRosterResult {
  leagues: string[]
  /** 명부를 물어본 클랜 수 */
  asked: number
  /** 명단을 받은 클랜 수 */
  ok: number
  /** 응답은 왔는데 명단이 비어 있던 클랜 (해체·비공개일 수 있다) */
  empty: number
  /** 요청이 실패한 클랜 */
  failed: number
  /** 받은 사람 수(중복 포함) */
  members: number
  /** 실제로 넣은 줄 수 */
  written: number
  /** 막혀서 중간에 멈췄나 */
  blocked: boolean
  confirmed: boolean
  observedAt: Date
  /** 실패한 클랜 목록 (앞부분만) */
  failures: Array<{ slug: string; reason: string }>
  /** 시간이 다 되어 스스로 멈췄나 — 남은 곳은 다음 판이 이어받는다 */
  timeUp: boolean
  /** 아직 안 받은 클랜 수 */
  remaining: number
}

interface CurlResult {
  status: number
  body: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * ★헤더를 만들지 않는다★ — `Content-Type` 하나뿐이고 그건 본문의 모양을 알리는 것이지
 * 신원을 꾸미는 것이 아니다. UA·Referer·쿠키는 한 개도 넣지 않는다.
 * (수집기 `barracksCollect.ts` 와 같은 규칙)
 */
function curlPost(path: string, body: string): Promise<CurlResult> {
  const args = [
    '-sS',
    '--max-time',
    String(REQUEST_TIMEOUT_S),
    '-w',
    '\\n__STATUS__%{http_code}',
    '-X',
    'POST',
    '-H',
    'Content-Type: application/json',
    '--data',
    body,
    `${ORIGIN}${path}`,
  ]
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { windowsHide: true })
    let out = ''
    let killed = false
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString('utf8')
      if (out.length > MAX_BYTES && !killed) {
        killed = true
        child.kill()
      }
    })
    child.on('error', reject)
    child.on('close', () => {
      if (killed) return reject(new Error('응답이 너무 크다'))
      const at = out.lastIndexOf('__STATUS__')
      if (at < 0) return reject(new Error('상태코드를 못 읽었다'))
      resolve({ status: Number(out.slice(at + 10).trim()), body: out.slice(0, at) })
    })
  })
}

/**
 * ★부르는 길이 두 개다★ — `barracksCollect.ts` 와 ★같은 규칙★ 이다.
 *
 * ```
 *   기본                  curl    — 노트북(집 IP)에서는 200 이고 더 빠르다
 *   SACLOUD_FETCH=chrome  진짜 크롬 안에서 부른다 — ★서버(VPS)는 이것뿐★
 * ```
 * 국내 VPS 에서 재 보면 ★크롬 200 · curl 403★ 이다. 서버 IP 가 막힌 게 아니라
 * ★「브라우저가 아닌 요청」을 막는다.★ 그래서 여기서 길을 새로 만들지 않고 그대로 쓴다.
 */
async function callBarracks(path: string, body: string): Promise<CurlResult> {
  if (!useChromeFetch()) return curlPost(path, body)
  const r = await barracksBrowser().call('POST', path, body)
  return { status: r.status, body: r.body }
}

interface RawMember {
  str_usn?: string
  user_nexon_sn?: number | string
  user_nick?: string
  clan_level?: string
  clan_exp?: string
  conn_flag?: number | string
  punish_flag?: number | string
  auth_flag?: string
}

export async function runBarracksRoster(input: {
  leagues?: string[]
  limit?: number
  delayMs?: number
  /**
   * ★끊긴 판을 이어받는다★ (2026-09-09 실측 — 10분 제한에 걸려 151/461 에서 끊겼다).
   *
   * 가장 최근 관측이 이 분 수 안이면 ★그 관측을 그대로 이어 쓰고★
   * 이미 받은 클랜은 건너뛴다. 그래야 한 벌의 명부가 ★두 시각으로 갈라지지 않는다★ —
   * 갈라지면 `clan-affiliation` 이 `MAX(observedAt)` 만 보므로 절반이 사라진다.
   *
   * 기본값 0 = 이어받지 않고 새 관측을 시작한다 (지금까지의 동작 그대로).
   */
  resumeWithinMin?: number
  /**
   * ★스스로 시간을 재고 멈춘다★ (2026-09-09).
   *
   * 한 판이 30분쯤 걸리는데 실행 환경마다 제한이 다르다. 밖에서 끊기면
   * ★끊긴 자리를 알 수 없다.★ 그래서 안에서 재고 ★클랜 하나를 끝낸 뒤★ 멈춘다.
   * 이어받기(`resumeWithinMin`)와 짝이라 다음 판이 그대로 잇는다.
   *
   * 기본값 0 = 끝까지 간다.
   */
  maxMinutes?: number
  confirm: boolean
}): Promise<BarracksRosterResult> {
  const leagues = input.leagues?.length ? input.leagues : [...DEFAULT_LEAGUES]
  const delay = Math.max(MIN_DELAY_MS, input.delayMs ?? DEFAULT_DELAY_MS)

  /* 이어받을 관측이 있나 */
  let observedAt = new Date()
  let done = new Set<string>()
  const within = input.resumeWithinMin ?? 0
  if (within > 0) {
    const head = await prisma.$queryRaw<Array<{ observedAt: Date | null }>>`
      SELECT MAX("observedAt") AS "observedAt" FROM "BarracksClanMember"`
    const last = head[0]?.observedAt ?? null
    if (last && Date.now() - last.getTime() <= within * 60_000) {
      observedAt = last
      const had = await prisma.$queryRaw<Array<{ clanSlug: string }>>`
        SELECT DISTINCT "clanSlug" FROM "BarracksClanMember" WHERE "observedAt" = ${last}`
      done = new Set(had.map((r) => r.clanSlug))
      log(`이어받는다 — ${last.toISOString()} 관측에 이미 ${done.size}곳이 들어 있다`)
    }
  }

  /* 대상 클랜 — 같은 클랜이 여러 리그에 있으면 ★한 번만★ 부른다 */
  const rows = await prisma.$queryRaw<Array<{ slug: string; name: string; clanId: string }>>`
    SELECT DISTINCT c."slug", c."name", c."id" AS "clanId"
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE l."slug" = ANY(${leagues})
     ORDER BY c."slug"`
  const targets = input.limit ? rows.slice(0, input.limit) : rows

  const result: BarracksRosterResult = {
    leagues,
    asked: 0,
    ok: 0,
    empty: 0,
    failed: 0,
    members: 0,
    written: 0,
    blocked: false,
    confirmed: input.confirm,
    observedAt,
    failures: [],
    timeUp: false,
    remaining: 0,
  }
  const deadline = input.maxMinutes ? Date.now() + input.maxMinutes * 60_000 : null

  for (const clan of targets) {
    /* 이어받는 판이면 이미 받은 곳은 건드리지 않는다 */
    if (done.has(clan.slug)) continue
    /* ★시간이 다 됐으면 클랜 사이에서 깔끔하게 멈춘다★ */
    if (deadline && Date.now() > deadline) {
      result.timeUp = true
      break
    }
    result.asked += 1
    let res: CurlResult
    try {
      res = await callBarracks(PATH, JSON.stringify({ clan_id: clan.slug }))
    } catch (error) {
      result.failed += 1
      if (result.failures.length < 20)
        result.failures.push({ slug: clan.slug, reason: String(error) })
      await sleep(delay)
      continue
    }

    /* ★막히면 그 자리에서 멈춘다.★ 재시도하지 않는다 (수집기와 같은 규칙) */
    if (res.status === 403 || res.status === 429) {
      warn(`병영수첩이 막았다 (HTTP ${res.status}) — ${clan.slug} 에서 멈춘다`)
      result.blocked = true
      break
    }
    if (res.status !== 200) {
      result.failed += 1
      if (result.failures.length < 20)
        result.failures.push({ slug: clan.slug, reason: `HTTP ${res.status}` })
      await sleep(delay)
      continue
    }

    let list: RawMember[] = []
    try {
      const doc = JSON.parse(res.body) as {
        rtnCode?: number
        resultClanUserList?: RawMember[] | null
      }
      /* `rtnCode` 가 0 이 아니면 명단이 없는 것이다. ★지어내지 않는다★ */
      if (doc.rtnCode !== 0) {
        result.failed += 1
        if (result.failures.length < 20)
          result.failures.push({ slug: clan.slug, reason: `rtnCode ${doc.rtnCode}` })
        await sleep(delay)
        continue
      }
      list = doc.resultClanUserList ?? []
    } catch {
      result.failed += 1
      if (result.failures.length < 20)
        result.failures.push({ slug: clan.slug, reason: 'JSON 아님' })
      await sleep(delay)
      continue
    }

    if (list.length === 0) {
      result.empty += 1
      await sleep(delay)
      continue
    }
    result.ok += 1
    result.members += list.length

    if (input.confirm) {
      /* 같은 관측 시각에 같은 사람이 두 번 들어오지 않게 계정으로 한 번 접는다 */
      const seen = new Set<string>()
      const values: Array<{
        clanSlug: string
        clanName: string
        strUsn: string
        userNexonSn: string
        userNick: string | null
        clanLevel: string | null
        clanExp: string | null
        connFlag: number
        punishFlag: number
        authFlag: string | null
      }> = []
      for (const m of list) {
        const usn = m.str_usn?.trim()
        if (!usn || seen.has(usn)) continue
        seen.add(usn)
        values.push({
          clanSlug: clan.slug,
          clanName: clan.name,
          strUsn: usn,
          userNexonSn: String(m.user_nexon_sn ?? ''),
          userNick: m.user_nick ?? null,
          clanLevel: m.clan_level ?? null,
          clanExp: m.clan_exp ?? null,
          connFlag: Number(m.conn_flag ?? 0) || 0,
          punishFlag: Number(m.punish_flag ?? 0) || 0,
          authFlag: m.auth_flag ?? null,
        })
      }
      for (const v of values) {
        await prisma.$executeRaw`
          INSERT INTO "BarracksClanMember"
            ("id","clanSlug","clanName","strUsn","userNexonSn","userNick",
             "clanLevel","clanExp","connFlag","punishFlag","authFlag","observedAt")
          VALUES (gen_random_uuid()::text, ${v.clanSlug}, ${v.clanName}, ${v.strUsn},
                  ${v.userNexonSn}, ${v.userNick}, ${v.clanLevel}, ${v.clanExp},
                  ${v.connFlag}, ${v.punishFlag}, ${v.authFlag}, ${observedAt})
          ON CONFLICT ("clanSlug","strUsn","observedAt") DO NOTHING`
        result.written += 1
      }
    }

    await sleep(delay)
  }

  /* 아직 안 받은 곳 — 다음 판이 이어받을 수 */
  {
    const got = new Set(done)
    if (input.confirm) {
      const had = await prisma.$queryRaw<Array<{ clanSlug: string }>>`
        SELECT DISTINCT "clanSlug" FROM "BarracksClanMember" WHERE "observedAt" = ${observedAt}`
      for (const r of had) got.add(r.clanSlug)
    }
    result.remaining = targets.filter((c) => !got.has(c.slug)).length
  }

  /* ★띄운 크롬을 닫는다★ — 안 닫으면 프로필이 /tmp 에 쌓인다 (2026-09-09 P0 의 원인) */
  if (useChromeFetch()) closeBarracksBrowser()

  log(
    `명부 ${result.asked}곳 물어봄 · 받음 ${result.ok} · 빈곳 ${result.empty} · 실패 ${result.failed} · ` +
      `사람 ${result.members}명 · 넣음 ${result.written}줄` +
      `${result.timeUp ? ` · ★시간이 되어 멈춤 — 남은 곳 ${result.remaining}★` : ''}` +
      `${result.confirmed ? '' : ' (미리보기)'}`,
  )
  return result
}
