/**
 * 병영수첩 탐침 — 「진짜 크롬」이 GitHub Actions 실행기에서도 열리는가 (2026-09-02)
 *
 * ── 왜
 *   IPL 기록은 병영수첩(`https://barracks.sa.nexon.com`)에서만 받을 수 있는데,
 *   Node 로 부르면 403 이고 **진짜(헤드풀) 크롬에서만 200** 이다
 *   (`docs/HANDOFF_2026-09-02_EVENING.md` 5장). 앞 세션은 **헤드리스도 403** 을 확인했다.
 *   사장님 결정은 「돈 안 드는 방법만」 — 후보 ① GitHub Actions 무료 실행기 ② 사장님 PC.
 *   ①이 되면 사람 손이 완전히 빠지므로 **①을 먼저 시험한다.** 데이터센터 IP 라서 막힐 수도
 *   있는데, **그건 돌려 봐야 안다.** 이 스크립트는 그 시험 한 번을 위한 것이다.
 *
 * ── 무엇을
 *   크롬 하나를 띄워 아래 셋을 **순서대로 · 2초 간격으로** 보내고,
 *   각각의 HTTP 상태 · 응답 크기 · 앞 200자를 찍는다.
 *
 *     1. GET  https://barracks.sa.nexon.com/                       (첫 페이지)
 *     2. POST /api/ClanHome/GetClanMatchList/   { clan_id: "sorentolove" }   ← 끝 슬래시 필요
 *     3. POST /api/BattleLog/GetBattleLogClan/260805205259124001/170430000194
 *
 *   2·3 은 **1 에서 연 페이지 안에서 `fetch`** 로 보낸다 — 브라우저가 평소 보내는 그대로다.
 *   UA·Referer·쿠키를 손으로 짜 넣지 않고, 탐지 회피 플래그도 넣지 않는다 (`CLAUDE.md` 3-A 5번).
 *   헤드풀과 헤드리스를 **같은 실행기에서 한 번씩** 돌린다. 둘의 차이가 곧 답이다.
 *
 * ── 어떻게 (의존성을 저장소에 넣지 않는다)
 *   puppeteer 는 `pnpm-lock.yaml` 에 들어가지 않는다. 워크플로가 실행기의 임시 폴더에
 *   `npm install puppeteer@<고정>` 을 한 뒤 **`NODE_PATH`** 로 그 위치를 알려 준다.
 *   ESM 의 `import` 는 `NODE_PATH` 를 안 보므로 `createRequire().resolve(…, { paths })` 로
 *   직접 찾아 `import()` 한다. 이 파일 자체는 순수 Node 이고 아무것도 설치하지 않는다.
 *
 *   사용법
 *     node scripts/barracks-probe.mjs --dry-run                      요청 없이 절차만 찍는다
 *     node scripts/barracks-probe.mjs --mode headful  --out a.json   xvfb 아래에서
 *     node scripts/barracks-probe.mjs --mode headless --out b.json
 *
 *   환경변수
 *     NODE_PATH            puppeteer 가 설치된 node_modules (필수 · dry-run 은 예외)
 *     PROBE_CHROME_PATH    실행기에 이미 있는 크롬 (`google-chrome`). 없으면 puppeteer 가 받은 것
 *     PROBE_PUBLIC_IP      워크플로가 curl 로 알아낸 공인 IP. 결과 JSON 에 함께 적는다
 *
 * ── 이 스크립트가 하지 않는 것
 *   저장하지 않는다. 창구(`/api/ingest/barracks`)로 보내지 않는다. 한 클랜 · 한 경기만 본다.
 *   **결과가 200 이어도 「수집이 된다」가 아니라 「길이 열려 있다」까지다.**
 */

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/* --------------------------------------------------------------- 설정 --- */

const ORIGIN = 'https://barracks.sa.nexon.com'

/** 요청 사이 간격(ms). **원본에 무리 주지 마라** — 지시서가 정한 값이다 */
const GAP_MS = 2000

/** 한 요청을 기다려 주는 상한(ms). WAF 가 붙잡고 안 놓는 경우가 있어 무한정 기다리지 않는다 */
const REQUEST_TIMEOUT_MS = 30_000

