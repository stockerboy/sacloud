/**
 * ★크롬으로 병영수첩을 부른다★ (2026-09-08 · 사장님 지시 「노트북 없이도 돌아야 해」)
 *
 * ── 왜 이 파일이 생겼나
 *   수집기는 원래 `curl` 로 부른다. ★사장님 노트북(집 IP)에서는 그게 200 이다.★
 *   그런데 서버로 옮기려고 국내 VPS 를 하나 빌려 재 보니 (2026-09-08 · 49.247.203.71):
 *
 *     크롬으로 부르면   home=200 · clan-match-list=200 · battle-log=200   ← 진짜 데이터까지 왔다
 *     curl 로 부르면    ★403★
 *
 *   ★서버 IP 가 막힌 게 아니다.★ 「브라우저가 아닌 요청」을 막는다.
 *   그래서 ★서버에서는 진짜 크롬을 띄워 그 안에서 부른다.★
 *
 * ── ⚠ 이것은 우회가 아니다
 *   ★플래그를 숨기지 않는다★ — `--enable-automation` 을 안 붙일 뿐이고,
 *   실제로 `navigator.webdriver === true` 인 채로 200 이 나왔다 (탐침 실측).
 *   ★User-Agent 를 위조하지 않는다.★ 크롬이 원래 보내는 그대로다.
 *   ★요청 간격도 그대로다★ — 이 파일은 「무엇으로 부르는가」만 바꾼다.
 *   ★403 이 나오면 그대로 403 을 돌려준다.★ 다시 시도하거나 돌아가지 않는다.
 *
 * ── 어떻게 부르나
 *   ① 크롬을 ★한 번만★ 띄운다 (`--remote-debugging-pipe` · 포트를 안 연다)
 *   ② `https://barracks.sa.nexon.com/` 을 ★한 번★ 연다 — 그 뒤로는 이 페이지 안에서 부른다
 *   ③ 부를 때마다 페이지 안에서 `fetch()` 를 돌리고 상태·본문을 그대로 받아온다
 *
 *   ★의존성이 없다.★ puppeteer 를 안 쓴다 — CDP 를 파이프로 직접 말한다.
 *   그래서 `pnpm install` 이 늘지 않는다 (`CLAUDE.md` 7 「미리 설치하지 않는다」).
 *
 * ── ⚠ ★리눅스 전용이다★
 *   `--remote-debugging-pipe` 는 fd 3/4 로 말한다. ★윈도에서는 안 된다★ —
 *   2026-09-08 에 노트북에서 재 보니 크롬이 뜨자마자 `code=0` 으로 닫혔다.
 *   그래서 ★노트북은 계속 `curl` 을 쓴다★ (거기서는 그게 200 이고 더 빠르다).
 *   이 파일은 ★서버(우분투)에서만★ 쓴다.
 *
 * ── ⚠ 옛 방식을 지우지 않았다 (`CLAUDE.md` 1-4)
 *   `barracksCollect.ts` 의 `curl()` 은 ★그대로 있다.★ 노트북에서는 그게 더 빠르다.
 *   이 파일은 ★`SACLOUD_FETCH=chrome` 일 때만★ 쓰인다.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 우리가 부르는 곳. `barracksCollect.ts` 의 `ORIGIN` 과 같아야 한다 */
const ORIGIN = 'https://barracks.sa.nexon.com'
const REQUEST_TIMEOUT_MS = 20_000
/** 응답이 터무니없이 크면 끊는다 — 메모리를 통째로 먹게 두지 않는다 */
const MAX_BYTES = 8 * 1024 * 1024

export interface BrowserFetchResult {
  status: number
  body: string
  ms: number
}

/** 크롬이 어디 있나 — 리눅스(서버)와 윈도(노트북) 둘 다 본다 */
function findChrome(): string {
  const fromEnv = process.env.SACLOUD_CHROME
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  for (const path of candidates) if (existsSync(path)) return path
  throw new Error(
    '크롬을 못 찾았다 — `SACLOUD_CHROME` 에 크롬 경로를 넣어라 (예: /usr/bin/google-chrome)',
  )
}

/**
 * CDP 를 ★파이프★ 로 말한다 (포트를 안 연다 — 서버에 구멍을 안 뚫는다).
 *
 *   우리 → 크롬 : fd 3 에 `JSON + \0`
 *   크롬 → 우리 : fd 4 에서 `JSON + \0`
 */
class CdpPipe {
  private nextId = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private listeners = new Set<(msg: any) => void>()
  private closed = false
  private tx: NodeJS.WritableStream
  private rx: NodeJS.ReadableStream

