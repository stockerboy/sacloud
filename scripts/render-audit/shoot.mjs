/**
 * 렌더 검수 하네스 (D팀 · 2026-09-01)
 *
 * 왜 있나 — Claude 브라우저 확장은 `127.0.0.1` 에 사이트 권한이 없어 스크린샷이 거부된다.
 * 사용자가 자는 동안 권한을 받을 수 없으므로, 확장을 거치지 않고 **헤드리스 Chrome 을
 * CDP 로 직접 몰아서** 전체 페이지를 찍고 같은 방문에서 DOM 검사를 함께 돌린다.
 *
 * `CLAUDE.md` 3장 10번: `HTTP 200` 과 `getComputedStyle` 수치만으로 완료 판정하지 않는다.
 * 그래서 이 도구는 **그림과 수치를 같이** 낸다 — 판정은 그림을 보고 사람이 한다.
 *
 * 사용법:
 *   node scripts/render-audit/shoot.mjs --out <dir> --width 1440 --url <name>=<path> [...]
 *   node scripts/render-audit/shoot.mjs --out <dir> --width 390 --file urls.txt
 *
 * 절대 dev 서버를 띄우거나 죽이지 않는다. 이미 떠 있는 127.0.0.1:3000 에 붙기만 한다.
 * 포트가 겹치면 `CDP_PORT` 로 바꾼다 (병렬 실행 시 필수).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:3000'
const PORT = Number(process.env.CDP_PORT ?? 9333)

const argv = process.argv.slice(2)
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const outDir = resolve(opt('out', 'shots'))
const width = Number(opt('width', 1440))
const height = Number(opt('height', 900))
const waitMs = Number(opt('wait', 2500))
/** 본문이 다 그려질 때까지 기다리는 최대 시간. dev 첫 컴파일이 느려서 넉넉히 준다. */
const settleMs = Number(opt('settle', 90000))
/** 이 시간 전에는 「다 그렸다」로 인정하지 않는다. 껍데기만 보고 찍는 사고를 막는다. */
const minSettleMs = Number(opt('min-settle', 12000))

