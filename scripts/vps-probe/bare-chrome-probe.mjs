/**
 * 병영수첩 탐침 — 「맨 크롬」 판 (2026-09-02 · 지시 #8)
 *
 * ── 왜 따로 있나
 *   `scripts/barracks-probe.mjs` 는 puppeteer 로 크롬을 띄운다. puppeteer 는 크롬에
 *   `--enable-automation` 을 붙이고, 그러면 페이지에서 `navigator.webdriver === true` 가 된다.
 *   GitHub 실행기 실측(Azure IP)에서는 헤드풀도 403 이었고 webdriver=true 였다.
 *   **IP 때문인지 자동화 표시 때문인지 그 실측으로는 못 가른다.**
 *
 *   이 파일은 크롬을 **그냥 띄운다** — 자동화 플래그 없이. 대신 `--remote-debugging-pipe` 로
 *   CDP 를 **파이프(fd 3/4)** 에 붙인다. 포트를 열지 않으니 listen 이 막힌 PC 에서도 되고,
 *   `--enable-automation` 이 없으니 webdriver 표시가 서지 않는다.
 *
 *   ⚠ 정정 (2026-09-02 실측 · 위 마지막 문장은 틀렸다) — 이 PC 의 크롬 152 에서
 *     `--enable-automation` 없이 `--remote-debugging-pipe` 만 줘도 `navigator.webdriver === true` 였다.
 *     최신 크롬은 원격 디버깅이 켜진 것만으로 그 표시를 세운다. 그래도 이 파일의 값어치는 남는다 —
 *     **같은 조건(webdriver=true)으로 이 PC(주거지 IP)에서는 3건 전부 200 이었다.**
 *     (첫 페이지 2,847B · 매치목록 24,166B · 배틀로그 63,875B). 즉 Azure 실행기의 403 은
 *     webdriver 표시가 아니라 IP 쪽이 원인이라는 뜻이고, 국내 VPS 시험이 정확히 그것을 가른다.
 *
 *   ⚠ 이것은 회피 플래그가 아니다 — **아무것도 안 붙이는 것**이다. 회피 플래그
 *     (`--disable-blink-features=AutomationControlled` 류)는 넣지 않는다 (`CLAUDE.md` 3-A 5번).
 *   같은 서버에서 puppeteer 판과 나란히 돌려 **둘의 차이**를 본다.
 *
 * ── 무엇을
 *   `barracks-probe.mjs` 와 같은 세 요청, 같은 순서, 같은 2초 간격, 같은 결과 모양.
 *     1. GET  /                                              (Page.navigate)
 *     2. POST /api/ClanHome/GetClanMatchList/  { clan_id: "sorentolove" }   (페이지 안 fetch)
 *     3. POST /api/BattleLog/GetBattleLogClan/260805205259124001/170430000194
 *
 * ── 의존성 없음
 *   순수 Node 24. CDP 파이프 프로토콜은 「JSON 한 덩어리 + NUL(\0)」 이 전부라 직접 말한다.
 *
 *   사용법
 *     node bare-chrome-probe.mjs --dry-run             요청 없이 절차만 찍는다
 *     node bare-chrome-probe.mjs --self-test           크롬을 띄워 about:blank 에서 UA 만 읽고 닫는다 (병영수첩에 안 간다)
 *     node bare-chrome-probe.mjs --out result.json     실제 탐침
 *   환경변수
 *     PROBE_CHROME_PATH    크롬 실행 파일 (없으면 OS 별 기본 위치를 찾는다)
 *     PROBE_PUBLIC_IP      결과에 같이 적을 공인 IP (setup.sh 가 넣어 준다)
 *     PROBE_NO_SANDBOX=1   root 로 돌릴 때 (크롬은 root 에서 샌드박스를 거부한다 — VPS 사정이다)
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/* --------------------------------------------------------------- 설정 --- */

const ORIGIN = 'https://barracks.sa.nexon.com'
const GAP_MS = 2000
const REQUEST_TIMEOUT_MS = 30_000
const HEAD_CHARS = 200

