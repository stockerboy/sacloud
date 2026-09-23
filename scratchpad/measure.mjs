/**
 * ★CDP 로 「재는」 도구★ — `shot.mjs` 의 배관을 그대로 쓰고 사진 대신 ★숫자★ 를 낸다.
 *
 *   node scratchpad/measure.mjs <url> <가로> <세로> <잴파일.js> [기다릴글자]
 *
 * `<잴파일.js>` 는 페이지 안에서 평가되는 ★하나의 식★ 이다 (문자열을 돌려줘야 한다).
 * `--window-size` 는 거짓말하므로 `Emulation.setDeviceMetricsOverride` 로 뷰포트를 박는다.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, wRaw, hRaw, exprFile, waitFor] = process.argv.slice(2)
const width = Number(wRaw ?? 393)
const height = Number(hRaw ?? 852)
const expression = readFileSync(exprFile, 'utf8')
/* 7번째 인자가 있으면 식 안에서 window.__QA_CLICK 으로 읽어 누른다 (qa.js) */
const qaClick = process.argv[8]

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))
if (!CHROME) { console.error('크롬을 못 찾았다'); process.exit(1) }

const profile = mkdtempSync(join(tmpdir(), 'sacloud-measure-'))
const port = 9600 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function findWs() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = tabs.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* 아직 */ }
    await sleep(250)
  }
  throw new Error('크롬 디버그 주소를 못 찾았다')
}
const ws = new WebSocket(await findWs())
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const waiting = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && waiting.has(m.id)) {
    const { res, rej } = waiting.get(m.id); waiting.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
}
const send = (method, params = {}) => new Promise((res, rej) => {
  id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }))
})

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 2, mobile: width < 700,
})
/*
 * ★UA 도 같이 폰으로 바꾼다★ — 뷰포트만 393 으로 줄이면 ★서버가 PC 화면을 내준다.★
 *   서플라이를 393px 로 쟀더니 `vw=1120` 이 나왔다 (PC 판 `sp-pc-*` 가 그대로 왔다).
 *   UA 를 안 바꾸면 ★서플라이 폰 화면을 한 번도 못 본 채 흉내 내게 된다.★
 */
if (width < 700) {
  await send('Emulation.setUserAgentOverride', {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
  }).catch(() => {})
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {})
}
await send('Page.navigate', { url })
if (qaClick) await send('Runtime.evaluate', { expression: `window.__QA_CLICK = ${JSON.stringify(qaClick)}` }).catch(() => {})
await sleep(4000)
if (waitFor) {
  for (let i = 0; i < 40; i += 1) {
    const r = await send('Runtime.evaluate', {
      expression: `document.body.innerText.includes(${JSON.stringify(waitFor)})`, returnByValue: true,
    })
    if (r.result?.value === true) break
    await sleep(500)
  }
}
await sleep(1500)
/* 6번째 인자 — 재기 전에 누를 글자. React 가 붙기 전에 누르면 아무 일 없으니 「기다릴글자」 가 뜰 때까지 다시 누른다 (2026-09-23) */
const clickText = process.argv[7]
if (clickText) {
  let state = 'not found'
  for (let i = 0; i < 40 && state !== 'clicked'; i += 1) {
    const c = await send('Runtime.evaluate', {
      expression: `(() => { const el = [...document.querySelectorAll('span,button,a,div')].find(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(clickText)}); if (el) { el.click(); return 'clicked' } return 'not found' })()`,
      returnByValue: true,
    })
    state = c.result?.value
    if (state !== 'clicked') { await sleep(500); continue }
    if (waitFor) {
      /* 단추는 토글 — 4초까지 기다렸다가 안 뜨면 다시 누른다 */
      let seen = false
      for (let j = 0; j < 8 && !seen; j += 1) {
        await sleep(500)
        const ok = await send('Runtime.evaluate', { expression: `document.body.innerText.includes(${JSON.stringify(waitFor)})`, returnByValue: true })
        seen = ok.result?.value === true
      }
      if (!seen) { state = 'clicked-but-nothing'; await sleep(600) }
    }
  }
  console.error('click', clickText, state)
  await sleep(1200)
}
const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
if (r.exceptionDetails) console.error('식이 터졌다:', JSON.stringify(r.exceptionDetails).slice(0, 400))
console.log(r.result?.value ?? '(빈 결과)')
ws.close(); chrome.kill(); await sleep(400)
try { rmSync(profile, { recursive: true, force: true }) } catch { /* ok */ }
process.exit(0)
