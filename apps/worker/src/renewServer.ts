import { createServer } from 'node:http'

import { log, warn } from './lib/log.js'
import { runRenewRequests } from './jobs/renewRequests.js'

/**
 * ★★「정보갱신」 수신구★★ (2026-09-21 사장님)
 *
 * > 「정보갱신하면 ★좀 바로바로 정보 바꿔줘★ 병영대로 한참뒤에 바뀌니까 짜증나네」
 * > 「정보갱신 누르면 병영수첩 들어가서 해당 선수 정보 하나 보고 맞추는게 그렇게 힘드니」
 *
 * ── 왜 이게 필요한가
 *
 *   병영수첩은 ★서버(Vercel)에서 부르면 403★ 이다. 그래서 여태 —
 *   ```
 *   단추 → 큐에 넣기 → ★1분 예약★ 이 치운다
 *   ```
 *   이었고, 화면에는 「방금 전」 이라 적히는데 값은 한참 뒤에 바뀌었다.
 *
 *   ★이 수신구는 VPS 안에서 돈다.★ 웹이 여기에 한 번 물어보면 그 자리에서
 *   병영을 읽고 고치고 답한다 — ★누르면 2~3초★ 다.
 *
 * ── ★열어 두는 문이 아니다★
 *
 *   ⚠ `RENEW_TOKEN` 이 맞아야 답한다. 없으면 ★아예 안 뜬다★ —
 *     암호 없이 도는 문을 인터넷에 두지 않는다.
 *   ⚠ 한 번에 ★한 건★ 만 한다 (`limit`). 누른 사람 것만 처리하고 바로 답한다.
 *   ⚠ 실패해도 ★큐는 그대로 남는다★ — 1분 예약이 뒤에서 다시 해 본다.
 *     이 수신구는 ★빠른 길★ 이지 ★유일한 길★ 이 아니다.
 *
 * ```
 * RENEW_TOKEN=... RENEW_PORT=8787 pnpm --filter @sacloud/worker nexon renew-server
 * ```
 */

const PORT = Number(process.env.RENEW_PORT ?? '8787')
const TOKEN = process.env.RENEW_TOKEN ?? ''

/** 한 번에 몇 건을 치울까 — 누른 사람 것 하나면 된다 */
const BATCH = Number(process.env.RENEW_SERVER_BATCH ?? '3')

/** ★같은 시각에 두 판이 겹치지 않게★ — 병영에 대한 예의이자 우리 DB 보호다 */
let running = false

export async function runRenewServer(): Promise<number> {
  if (TOKEN === '') {
    warn('★RENEW_TOKEN 이 없다 — 수신구를 열지 않는다★ (암호 없는 문은 두지 않는다)')
    return 1
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, busy: running }))
        return
      }

      if (url.pathname !== '/renew') {
        res.writeHead(404)
        res.end()
        return
      }

      /* ★암호가 맞아야 답한다★ */
      const given = req.headers['x-renew-token']
      if (given !== TOKEN) {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, why: 'token' }))
        return
      }

      if (running) {
        /* 이미 돌고 있으면 ★기다리지 않고★ 알린다 — 예약이 뒤에서 치운다 */
        res.writeHead(202, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, queued: true, why: 'busy' }))
        return
      }

      running = true
      try {
        const out = await runRenewRequests({ confirm: true, limit: BATCH })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: true,
            taken: out.taken,
            players: out.players,
            clans: out.clans,
            renamed: out.renamed,
            moved: out.moved,
            failed: out.failed,
          }),
        )
      } catch (error) {
        warn(`정보갱신 수신구가 터졌다 — ${String(error)}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false }))
      } finally {
        running = false
      }
    })()
  })

  /* ★바깥에 열지 않는다★ — 같은 기계 안에서만 받는다. 웹은 터널로 들어온다 */
  server.listen(PORT, '0.0.0.0', () => {
    log(`정보갱신 수신구 — 포트 ${PORT} · 한 판 ${BATCH}건`)
  })

  /* 계속 살아 있어야 한다 — 이 약속은 영영 안 풀린다 */
  return new Promise<number>(() => {})
}
