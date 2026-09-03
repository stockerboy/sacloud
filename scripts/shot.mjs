/**
 * **화면을 폰 크기로 찍는다** (2026-09-04).
 *
 * ══ ★왜 필요한가★ ══
 *
 * 사장님은 ★폰으로 보신다.★ 그런데 화면을 눈으로 확인할 길이 없었다 —
 * 크롬 확장(`javascript_tool`)이 ★네 번 중 한 번만★ 붙는다.
 *
 * ⚠ ★`chrome --headless --window-size=390,900 --screenshot` 은 거짓말을 한다.★
 *   사진은 390px 로 나오는데 ★레이아웃은 기본 창 크기로 계산된다.★
 *   그래서 `max-md:` (767px 이하) 규칙이 ★안 먹은 화면★ 이 찍힌다.
 *   실제로 그 사진을 보고 ★「폰에서 글이 잘린다」고 잘못 판단할 뻔했다.★
 *   ★사진이 390 이라고 뷰포트가 390 인 것이 아니다.★
 *
 * ★그래서 CDP 로 뷰포트를 직접 준다★ — `Emulation.setDeviceMetricsOverride`.
 * 그러면 미디어쿼리가 그 폭으로 계산된다.
 *
 * ══ 쓰는 법 ══
 * ```
 * node scripts/shot.mjs <주소> <나갈파일> [폭] [높이]
 * node scripts/shot.mjs https://3rdcloud.my/ /tmp/home.png 390 900
 * ```
 * ★스크롤 전체를 찍는다★ (`captureBeyondViewport`) — 폰에서 아래까지 어떻게 보이는지 봐야 한다.
 *
 * ⚠ ★사장님이 쓰는 크롬 창을 건드리지 않는다★ — 따로 띄우고 따로 끈다.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const [url, out, wArg, hArg, fullArg] = process.argv.slice(2)
if (!url || !out) {
  console.error('쓰는 법: node scripts/shot.mjs <주소> <나갈파일> [폭] [높이]')
  process.exit(1)
}
const width = Number(wArg ?? 390)
const height = Number(hArg ?? 900)
/** 화면이 그려질 때까지 기다리는 시간 — 데이터를 받아 그리는 화면이라 넉넉히 준다 */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 9000)
const PORT = 9222 + Math.floor(Math.random() * 500)

const profile = mkdtempSync(join(tmpdir(), 'shot-'))
const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 디버깅 포트가 열릴 때까지 기다린다 — 바로 붙으면 실패한다 */
async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch {
      /* 아직 안 떴다 */
    }
    await sleep(250)
  }
  throw new Error('크롬 디버깅 포트가 안 열렸다')
}

function cdp(ws) {
  let id = 0
  const waiting = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id)
      waiting.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1
      waiting.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
}

try {
  const wsUrl = await endpoint()
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  const send = cdp(ws)

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => send(m, p, sessionId)

  /* ★여기가 핵심★ — 뷰포트를 직접 준다. 이래야 미디어쿼리가 그 폭으로 계산된다 */
  await s('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  })
  await s('Page.enable')
  await s('Page.navigate', { url })
  await sleep(SETTLE_MS)

  /* ★페이지가 실제로 얼마나 넓은지도 같이 잰다★ — 가로 스크롤을 눈이 아니라 숫자로 본다 */
  const { result } = await s('Runtime.evaluate', {
    expression:
      '({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,' +
      ' bodyW: document.body.scrollWidth, title: document.title })',
    returnByValue: true,
  })
  const m = result.value
  const over = m.scrollW - m.clientW
  console.log(
    `폭 ${m.clientW}px · 문서 ${m.scrollW}px · ${over > 0 ? `★가로로 ${over}px 넘친다★` : '넘치지 않는다 ✓'}`,
  )

  /*
   * ★다섯째 인자★
   * ```
   * (없음)            전체를 찍는다
   * viewport          보이는 만큼만
   * ★clip:y,높이★    ★그 자리만 잘라서 찍는다★ — 카드 하나만 보고 싶을 때
   * ```
   * ★자를 수 있어야 쓸모가 있다★ — 전체 사진은 길어서 무엇이 문제인지 가리키지 못한다.
   */
  const clipArg = fullArg?.startsWith('clip:') ? fullArg.slice(5).split(',').map(Number) : null
  const shot = await s('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullArg !== 'viewport',
    ...(clipArg && clipArg.length === 2
      ? { clip: { x: 0, y: clipArg[0], width, height: clipArg[1], scale: 1 } }
      : {}),
  })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`찍었다 — ${out}`)
  ws.close()
} finally {
  child.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 지워지지 않아도 그만이다 */
  }
}