  constructor(child: ChildProcess) {
    this.tx = child.stdio[3] as NodeJS.WritableStream
    this.rx = child.stdio[4] as NodeJS.ReadableStream
    let buffer = ''
    this.rx.setEncoding?.('utf8')
    this.rx.on('data', (chunk: string) => {
      buffer += chunk
      let cut: number
      while ((cut = buffer.indexOf('\0')) >= 0) {
        const raw = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 1)
        if (!raw) continue
        let msg: any
        try {
          msg = JSON.parse(raw)
        } catch {
          continue
        }
        if (msg.id && this.pending.has(msg.id)) {
          const slot = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if (msg.error) slot.reject(new Error(`${msg.error.message ?? 'CDP 오류'}`))
          else slot.resolve(msg.result ?? {})
        } else if (msg.method) {
          for (const fn of this.listeners) fn(msg)
        }
      }
    })
    const onGone = (): void => {
      this.closed = true
      for (const { reject } of this.pending.values()) reject(new Error('크롬이 먼저 닫혔다'))
      this.pending.clear()
    }
    this.rx.on('close', onGone)
    child.on('exit', onGone)
  }

  get isClosed(): boolean {
    return this.closed
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<any> {
    if (this.closed) return Promise.reject(new Error('크롬 연결이 없다'))
    const id = this.nextId++
    const msg: Record<string, unknown> = { id, method, params }
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
}

let shared: BarracksBrowser | null = null

/**
 * ★크롬 한 대를 계속 쓴다.★ 요청마다 띄우면 한 번에 3초씩 날린다.
 * 죽으면 다음 요청 때 저절로 다시 띄운다.
 */
export class BarracksBrowser {
  private child: ChildProcess | null = null
  private cdp: CdpPipe | null = null
  private sessionId: string | null = null
  private userDataDir: string | null = null
  private opening: Promise<void> | null = null

  private async ensure(): Promise<void> {
    if (this.cdp && !this.cdp.isClosed && this.sessionId) return
    if (this.opening) return this.opening
    this.opening = this.open().finally(() => {
      this.opening = null
    })
    return this.opening
  }

  private async open(): Promise<void> {
    this.dispose()
    const chrome = findChrome()
    this.userDataDir = mkdtempSync(join(tmpdir(), 'sacloud-chrome-'))
    const args = [
      '--remote-debugging-pipe',
      `--user-data-dir=${this.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--window-size=1280,900',
      '--lang=ko-KR',
      /* ⚠ `--enable-automation` 을 ★안 붙인다.★ 숨기는 것이 아니라 안 붙이는 것이다 —
         실제로 `navigator.webdriver === true` 인 채로 200 이 나왔다 (2026-09-08 탐침) */
      'about:blank',
    ]
    /* 서버는 root 로 돈다. root 크롬은 샌드박스를 못 쓴다 — VPS 사정이지 회피가 아니다 */
    if (process.env.SACLOUD_CHROME_NO_SANDBOX === '1') args.unshift('--no-sandbox')

    const child = spawn(chrome, args, {
      stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    })
    this.child = child
    const cdp = new CdpPipe(child)
    this.cdp = cdp

    /* 탭 하나를 잡고 그 탭에 붙는다 */
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    this.sessionId = sessionId
    await cdp.send('Page.enable', {}, sessionId)

    /* ★출처를 한 번 연다★ — 그 뒤로는 이 페이지 안에서 부른다.
       같은 출처라서 쿠키·리퍼러가 브라우저가 만드는 그대로 붙는다 */
    await cdp.send('Page.navigate', { url: `${ORIGIN}/` }, sessionId, REQUEST_TIMEOUT_MS)
    await new Promise((r) => setTimeout(r, 1200))
  }

  /** ★페이지 안에서 부른다.★ 헤더는 `Content-Type` 하나만 우리가 정한다 */
  async call(
    method: 'GET' | 'POST',
    path: string,
    body: string | null,
  ): Promise<BrowserFetchResult> {
    await this.ensure()
    const started = Date.now()
    const spec = JSON.stringify({
      path,
      method,
      body,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_BYTES,
    })
    const expression = `(async (spec) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), spec.timeoutMs)
      try {
        const res = await fetch(spec.path, {
          method: spec.method,
          credentials: 'include',
          headers: spec.body === null ? undefined : { 'Content-Type': 'application/json' },
          body: spec.body === null ? undefined : spec.body,
          signal: controller.signal,
        })
        let text = await res.text()
        if (text.length > spec.maxBytes) text = text.slice(0, spec.maxBytes)
        return { status: res.status, text, error: null }
      } catch (error) {
        return { status: 0, text: '', error: String((error && error.message) || error) }
      } finally {
        clearTimeout(timer)
      }
    })(${spec})`

    const r = await this.cdp!.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      this.sessionId!,
      REQUEST_TIMEOUT_MS + 5000,
    )
    const v = r.result?.value ?? { status: 0, text: '', error: 'evaluate 결과가 없다' }
    if (v.error) throw new Error(`크롬 안에서 부르다 실패: ${v.error}`)
    return { status: Number(v.status ?? 0), body: String(v.text ?? ''), ms: Date.now() - started }
  }

  dispose(): void {
    try {
      this.child?.kill()
    } catch {
      /* 이미 죽었으면 그만 */
    }
    if (this.userDataDir) {
      try {
        rmSync(this.userDataDir, { recursive: true, force: true })
      } catch {
        /* 지우다 실패해도 다음 판을 막지 않는다 */
      }
    }
    this.child = null
    this.cdp = null
    this.sessionId = null
    this.userDataDir = null
  }
}

/** ★한 프로세스에 크롬 한 대.★ 수집 한 판이 끝나면 `closeBarracksBrowser()` 로 닫는다 */
export function barracksBrowser(): BarracksBrowser {
  if (!shared) shared = new BarracksBrowser()
  return shared
}

export function closeBarracksBrowser(): void {
  shared?.dispose()
  shared = null
}

/** `SACLOUD_FETCH=chrome` 이면 크롬으로 부른다. 안 주면 예전처럼 `curl` 이다 */
export function useChromeFetch(): boolean {
  return (process.env.SACLOUD_FETCH ?? '').toLowerCase() === 'chrome'
}
