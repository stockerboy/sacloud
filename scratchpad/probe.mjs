/**
 * 화면에 대고 ★한 가지만 물어본다★ — 사진으로는 못 가리는 것을 가릴 때 쓴다.
 *
 *   node scratchpad/probe.mjs <url> <가로> "<브라우저에서 돌릴 식>"
 *
 * 식은 문자열을 돌려주게 쓴다 (`JSON.stringify(...)`).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, wRaw, expr] = process.argv.slice(2)
const width = Number(wRaw ?? 390)
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'sacloud-probe-'))
const port = 9500 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let wsUrl = null
for (let i = 0; i < 80; i += 1) {
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = tabs.find((t) => t.type === 'page')
    if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break }
  } catch { /* 아직 */ }
  await sleep(250)
}
const ws = new WebSocket(wsUrl)
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

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 })
await send('Page.navigate', { url })
await sleep(6000)
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
console.log(r.result?.value ?? r.exceptionDetails?.text ?? '(없음)')
ws.close(); chrome.kill(); await sleep(300)
try { rmSync(profile, { recursive: true, force: true }) } catch { /* 지워지면 좋고 */ }
process.exit(0)