/** `barracks-probe.mjs` 의 STEPS 와 같다. 값의 출처도 같다 (IPL_SPEC 7장 · HANDOFF 5-2) */
const STEPS = [
  { id: 'home', kind: 'navigate', method: 'GET', path: '/' },
  {
    id: 'clan-match-list',
    kind: 'fetch',
    method: 'POST',
    path: '/api/ClanHome/GetClanMatchList/',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clan_id: 'sorentolove' }),
  },
  {
    id: 'battle-log',
    kind: 'fetch',
    method: 'POST',
    path: '/api/BattleLog/GetBattleLogClan/260805205259124001/170430000194',
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (line) => console.log(`[bare] ${line}`)
const head = (text) => String(text ?? '').slice(0, HEAD_CHARS).replace(/\s+/g, ' ')

function parseArgs(argv) {
  const args = { dryRun: false, selfTest: false, out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--self-test') args.selfTest = true
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log('node bare-chrome-probe.mjs [--dry-run | --self-test] [--out <file>]')
      process.exit(0)
    } else {
      console.error(`모르는 인자: ${a}`)
      process.exit(2)
    }
  }
  return args
}

/* --------------------------------------------------------------- 크롬 --- */

function findChrome() {
  const wanted = process.env.PROBE_CHROME_PATH?.trim()
  if (wanted) return wanted
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error(`크롬을 못 찾았다 — PROBE_CHROME_PATH 를 줘라. 찾아본 곳: ${candidates.join(', ')}`)
  return found
}

/**
 * CDP over pipe.
 *   우리 → 크롬 : fd 3 에 `JSON + \0`
 *   크롬 → 우리 : fd 4 에서 `JSON + \0`
 * 명령에는 id 를 붙이고, 같은 id 의 응답이 오면 promise 를 푼다. 이벤트는 구독자에게 돌린다.
 */
