import { prisma } from '@sacloud/db'
import { storeBarracksRows, type BarracksRow } from '@sacloud/db/ops'

import { log, warn } from './lib/log.js'
import { closeBarracksBrowser, useChromeFetch } from './nexon/browserFetch.js'
import { fetchClanMatchList, DEFAULT_DELAY_MS } from './jobs/barracksCollect.js'

/**
 * ★★뜨거운 클랜 상시 수신구★★ (2026-09-22 · 사장님 지시)
 *
 * > 「기록 지연 3분내로 줄여줘 명단받기1분내>경기분석2내> 총 2분내로」
 * > 「진짜 빨리 캐치하는 법 알려줘?」
 *
 * ── 왜 이게 필요한가 (실측 2026-09-22)
 *
 *   메인 수집 한 바퀴는 ★120곳을 1.5초 간격으로★ 묻는다 — 그것만으로 ★180초★ 다.
 *   실측 한 바퀴가 240~700초 걸렸다. ★한 클랜이 다시 오기까지 한 바퀴를 통째로
 *   기다려야 한다★ — 그게 사장님이 겪으신 10~29분의 정체다.
 *
 *   ★간격(1.5초)을 줄이면 병영이 막는다★ — 우회하지 않는다 (D-266).
 *   ★한 바퀴에 도는 클랜을 줄이면 조용한 클랜이 굶는다.★
 *
 * ── 그래서 «정보갱신 수신구» 와 같은 길을 낸다
 *
 *   정보갱신도 처음엔 ★큐 → 1분 예약★ 이라 느렸다. ★VPS 안에 상시 수신구를
 *   하나 세워 두니 5초로 줄었다★ (renewServer.ts, 2026-09-21).
 *
 *   여기도 같은 모양이다 — ★크롬을 매번 새로 켜지 않는다.★ 이 파일 하나가
 *   ★크롬 한 대를 계속 띄워 둔 채★ 90초마다 ★최근에 뛴 클랜만★ 짧게 훑는다.
 *   90초 동안 도는 클랜(30~50곳)이 메인 수집의 120곳보다 훨씬 적어서
 *   ★한 바퀴가 몇 초~1분★ 이면 끝난다.
 *
 * ── 이 수신구가 하는 일은 ★원문 줍기까지★ 다
 *
 *   경기를 만들고(정규화) · 명단을 채우고 · 분석하는 일은 ★건드리지 않는다★ —
 *   그 예약들(project.sh · lineup.sh · hex.sh)이 이미 5~10분마다 돈다.
 *   ★원문이 빨리 들어오면 그 예약들도 빨리 찾아낸다.★ 한 가지 일만 잘한다.
 *
 * ── ★뜨겁다★ 의 뜻
 *
 *   최근 `HOT_WINDOW_MINUTES` 분 안에 경기가 있던 클랜. 그 경기 자체가 아니라
 *   ★그 클랜이 지금 뛰고 있다는 사실★ 을 신호로 쓴다 — 한 판 뛴 클랜은 보통
 *   연달아 뛴다.
 *
 * ── 지키는 것
 *
 *   ⚠ ★크롬 한 대★ — 메인 수집(autocollect.sh)과 ★서로 다른 크롬★ 이다.
 *     둘 다 가볍게 켜 두는 것이지 무겁게 새로 켜는 게 아니다 (renew-server 와 같다).
 *   ⚠ ★간격은 그대로 1.5초★ — 메인 수집과 똑같은 예의를 지킨다.
 *   ⚠ ★막히면(403/429) 그 자리에서 멈춘다★ — 우회하지 않는다 (D-266).
 *     한 번 막히면 이 수신구는 죽지 않고 ★다음 틱까지 쉰다★ (systemd 가 아니라
 *     이 파일 안에서 쉰다 — 재시작을 반복하면 병영을 더 두드리게 된다).
 *   ⚠ ★목록만 받는다★ — 뒤로 넘기지 않는다(1쪽). 뜨거운 클랜은 최근 것만 보면 된다.
 *   ⚠ 되돌리려면 이 수신구를 끄면 된다 — 메인 수집은 그대로 돈다 (CLAUDE.md 1-4).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon hot-clan-server
 * ```
 */

/** 상시 대기 포트 — 헬스체크만 받는다 (systemd 가 살았는지 볼 자리) */
const PORT = Number(process.env.HOT_CLAN_PORT ?? '8788')

/** 몇 초마다 훑나 — 메인 수집(180초 바닥)보다 훨씬 짧다 */
const TICK_MS = Number(process.env.HOT_CLAN_TICK_MS ?? '90_000'.replace('_', ''))

/** 몇 분 안에 뛴 클랜을 «뜨겁다» 로 보나 */
const HOT_WINDOW_MINUTES = Number(process.env.HOT_CLAN_WINDOW_MIN ?? '90')