/** 로그에 찍을 본문 앞부분 길이 */
const HEAD_CHARS = 200

/**
 * 시험할 요청 셋. 순서가 곧 절차다.
 *   · `kind: 'navigate'` 는 `page.goto` — 첫 페이지를 브라우저가 여는 방식 그대로
 *   · `kind: 'fetch'`    는 그 페이지 안에서 `fetch(path, init)` — 원본 화면의 JS 가 하는 것과 같다
 * 값의 출처: `docs/IPL_SPEC.md` 7장 · `docs/HANDOFF_2026-09-02_EVENING.md` 5-2
 */
const STEPS = [
  {
    id: 'home',
    kind: 'navigate',
    method: 'GET',
    path: '/',
  },
  {
    id: 'clan-match-list',
    kind: 'fetch',
    method: 'POST',
    // 끝 슬래시가 없으면 다른 경로다 (IPL_SPEC 7장)
    path: '/api/ClanHome/GetClanMatchList/',
    headers: { 'Content-Type': 'application/json' },
    // 키 이름은 정확히 `clan_id` · 값은 URL slug. `clan_no` 를 주면 rtnCode -999
    body: JSON.stringify({ clan_id: 'sorentolove' }),
  },
  {
    id: 'battle-log',
    kind: 'fetch',
    method: 'POST',
    // 문서의 실측 예시 키 (200 · 63,429 바이트였다)
    path: '/api/BattleLog/GetBattleLogClan/260805205259124001/170430000194',
  },
]

/* --------------------------------------------------------------- 인자 --- */

function parseArgs(argv) {
  const args = { dryRun: false, mode: 'headful', out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--mode') args.mode = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log('node scripts/barracks-probe.mjs [--dry-run] [--mode headful|headless] [--out <file>]')
      process.exit(0)
    } else {
      console.error(`모르는 인자: ${a}`)
      process.exit(2)
    }
  }
  if (args.mode !== 'headful' && args.mode !== 'headless') {
    console.error(`--mode 는 headful 또는 headless 다 (받은 값: ${args.mode})`)
    process.exit(2)
  }
  return args
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function log(line) {
  console.log(`[probe] ${line}`)
}

/* --------------------------------------------------------------- dry-run --- */

/**
 * 요청을 **한 건도 보내지 않는다.** puppeteer 를 불러오지도 않는다.
 * 절차와 값만 찍어서 「무엇을 어떤 순서로 보낼 것인가」를 눈으로 확인하는 용도다.
 */
function printPlan(args) {
  log('dry-run — 요청을 보내지 않는다. 절차만 찍는다')
  log(`mode=${args.mode} · origin=${ORIGIN} · 간격 ${GAP_MS}ms · 상한 ${REQUEST_TIMEOUT_MS}ms`)
  log(`NODE_PATH=${process.env.NODE_PATH ?? '(없음 — 실제 실행에는 필요하다)'}`)
  log(`PROBE_CHROME_PATH=${process.env.PROBE_CHROME_PATH ?? '(없음 — puppeteer 가 받은 크롬을 쓴다)'}`)
  log(`PROBE_PUBLIC_IP=${process.env.PROBE_PUBLIC_IP ?? '(없음)'}`)
  STEPS.forEach((s, i) => {
    const via = s.kind === 'navigate' ? 'page.goto' : 'page fetch'
    log(`${i + 1}. [${s.id}] ${s.method} ${ORIGIN}${s.path}  (${via})`)
    if (s.headers) log(`     headers ${JSON.stringify(s.headers)}`)
    if (s.body) log(`     body    ${s.body}`)
    if (i < STEPS.length - 1) log(`     … ${GAP_MS}ms 쉰다`)
  })
  log('각 요청마다 status · bytes · 앞 200자를 찍고, --out 이 있으면 JSON 으로 쓴다')
  log('헤드풀은 xvfb-run 아래에서, 헤드리스는 그대로 — 워크플로가 두 번 부른다')
}

/* --------------------------------------------------------------- puppeteer --- */