/** `--url name=/path` 를 여러 번, 또는 `--file` 로 같은 형식의 줄 목록 */
const targets = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url') targets.push(argv[i + 1])
}
const listFile = opt('file', null)
if (listFile) {
  for (const line of readFileSync(listFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (t && !t.startsWith('#')) targets.push(t)
  }
}
if (targets.length === 0) {
  console.error('대상이 없다. --url name=/path 또는 --file 목록을 줘라.')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const profile = join(tmpdir(), `render-audit-${PORT}-${process.pid}`)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // 스크롤바를 숨기면 "가로 스크롤이 있는가" 를 눈으로 못 본다. 남겨 둔다.
    '--hide-scrollbars=false',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 어디서 멈췄는지 보이게 한다. 이 PC 는 세션 넷이 붙어 있어 자주 느려진다. */
const t0 = Date.now()
const trace = (m) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`)

/** 응답이 영영 안 오는 CDP 호출에 걸리지 않게 한다. */
function withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`시간 초과: ${what} (${ms}ms)`)), ms)),
  ])
}

async function cdpEndpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch {
      /* 아직 안 떴다 */
    }
    await sleep(500)
  }
  throw new Error('CDP 가 안 뜬다')
}

/** 아주 얇은 CDP 클라이언트 — Node 24 의 내장 WebSocket 을 쓴다 (의존성 0) */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id != null) {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
          else p.resolve(msg.result)
        }
      } else {
        for (const l of this.listeners) l(msg)
      }
    })
  }
  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', rej, { once: true })
    })
    return new Cdp(ws)
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((resolveP, rejectP) => {
      this.pending.set(id, { resolve: resolveP, reject: rejectP })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
  once(method, sessionId, timeout = 60000) {
    return new Promise((res) => {
      const t = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== fn)
        res(null)
      }, timeout)
      const fn = (msg) => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          clearTimeout(t)
          this.listeners = this.listeners.filter((l) => l !== fn)
          res(msg.params)
        }
      }
      this.listeners.push(fn)
    })
  }
}

/**
 * 페이지 안에서 도는 검사. `CLAUDE.md` 3장 8번의 6개 항목 중 **기계가 셀 수 있는 것만** 센다.
 * 나머지(묻히는가 · 읽히는가 · 위계가 살아 있는가)는 그림을 보고 판정한다.
 */
const PROBE = String.raw`(() => {
  const R = { url: location.href, title: document.title }
  const de = document.documentElement, b = document.body

  // ① 가로 스크롤
  R.overflowX = {
    docScrollW: de.scrollWidth, innerW: window.innerWidth,
    bodyScrollW: b.scrollWidth,
    hasHScroll: de.scrollWidth > window.innerWidth + 1,
  }
  const wide = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.right > window.innerWidth + 1) {
      const cs = getComputedStyle(el)
      if (cs.position === 'fixed') continue
      wide.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 90)) || '',
        right: Math.round(r.right), w: Math.round(r.width),
        overflowX: cs.overflowX,
        text: (el.textContent || '').trim().slice(0, 40),
      })
    }
  }
  R.overflowX.offenders = wide.slice(0, 12)
  R.overflowX.offenderCount = wide.length

  // 스스로 가로 스크롤을 갖는 컨테이너는 결함이 아니다 — 표는 그래도 된다
  const scrollers = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const cs = getComputedStyle(el)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
        scrollers.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
                         scrollW: el.scrollWidth, clientW: el.clientWidth })
      }
    }
  }
  R.innerScrollers = scrollers.slice(0, 12)

  // ② 글자가 바닥에 묻히는가 — 실제 배경을 위로 거슬러 올라가 찾는다
  const toRgb = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(',').map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, c) => {
    const l1 = lum(a), l2 = lum(c)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  const bgOf = (el) => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = toRgb(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0.05) return c
      n = n.parentElement
    }
    return toRgb(getComputedStyle(document.documentElement).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 }
  }
  const buried = []
  let textNodes = 0
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  let tn
  while ((tn = walk.nextNode())) {
    const t = tn.nodeValue.trim()
    if (!t) continue
    const el = tn.parentElement
    if (!el || seen.has(el)) continue
    seen.add(el)
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    textNodes++
    const fg = toRgb(cs.color); if (!fg || fg.a < 0.05) continue
    const bg = bgOf(el)
    const cr = ratio(fg, bg)
    if (cr < 3) {
      buried.push({
        text: t.slice(0, 42), ratio: Math.round(cr * 100) / 100,
        color: cs.color, bg: 'rgb(' + bg.r + ', ' + bg.g + ', ' + bg.b + ')',
        size: cs.fontSize, weight: cs.fontWeight,
        cls: String(el.className || '').slice(0, 70),
      })
    }
  }
  buried.sort((a, c) => a.ratio - c.ratio)
  R.contrast = { textElements: textNodes, under3: buried.length, worst: buried.slice(0, 25) }

  // ③ 진홍(강조색)이 넓은 면에 칠해졌는가
  const accent = getComputedStyle(de).getPropertyValue('--color-accent').trim()
  const acc = toRgb(accent) || { r: 217, g: 43, b: 43, a: 1 }
  const near = (c, t, tol) => c && Math.abs(c.r - t.r) <= tol && Math.abs(c.g - t.g) <= tol && Math.abs(c.b - t.b) <= tol
  const painted = []
  let accentArea = 0
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    const bg = toRgb(cs.backgroundColor)
    if (!bg || bg.a < 0.5) continue
    if (!near(bg, acc, 40)) continue
    const r = el.getBoundingClientRect()
    const area = r.width * r.height
    if (area <= 0) continue
    accentArea += area
    if (area > 2000) painted.push({
      tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 70),
      w: Math.round(r.width), h: Math.round(r.height), area: Math.round(area),
      text: (el.textContent || '').trim().slice(0, 40),
    })
  }
  painted.sort((a, c) => c.area - a.area)
  /**
   * WARN 배경만 세면 절반만 본 것이다. 적진 에서 진홍은 글자색으로 더 많이 쓰인다
   *   (래더 2500 이상 = --color-rating-2500 = 강조색과 같은 값).
   *   "아껴 쓰는가" 를 재려면 **글자 진홍 개수**를 같이 세야 한다.
   */
  const accentText = []
  for (const el of seen) {
    const cs = getComputedStyle(el)
    const fg = toRgb(cs.color)
    if (!near(fg, acc, 24)) continue
    accentText.push({ text: (el.textContent || '').trim().slice(0, 20), cls: String(el.className || '').slice(0, 50) })
  }
  R.accentText = { count: accentText.length, sample: accentText.slice(0, 25) }

  R.accent = {
    token: accent || '(토큰 없음)',
    filledBlocks: painted.slice(0, 10),
    totalFilledArea: Math.round(accentArea),
    pageArea: window.innerWidth * de.scrollHeight,
  }

  // ④ 숫자가 --font-num 으로 정렬되는가
  const numFont = getComputedStyle(de).getPropertyValue('--font-num').trim()
  const badNums = []
  const numRe = /^[\s\d.,%:+\-\/전승패점위]*\d[\s\d.,%:+\-\/전승패점위]*$/
  for (const el of seen) {
    const t = (el.textContent || '').trim()
    if (t.length === 0 || t.length > 14) continue
    if (!/\d/.test(t)) continue
    if (!numRe.test(t)) continue
    const ff = getComputedStyle(el).fontFamily
    const mono = /mono|consol|menlo|courier|jetbrains|ibm plex mono|d2coding|num/i.test(ff)
    if (!mono) badNums.push({ text: t.slice(0, 14), font: ff.slice(0, 60), cls: String(el.className || '').slice(0, 60) })
  }
  R.numerals = { token: numFont || '(토큰 없음)', nonMono: badNums.slice(0, 20), nonMonoCount: badNums.length }

  // ⑤ 상태 표기가 남아 있는가
  const body = document.body.innerText
  const marks = ['배치고사', '알수없음', 'MVP', '익명', '측정중', '포지션 미정', '미접속', '접속중', '기록 없음', '갱신 실패', '래더 미반영']
  R.statusWords = Object.fromEntries(marks.map((w) => [w, body.split(w).length - 1]))

  // ⑥ 이동 흐름 — 링크가 살아 있는가
  const links = [...document.querySelectorAll('a[href]')]
  R.links = {
    total: links.length,
    empty: links.filter((a) => !a.textContent.trim() && !a.querySelector('img,svg')).length,
    sample: links.slice(0, 40).map((a) => ({ t: a.textContent.trim().slice(0, 24), href: a.getAttribute('href') })),
  }

  // 데이터가 사라졌는가 — 빈 상태 문구
  R.emptyPhrases = ['없습니다', '비어', '데이터 없음', '결과가 없'].map((w) => ({ w, n: body.split(w).length - 1 })).filter((x) => x.n > 0)
  R.textLength = body.length
  // 전체 페이지 높이 — Page.getLayoutMetrics 는 뷰포트를 강제하면 900 으로 잘려 나온다
  R.scrollHeight = Math.max(de.scrollHeight, b.scrollHeight)
  R.scrollWidth = Math.max(de.scrollWidth, b.scrollWidth)
  return R
})()`

async function main() {
  trace('CDP 를 기다린다')
  const wsUrl = await cdpEndpoint()
  trace('CDP 붙었다 — 웹소켓 연다')
  const browser = await withTimeout(Cdp.open(wsUrl), 20000, 'Cdp.open')
  trace('웹소켓 열렸다')
  const report = []

  for (const raw of targets) {
    /**
     * `이름=/경로 :: <자바스크립트>`
     *
     * 뒤쪽은 화면이 다 그려진 뒤에 페이지 안에서 한 번 돌린다. **펼쳐야만 보이는 화면**을
     * 찍기 위한 것이다 — 경기 상세는 `[aria-label="상세보기"]` 를 눌러야 열린다
     * (`MatchCard.tsx:452-454`). 원 감사가 5회 시도해 못 본 화면이 이것이다.
     */
    /** `이름=/경로 @@ <CSS 선택자>` — 그 요소만 잘라 찍는다. 카드 하나를 크게 보려고 쓴다. */
    const [head0, sel] = raw.split(' @@ ')
    /**
     * `이름=/경로 %% <CSS 선택자>` — 그 요소 위로 **진짜 마우스를 올린 상태**로 찍고 잰다.
     * `:hover` 는 자바스크립트로 못 켠다. CDP 로 실제 포인터를 옮겨야 한다.
     */
    const [head, hoverSel] = head0.split(' %% ')
    const [t, after] = head.split(' :: ')
    const eq = t.indexOf('=')
    const name = eq === -1 ? t.replace(/[^\w]+/g, '_') : t.slice(0, eq)
    const path = (eq === -1 ? t : t.slice(eq + 1)).trim()
    const url = path.startsWith('http') ? path : BASE + path

    trace(`${name}: 탭을 연다`)
    const { targetId } = await withTimeout(
      browser.send('Target.createTarget', { url: 'about:blank' }), 30000, 'createTarget')
    const { sessionId } = await withTimeout(
      browser.send('Target.attachToTarget', { targetId, flatten: true }), 30000, 'attachToTarget')
    trace(`${name}: 붙었다`)
    try {
      await browser.send('Page.enable', {}, sessionId)
      await browser.send('Runtime.enable', {}, sessionId)
      await browser.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile: width < 700 },
        sessionId,
      )

      const loaded = browser.once('Page.loadEventFired', sessionId, 180000)
      trace(`${name}: 이동 ${url}`)
      await withTimeout(browser.send('Page.navigate', { url }, sessionId), 180000, 'navigate')
      await loaded
      trace(`${name}: load`)

      /**
       * `load` 만 기다리면 **빈 화면을 찍는다.**
       *   ① `/league/{slug}/home` 은 `/home/info` 로 리다이렉트한다 — 첫 `load` 는 옛 문서의 것이다
       *   ② 본문이 클라이언트에서 채워진다 — dev 서버는 첫 컴파일에 수십 초가 걸린다
       * 그래서 **본문 길이가 자랄 때까지** 기다린다. 두 번 연속 같으면 다 그린 것으로 본다.
       */
      let last = -1
      let stable = 0
      const startedAt = Date.now()
      const deadline = startedAt + settleMs
      while (Date.now() < deadline) {
        await sleep(700)
        const r = await browser.send(
          'Runtime.evaluate',
          { expression: '(document.body && document.body.innerText.length) || 0', returnByValue: true },
          sessionId,
        )
        const len = r.result?.value ?? 0
        if (stable === 0 && len !== last) trace(`${name}: 본문 ${len}자`)
        /**
         * ⚠ **머리띠만 그려진 상태에서 「다 그렸다」로 속으면 안 된다.**
         *   본문은 TanStack Query 가 나중에 채운다. 껍데기(GNB+서브내비)만 있어도
         *   글자 수가 90자쯤에서 잠깐 멈추는데, 그걸 안정으로 읽으면 **빈 화면을 찍는다.**
         *   실제로 그렇게 11장을 헛찍었다 — 리그홈이 94자로 나왔다.
         *
         * 그래서 두 가지를 같이 건다.
         *   ① 최소 `minSettleMs` 는 무조건 기다린다 (그 전에는 안정으로 인정하지 않는다)
         *   ② 그 뒤로 **네 번 연속** 같은 길이여야 끝낸다 (0.7초 × 4 ≈ 2.8초)
         */
        const waitedEnough = Date.now() - startedAt >= minSettleMs
        if (len === last && len > 60) {
          if (++stable >= 4 && waitedEnough) break
        } else {
          stable = 0
        }
        last = len
      }
      await sleep(waitMs)

      if (after) {
        trace(`${name}: 펼친다 — ${after.slice(0, 60)}`)
        const done = await withTimeout(
          browser.send('Runtime.evaluate', { expression: after, returnByValue: true, awaitPromise: true }, sessionId),
          30000, 'after-script')
        trace(`${name}: 펼침 결과 ${JSON.stringify(done.result?.value ?? done.exceptionDetails?.text ?? null)}`)
        await sleep(2500)
      }

      let hoverReport = null
      if (hoverSel) {
        const box = await browser.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(hoverSel)});
            if (!el) return null; el.scrollIntoView({block:'center'});
            const b = el.getBoundingClientRect();
            return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2),
                     before: getComputedStyle(el).color, text: el.textContent.trim().slice(0,20) } })()`,
          returnByValue: true,
        }, sessionId)
        const b = box.result?.value
        if (b) {
          await browser.send('Input.dispatchMouseEvent',
            { type: 'mouseMoved', x: b.x, y: b.y, buttons: 0 }, sessionId)
          await sleep(600)
          const after2 = await browser.send('Runtime.evaluate', {
            expression: `getComputedStyle(document.querySelector(${JSON.stringify(hoverSel)})).color`,
            returnByValue: true,
          }, sessionId)
          hoverReport = { selector: hoverSel, text: b.text, before: b.before, after: after2.result?.value }
          trace(`${name}: hover ${JSON.stringify(hoverReport)}`)
        } else {
          trace(`${name}: hover 대상 **못 찾음** ${hoverSel}`)
        }
      }

      trace(`${name}: 검사`)
      const probe = await withTimeout(
        browser.send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: false }, sessionId),
        60000, 'probe')

      /** 선택자를 줬으면 그 요소의 사각형만 찍는다. 없으면 전체 페이지다. */
      let clipOverride = null
      if (sel) {
        const r = await browser.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return null; el.scrollIntoView();
            const b = el.getBoundingClientRect();
            return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height } })()`,
          returnByValue: true,
        }, sessionId)
        clipOverride = r.result?.value ?? null
        trace(`${name}: 선택자 ${sel} → ${clipOverride ? '찾음' : '**못 찾음**'}`)
      }

      const metrics = await browser.send('Page.getLayoutMetrics', {}, sessionId)
      const probed = probe.result?.value ?? {}
      // `cssContentSize` 는 뷰포트를 강제하면 뷰포트 크기로 잘려 나온다. 페이지가 스스로
      // 보고한 `scrollHeight` 를 우선한다 — 그래야 전체 페이지가 한 장에 담긴다.
      const cw = Math.ceil(Math.max(metrics.cssContentSize.width, probed.scrollWidth || 0))
      const ch = Math.min(
        Math.ceil(Math.max(metrics.cssContentSize.height, probed.scrollHeight || 0)),
        20000,
      )

      trace(`${name}: 촬영`)
      const shot = await withTimeout(
        browser.send(
        'Page.captureScreenshot',
        {
          format: 'png',
          captureBeyondViewport: true,
          clip: clipOverride
            ? { ...clipOverride, scale: 2 }
            : { x: 0, y: 0, width: Math.max(cw, width), height: ch, scale: 1 },
        },
        sessionId,
      ), 120000, 'captureScreenshot')

      const png = join(outDir, `${name}.png`)
      writeFileSync(png, Buffer.from(shot.data, 'base64'))
      const p = probe.result?.value ?? { error: JSON.stringify(probe).slice(0, 300) }
      report.push({ name, url, width, png, fullHeight: ch, hover: hoverReport, probe: p })
      console.log(
        `${name.padEnd(24)} ${String(ch).padStart(5)}px  ` +
          `가로스크롤:${p.overflowX?.hasHScroll ? '있음(!)' : '없음'}  ` +
          `대비<3:${p.contrast?.under3 ?? '?'}  ` +
          `진홍면:${p.accent?.filledBlocks?.length ?? '?'}  ` +
          `진홍글자:${p.accentText?.count ?? '?'}  ` +
          `비모노숫자:${p.numerals?.nonMonoCount ?? '?'}`,
      )
    } catch (e) {
      report.push({ name, url, width, error: String(e) })
      console.log(`${name.padEnd(24)} 실패: ${e}`)
    } finally {
      await withTimeout(browser.send('Target.closeTarget', { targetId }), 20000, 'closeTarget').catch(() => {})
    }
  }

  writeFileSync(join(outDir, `report-${width}.json`), JSON.stringify(report, null, 2))
  console.log(`\n→ ${join(outDir, `report-${width}.json`)}`)
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 프로필 정리 실패는 무시한다 */
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  chrome.kill()
  process.exit(1)
})
