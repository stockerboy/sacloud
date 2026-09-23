/**
 * ★CDP 로 화면을 찍는다★ — `--window-size` 는 거짓말한다 (메모리 참조).
 *
 * 쓰는 법:
 *   node scratchpad/shot.mjs <url> <가로> <세로> <나갈파일.png> [기다릴글자]
 *
 * 크롬을 헤드리스로 띄우고 `Emulation.setDeviceMetricsOverride` 로 ★뷰포트를 직접★
 * 지정한다. 그래야 390px 이 진짜 390px 이다. 다 찍으면 크롬을 스스로 내린다.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, wRaw, hRaw, out, waitFor, only] = process.argv.slice(2)
if (!url || !out) {
  console.error('쓰는 법: node scratchpad/shot.mjs <url> <가로> <세로> <파일.png> [기다릴글자]')
  process.exit(1)
}
const width = Number(wRaw ?? 390)
const height = Number(hRaw ?? 900)

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'sacloud-shot-'))
const port = 9200 + Math.floor(Math.random() * 400)
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findWs() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const tabs = await res.json()
      const page = tabs.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* 아직 안 떴다 */ }
    await sleep(250)
  }
  throw new Error('크롬 디버그 주소를 못 찾았다')
}

const ws = new WebSocket(await findWs())
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let id = 0
const waiting = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && waiting.has(msg.id)) {
    const { res, rej } = waiting.get(msg.id)
    waiting.delete(msg.id)
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    id += 1
    waiting.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
/*
 * ★헤드리스에서는 requestAnimationFrame 이 멈춰 선다★ — 창이 안 보이는 것으로 치기 때문이다.
 *   그러면 육각형같이 «그려지는» 그림이 끝까지 안 가고, 축 이름이 opacity 0 으로 남는다.
 *   실제 폰에서는 멀줦한데 사진에만 글자가 없어 ★없는 버그를 쪼게 된다.★
 *   초점을 가진 것으로 속여 시계를 돌린다.
 */
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})
/* ★뷰포트를 직접 박는다★ — 창 크기가 아니라 이것이 진짜 화면 폭이다 */
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 2, mobile: width < 700,
})
/*
 * ★UA 도 폰으로 바꾼다★ (2026-09-22) — 뷰포트만 줄이면 ★서버가 PC 판을 내준다.★
 *   서플라이를 393px 로 찍었더니 `scrollW 1120` 짜리 PC 화면이 나왔다.
 *   이걸 모르고 「서플라이 폰은 이렇구나」 하면 ★처음부터 틀린 것을 베낀다.★
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
await sleep(3500)

/* 7번째 인자 — 찍기 전에 그 글자를 가진 요소를 누른다 (폰 「경기분석」 처럼 눌러야 나오는 것) */
const clickText = process.argv[8]
if (clickText) {
  /* 2026-09-23 오후 — dev 서버가 느리면 3.5초 안에 단추가 안 떠서 「not found」 가 났다 → 최대 20초 기다리며 다시 찾는다 */
  let clicked = 'not found'
  for (let i = 0; i < 40 && clicked !== 'clicked'; i += 1) {
    const r = await send('Runtime.evaluate', {
      /* 2026-09-24 — `@라벨` 이면 aria-label 로 찾는다 (햄버거처럼 글자가 없는 단추) */
      expression: `(() => { const want = ${JSON.stringify(clickText)}; const el = want.startsWith('@') ? document.querySelector('[aria-label=' + JSON.stringify(want.slice(1)) + ']') : [...document.querySelectorAll('span,button,a,div')].find(e => e.children.length === 0 && e.textContent.trim() === want); if (el) { el.click(); return 'clicked' } return 'not found' })()`,
      returnByValue: true,
    })
    clicked = r.result?.value
    if (clicked !== 'clicked') { await sleep(500); continue }
    /* 서버가 그린 글자는 있는데 React 가 아직 안 붙었으면 눌러도 아무 일 없다 → 기다릴 글자가 안 뜨면 다시 누른다 */
    if (waitFor) {
      /* ⚠ 단추는 토글이다 — 너무 빨리 「안 떴네」 하고 다시 누르면 도로 닫힌다. 4초까지 기다려 본다 */
      let seen = false
      for (let j = 0; j < 8 && !seen; j += 1) {
        await sleep(500)
        const ok = await send('Runtime.evaluate', { expression: `document.body.innerText.includes(${JSON.stringify(waitFor)})`, returnByValue: true })
        seen = ok.result?.value === true
      }
      if (!seen) { clicked = 'clicked-but-nothing'; await sleep(600) }
    }
  }
  console.log('click', clickText, clicked)
  await sleep(1500)
}

if (waitFor) {
  for (let i = 0; i < 40; i += 1) {
    const r = await send('Runtime.evaluate', {
      expression: `document.body.innerText.includes(${JSON.stringify(waitFor)})`,
      returnByValue: true,
    })
    if (r.result?.value === true) break
    await sleep(500)
  }
}
await sleep(1200)

/* 가로 스크롤이 생겼는지도 같이 재 온다 — 폰에서 제일 흔한 사고다 */
const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    h: document.documentElement.scrollHeight,
  })`,
  returnByValue: true,
})
console.log('probe', probe.result?.value)

/* «viewport» 를 더 주면 보이는 한 화면만 찍는다 — 위쪽을 크게 보고 싶을 때 */
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: only !== 'viewport' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('saved', out)

ws.close()
chrome.kill()
await sleep(400)
try { rmSync(profile, { recursive: true, force: true }) } catch { /* 지워지면 좋고 */ }
process.exit(0)