/**
 * `NODE_PATH` 에서 puppeteer 를 찾아 `import()` 한다.
 * ESM `import` 는 NODE_PATH 를 무시하므로 CJS resolver 를 빌려 경로만 얻는다.
 */
async function loadPuppeteer() {
  const require = createRequire(import.meta.url)
  const paths = (process.env.NODE_PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
  let resolved
  try {
    resolved = require.resolve('puppeteer', { paths: paths.length > 0 ? paths : undefined })
  } catch (error) {
    throw new Error(
      `puppeteer 를 못 찾았다 (NODE_PATH=${process.env.NODE_PATH ?? '없음'}). ` +
        '워크플로가 임시 폴더에 설치하고 NODE_PATH 로 알려 줘야 한다. ' +
        `원인: ${error?.message ?? error}`,
    )
  }
  const mod = await import(pathToFileURL(resolved).href)
  const puppeteer = mod.default ?? mod
  if (typeof puppeteer.launch !== 'function') {
    throw new Error(`puppeteer 를 불러왔지만 launch 가 없다 (${resolved})`)
  }
  return { puppeteer, resolved }
}

/**
 * 크롬을 띄운다. `PROBE_CHROME_PATH` 가 있으면 그것을 먼저 시도하고,
 * 실패하면 puppeteer 가 받아 둔 크롬으로 **한 번 더** 시도한다 (어느 쪽을 썼는지 적는다).
 *
 * `--no-sandbox` 는 회피가 아니라 **실행기 사정**이다 — Ubuntu 24.04 실행기는 비특권
 * user namespace 를 막아 두어 크롬 샌드박스가 못 뜬다. 그 외 탐지 회피 플래그는 넣지 않는다.
 */
async function launchBrowser(puppeteer, mode) {
  const common = {
    headless: mode === 'headless',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,900',
      // 한국어 사이트다. 브라우저 언어를 한국어로 둔다 (사람이 쓰는 크롬과 같게)
      '--lang=ko-KR',
    ],
    defaultViewport: { width: 1280, height: 900 },
  }
  const wanted = process.env.PROBE_CHROME_PATH?.trim() || null
  if (wanted) {
    try {
      const browser = await puppeteer.launch({ ...common, executablePath: wanted })
      return { browser, executablePath: wanted, fallback: false }
    } catch (error) {
      log(`PROBE_CHROME_PATH(${wanted}) 로 못 띄웠다 — puppeteer 의 크롬으로 다시 시도한다: ${error?.message ?? error}`)
    }
  }
  const browser = await puppeteer.launch(common)
  const executablePath = browser.process()?.spawnfile ?? '(puppeteer 내장)'
  return { browser, executablePath, fallback: Boolean(wanted) }
}

/* --------------------------------------------------------------- 요청 --- */

function head(text) {
  // 개행을 눌러 한 줄로. 로그에서 한눈에 보려는 것이다
  return String(text ?? '').slice(0, HEAD_CHARS).replace(/\s+/g, ' ')
}

async function runNavigate(page, step) {
  const url = `${ORIGIN}${step.path}`
  const started = Date.now()
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: REQUEST_TIMEOUT_MS,
  })
  const ms = Date.now() - started
  if (!response) {
    return { status: null, bytes: null, head: null, ms, error: 'goto 가 응답을 돌려주지 않았다' }
  }
  let bytes = null
  let text = ''
  try {
    const buf = await response.buffer()
    bytes = buf.length
    text = buf.toString('utf8')
  } catch (error) {
    text = `(본문을 못 읽었다: ${error?.message ?? error})`
  }
  return {
    status: response.status(),
    bytes,
    head: head(text),
    ms,
    finalUrl: page.url(),
    contentType: response.headers()['content-type'] ?? null,
    error: null,
  }
}