/** 한 틱에 최대 몇 곳까지 — 너무 많으면 틱 하나가 다음 틱을 침범한다 */
const MAX_CLANS_PER_TICK = Number(process.env.HOT_CLAN_MAX ?? '50')

const delay = DEFAULT_DELAY_MS

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface TickResult {
  clans: number
  requested: number
  inserted: number
  blocked: boolean
}

/** ★뜨거운 클랜★ — 최근 `HOT_WINDOW_MINUTES` 분 안에 경기가 있던 클랜의 slug */
async function hotClanSlugs(): Promise<{ slug: string; name: string }[]> {
  return prisma.$queryRaw<{ slug: string; name: string }[]>`
    SELECT DISTINCT c."slug", c."name"
      FROM "Match" m
      JOIN "LeagueClan" lc
        ON lc."id" = m."redLeagueClanId" OR lc."id" = m."blueLeagueClanId"
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE m."supersededAt" IS NULL
       AND m."startAt" > NOW() - (${HOT_WINDOW_MINUTES}::text || ' minutes')::interval
       AND lc."expelledAt" IS NULL
       AND c."active" = true
     LIMIT ${MAX_CLANS_PER_TICK}
  `
}

async function runTick(): Promise<TickResult> {
  const result: TickResult = { clans: 0, requested: 0, inserted: 0, blocked: false }
  const clans = await hotClanSlugs()
  result.clans = clans.length
  if (clans.length === 0) return result

  const rows: BarracksRow[] = []
  for (const c of clans) {
    let r
    try {
      r = await fetchClanMatchList(c.slug)
    } catch (e) {
      warn(`뜨거운클랜 — ${c.slug} 목록을 못 받았다 — ${(e as Error).message.slice(0, 100)}`)
      await sleep(delay)
      continue
    }
    result.requested += 1
    if (r.status === 403 || r.status === 429) {
      warn(`★병영수첩이 막았다 (HTTP ${r.status}) — 이 틱을 접는다. 우회하지 않는다★`)
      result.blocked = true
      break
    }
    if (r.status !== 200) {
      await sleep(delay)
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(r.body)
    } catch {
      await sleep(delay)
      continue
    }
    rows.push({ kind: 'matchlist', subject: c.slug, raw: parsed })
    await sleep(delay)
  }

  if (rows.length > 0) {
    const stored = await storeBarracksRows(rows)
    result.inserted = stored.inserted
  }
  return result
}

export async function runHotClanServer(): Promise<number> {
  if (!useChromeFetch()) {
    warn('★이 수신구는 서버(크롬)에서만 돈다★ — 노트북에서는 부르지 않는다')
    return 1
  }

  /*
   * ── ⚠ ★막히면 쉬는 시간을 늘린다★ (지수 백오프)
   *
   *   403 을 맞고도 90초마다 계속 두드리면 ★막힌 것을 더 확인하려는 꼴★ 이다.
   *   막힐 때마다 쉬는 시간을 두 배로 늘리고, 뚫리면 원래대로 되돌린다.
   */
  let backoffMs = TICK_MS
  const MAX_BACKOFF_MS = 30 * 60_000

  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(PORT, '0.0.0.0', () => {
    log(`뜨거운클랜 수신구 — 포트 ${PORT} · ${TICK_MS / 1000}초마다 · 최근 ${HOT_WINDOW_MINUTES}분`)
  })

  /* ★systemd 가 세울 때 크롬을 곱게 닫는다★ — 안 닫으면 임시 유저데이터 폴더가 쌓인다 */
  let stopping = false
  const shutdown = (): void => {
    if (stopping) return
    stopping = true
    log('뜨거운클랜 — 멈추라는 신호를 받았다. 크롬을 닫는다')
    closeBarracksBrowser()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  for (; !stopping; ) {
    const started = Date.now()
    try {
      const r = await runTick()
      if (r.blocked) {
        backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2)
        warn(`뜨거운클랜 — 막혀서 쉬는 시간을 ${Math.round(backoffMs / 1000)}초로 늘린다`)
      } else {
        if (backoffMs !== TICK_MS) log('뜨거운클랜 — 다시 뚫렸다. 주기를 되돌린다')
        backoffMs = TICK_MS
        if (r.clans > 0) {
          log(
            `뜨거운클랜 — 클랜 ${r.clans}곳 · 요청 ${r.requested} · ` +
              `새 원문 ${r.inserted} (${Math.round((Date.now() - started) / 1000)}초)`,
          )
        }
      }
    } catch (e) {
      warn(`뜨거운클랜 틱이 터졌다 — ${(e as Error).message.slice(0, 200)} (다음 틱에 다시 한다)`)
    }
    const elapsed = Date.now() - started
    const rest = Math.max(1000, backoffMs - elapsed)
    await sleep(rest)
  }
  /* ★여기 안 온다★ — `shutdown()` 이 `process.exit` 로 끝낸다. 타입만 채운다 */
  return 0
}