class CdpPipe {
  constructor(child) {
    this.child = child
    this.tx = child.stdio[3]
    this.rx = child.stdio[4]
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Set()
    this.closed = false
    let buffer = ''
    this.rx.setEncoding('utf8')
    this.rx.on('data', (chunk) => {
      buffer += chunk
      let cut
      while ((cut = buffer.indexOf('\0')) >= 0) {
        const raw = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 1)
        if (!raw) continue
        let msg
        try {
          msg = JSON.parse(raw)
        } catch {
          continue
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) reject(new Error(`${msg.error.message ?? 'CDP 오류'} (${msg.error.code ?? '?'})`))
          else resolve(msg.result ?? {})
        } else if (msg.method) {
          for (const fn of this.listeners) fn(msg)
        }
      }
    })
    const onGone = () => {
      this.closed = true
      for (const { reject } of this.pending.values()) reject(new Error('크롬이 먼저 닫혔다'))
      this.pending.clear()
    }
    this.rx.on('close', onGone)
    child.on('exit', onGone)
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (this.closed) return Promise.reject(new Error('크롬 연결이 없다'))
    const id = this.nextId++
    const msg = { id, method, params }
    if (sessionId) msg.sessionId = sessionId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} 응답이 ${timeoutMs}ms 안에 안 왔다`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      this.tx.write(`${JSON.stringify(msg)}\0`)
    })
  }

  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** 특정 이벤트 하나를 기다린다 */
  waitFor(predicate, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const off = this.on((msg) => {
        if (predicate(msg)) {
          off()
          clearTimeout(timer)
          resolve(msg)
        }
      })
      const timer = setTimeout(() => {
        off()
        reject(new Error('이벤트를 기다리다 시간이 다 됐다'))
      }, timeoutMs)
    })
  }
}

function launch(chromePath, userDataDir) {
  const args = [
    '--remote-debugging-pipe',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
    '--lang=ko-KR',
    // 여기에 `--enable-automation` 이 **없다.** 그것이 이 파일의 존재 이유다.
    // 회피 플래그도 없다. 아무것도 안 붙인 크롬이다
    'about:blank',
  ]
  // root 에서 크롬은 샌드박스를 못 쓴다. cloud-init 은 root 로 돈다 — VPS 사정이지 회피가 아니다
  if (process.env.PROBE_NO_SANDBOX === '1') args.unshift('--no-sandbox')
  const child = spawn(chromePath, args, {
    // 0 stdin 무시 · 1/2 로그 버림 · 3 우리→크롬 · 4 크롬→우리
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  })
  return { child, args }
}

async function closeChrome(cdp, child) {
  try {
    await cdp.send('Browser.close', {}, undefined, 5000)
  } catch {
    /* 이미 닫혔으면 그만 */
  }
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* 무시 */
    }
  }
}

/* --------------------------------------------------------------- 요청 --- */

async function runNavigate(cdp, sessionId, step) {
  const url = `${ORIGIN}${step.path}`
  const started = Date.now()
  /** 문서 응답 — `Network.responseReceived` 중 type=Document 인 첫 것 */
  let doc = null
  const off = cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return
    if (msg.method === 'Network.responseReceived' && msg.params?.type === 'Document' && !doc) {
      doc = { requestId: msg.params.requestId, status: msg.params.response?.status ?? null, contentType: msg.params.response?.mimeType ?? null, finalUrl: msg.params.response?.url ?? null }
    }
  })
  try {
    const loaded = cdp.waitFor((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired')
    const nav = await cdp.send('Page.navigate', { url }, sessionId)
    if (nav.errorText) {
      return { status: null, bytes: null, head: null, ms: Date.now() - started, error: `navigate: ${nav.errorText}` }
    }
    try {
      await loaded
    } catch {
      /* load 이벤트가 늦어도 응답 자체는 받았을 수 있다 — 아래에서 doc 으로 판단한다 */
    }
    const ms = Date.now() - started
    if (!doc) return { status: null, bytes: null, head: null, ms, error: '문서 응답 이벤트가 없다' }
    let text = ''
    let bytes = null
    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: doc.requestId }, sessionId)
      const buf = body.base64Encoded ? Buffer.from(body.body, 'base64') : Buffer.from(body.body, 'utf8')
      bytes = buf.length
      text = buf.toString('utf8')
    } catch (error) {
      // 본문을 못 꺼내면 DOM 으로 대신 본다 (크기는 모른다)
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true }, sessionId)
        text = String(r.result?.value ?? '')
      } catch {
        text = `(본문을 못 읽었다: ${error?.message ?? error})`
      }
    }
    return { status: doc.status, bytes, head: head(text), ms, finalUrl: doc.finalUrl, contentType: doc.contentType, error: null }
  } finally {
    off()
  }
}

async function runFetch(cdp, sessionId, step) {
  const started = Date.now()
  const spec = JSON.stringify({ path: step.path, method: step.method, headers: step.headers ?? null, body: step.body ?? null, timeoutMs: REQUEST_TIMEOUT_MS })
  // 페이지 안에서 돈다. 여기서 만드는 헤더는 `Content-Type` 뿐이다
  const expression = `(async (spec) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), spec.timeoutMs)
    try {
      const res = await fetch(spec.path, {
        method: spec.method,
        credentials: 'include',
        headers: spec.headers ?? undefined,
        body: spec.body ?? undefined,
        signal: controller.signal,
      })
      const text = await res.text()
      return { status: res.status, text, contentType: res.headers.get('content-type'), error: null }
    } catch (error) {
      return { status: null, text: '', contentType: null, error: String(error && error.message || error) }
    } finally {
      clearTimeout(timer)
    }
  })(${spec})`
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, REQUEST_TIMEOUT_MS + 5000)
  const v = r.result?.value ?? { status: null, text: '', contentType: null, error: 'evaluate 결과가 없다' }
  const ms = Date.now() - started
  return {
    status: v.status,
    bytes: v.error ? null : Buffer.byteLength(v.text ?? '', 'utf8'),
    head: v.error ? null : head(v.text),
    ms,
    contentType: v.contentType,
    error: v.error,
  }
}

/* --------------------------------------------------------------- 본체 --- */

function printPlan() {
  log('dry-run — 요청을 보내지 않는다. 크롬도 안 띄운다')
  log(`origin=${ORIGIN} · 간격 ${GAP_MS}ms · 상한 ${REQUEST_TIMEOUT_MS}ms`)
  log('크롬: --remote-debugging-pipe --user-data-dir=<임시> --no-first-run --no-default-browser-check --window-size=1280,900 --lang=ko-KR about:blank')
  log('      (--enable-automation 없음 · 회피 플래그 없음 · PROBE_NO_SANDBOX=1 이면 --no-sandbox)')
  log('CDP: Target.createTarget → Target.attachToTarget(flatten) → Page/Network/Runtime.enable')
  STEPS.forEach((s, i) => {
    const via = s.kind === 'navigate' ? 'Page.navigate' : 'Runtime.evaluate(fetch)'
    log(`${i + 1}. [${s.id}] ${s.method} ${ORIGIN}${s.path}  (${via})`)
    if (s.headers) log(`     headers ${JSON.stringify(s.headers)}`)
    if (s.body) log(`     body    ${s.body}`)
    if (i < STEPS.length - 1) log(`     … ${GAP_MS}ms 쉰다`)
  })
  log('끝나면 Browser.close. 결과 모양은 barracks-probe.mjs 와 같다 (mode="bare-chrome")')
}

async function probe(args) {
  const out = {
    probedAt: new Date().toISOString(),
    mode: args.selfTest ? 'bare-chrome-self-test' : 'bare-chrome',
    origin: ORIGIN,
    gapMs: GAP_MS,
    runner: { publicIp: process.env.PROBE_PUBLIC_IP ?? null, platform: `${os.platform()} ${os.release()}`, node: process.version, display: process.env.DISPLAY ?? null },
    browser: null,
    requests: [],
    fatal: null,
  }
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'bare-chrome-'))
  let child = null
  let cdp = null
  try {
    const chromePath = findChrome()
    const launched = launch(chromePath, userDataDir)
    child = launched.child
    cdp = new CdpPipe(child)
    const spawnError = new Promise((_, reject) => child.once('error', (e) => reject(new Error(`크롬을 못 띄웠다: ${e.message}`))))

    const version = await Promise.race([cdp.send('Browser.getVersion'), spawnError])
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)

    const ua = await cdp.send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true }, sessionId)
    const wd = await cdp.send('Runtime.evaluate', { expression: 'navigator.webdriver', returnByValue: true }, sessionId)
    out.browser = {
      version: version.product ?? null,
      executablePath: chromePath,
      args: launched.args.filter((a) => !a.startsWith('--user-data-dir=')),
      headless: false,
      userAgent: ua.result?.value ?? null,
      navigatorWebdriver: wd.result?.value ?? null,
    }
    log(`browser ${out.browser.version} · ${chromePath} · webdriver=${out.browser.navigatorWebdriver}`)
    log(`UA ${out.browser.userAgent}`)

    if (args.selfTest) {
      log('self-test — 병영수첩에 가지 않는다. 크롬·파이프·CDP 가 도는지까지만 봤다')
    } else {
      for (let i = 0; i < STEPS.length; i += 1) {
        const step = STEPS[i]
        log(`${i + 1}/${STEPS.length} [${step.id}] ${step.method} ${step.path}`)
        let r
        try {
          r = step.kind === 'navigate' ? await runNavigate(cdp, sessionId, step) : await runFetch(cdp, sessionId, step)
        } catch (error) {
          r = { status: null, bytes: null, head: null, ms: null, error: String(error?.message ?? error) }
        }
        const row = { id: step.id, method: step.method, url: `${ORIGIN}${step.path}`, ...r }
        out.requests.push(row)
        if (row.error) log(`   → 실패: ${row.error}`)
        else {
          log(`   → HTTP ${row.status} · ${row.bytes} bytes · ${row.ms}ms · ${row.contentType ?? ''}`)
          log(`   → ${row.head}`)
        }
        if (i < STEPS.length - 1) await sleep(GAP_MS)
      }
    }
  } catch (error) {
    out.fatal = String(error?.stack ?? error)
    log(`치명적 오류: ${error?.message ?? error}`)
  } finally {
    if (cdp && child) await closeChrome(cdp, child)
    else if (child) {
      try {
        child.kill('SIGKILL')
      } catch {
        /* 무시 */
      }
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* 임시 프로필이 남아도 해는 없다 */
    }
  }
  const summary = out.requests.map((r) => `${r.id}=${r.status ?? 'ERR'}`).join(' · ')
  log(`요약 [${out.mode}] ${summary || '(요청 없음)'}${out.fatal ? ' · FATAL' : ''}`)
  if (args.out) {
    await writeFile(args.out, JSON.stringify(out, null, 2), 'utf8')
    log(`결과 → ${args.out}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.dryRun) {
  printPlan()
  process.exit(0)
}
const result = await probe(args)
// 403 은 결과다. 크롬을 못 띄웠거나 CDP 가 안 붙은 것만 실패다
process.exit(result.fatal ? 1 : 0)