async function runFetch(page, step) {
  const started = Date.now()
  // 페이지 안에서 돈다. 여기서 만든 헤더는 `Content-Type` 뿐이다
  const result = await page.evaluate(
    async ({ path: p, method, headers, body, timeoutMs }) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(p, {
          method,
          credentials: 'include',
          headers: headers ?? undefined,
          body: body ?? undefined,
          signal: controller.signal,
        })
        const text = await res.text()
        return {
          status: res.status,
          text,
          contentType: res.headers.get('content-type'),
          error: null,
        }
      } catch (error) {
        return { status: null, text: '', contentType: null, error: String(error?.message ?? error) }
      } finally {
        clearTimeout(timer)
      }
    },
    {
      path: step.path,
      method: step.method,
      headers: step.headers ?? null,
      body: step.body ?? null,
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
  )
  const ms = Date.now() - started
  return {
    status: result.status,
    bytes: result.error ? null : Buffer.byteLength(result.text, 'utf8'),
    head: result.error ? null : head(result.text),
    ms,
    contentType: result.contentType,
    error: result.error,
  }
}

/* --------------------------------------------------------------- 본체 --- */

async function probe(args) {
  const startedAt = new Date().toISOString()
  const out = {
    probedAt: startedAt,
    mode: args.mode,
    origin: ORIGIN,
    gapMs: GAP_MS,
    runner: {
      publicIp: process.env.PROBE_PUBLIC_IP ?? null,
      platform: `${os.platform()} ${os.release()}`,
      node: process.version,
      display: process.env.DISPLAY ?? null,
    },
    browser: null,
    requests: [],
    fatal: null,
  }

  let browser = null
  try {
    const { puppeteer, resolved } = await loadPuppeteer()
    log(`puppeteer ← ${resolved}`)

    const launched = await launchBrowser(puppeteer, args.mode)
    browser = launched.browser
    const page = await browser.newPage()
    const userAgent = await page.evaluate(() => navigator.userAgent)
    const webdriver = await page.evaluate(() => navigator.webdriver)
    out.browser = {
      version: await browser.version(),
      executablePath: launched.executablePath,
      fallbackToBundled: launched.fallback,
      headless: args.mode === 'headless',
      userAgent,
      // 진짜 크롬도 자동화로 띄우면 true 다. 사이트가 이걸 보는지는 결과가 말해 준다. 손대지 않는다
      navigatorWebdriver: webdriver,
    }
    log(`browser ${out.browser.version} · ${launched.executablePath} · webdriver=${webdriver}`)
    log(`UA ${userAgent}`)

    for (let i = 0; i < STEPS.length; i += 1) {
      const step = STEPS[i]
      log(`${i + 1}/${STEPS.length} [${step.id}] ${step.method} ${step.path}`)
      let r
      try {
        r = step.kind === 'navigate' ? await runNavigate(page, step) : await runFetch(page, step)
      } catch (error) {
        r = { status: null, bytes: null, head: null, ms: null, error: String(error?.message ?? error) }
      }
      const row = { id: step.id, method: step.method, url: `${ORIGIN}${step.path}`, ...r }
      out.requests.push(row)
      if (row.error) {
        log(`   → 실패: ${row.error}`)
      } else {
        log(`   → HTTP ${row.status} · ${row.bytes} bytes · ${row.ms}ms · ${row.contentType ?? ''}`)
        log(`   → ${row.head}`)
      }
      if (i < STEPS.length - 1) await sleep(GAP_MS)
    }
  } catch (error) {
    out.fatal = String(error?.stack ?? error)
    log(`치명적 오류: ${error?.message ?? error}`)
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        /* 닫다 죽어도 결과는 이미 있다 */
      }
    }
  }

  // 한 줄 요약 — 워크플로 로그에서 이 줄만 봐도 된다
  const summary = out.requests.map((r) => `${r.id}=${r.status ?? 'ERR'}`).join(' · ')
  log(`요약 [${args.mode}] ${summary}${out.fatal ? ' · FATAL' : ''}`)

  if (args.out) {
    await writeFile(args.out, JSON.stringify(out, null, 2), 'utf8')
    log(`결과 → ${args.out}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.dryRun) {
  printPlan(args)
  process.exit(0)
}

const result = await probe(args)
// 요청 자체를 못 보낸 것(puppeteer 없음 · 크롬 못 띄움)만 실패다.
// 403 은 **결과**이지 오류가 아니다 — 그 숫자를 보려고 도는 것이다
process.exit(result.fatal ? 1 : 0)
