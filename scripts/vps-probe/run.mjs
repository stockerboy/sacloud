/**
 * Vultr 서울에 1시간짜리 서버를 만들어 병영수첩 탐침을 돌리고 **반드시 지운다** (2026-09-02 · 지시 #8)
 *
 * ── 흐름
 *   1. 서울 리전(icn) · 최저 사양 플랜(1vCPU · RAM ≥ --min-ram) · Ubuntu 24.04 x64 를 API 로 고른다
 *   2. `setup.sh` 를 cloud-init user-data 로 넣어 인스턴스를 만든다 (토큰을 심는다)
 *   3. 서버가 뜨고 setup.sh 가 끝나 `http://<IP>:8080/<토큰>/probe-result.json` 을 내놓을 때까지 기다린다
 *   4. 결과를 받아 파일로 저장하고 요약을 찍는다
 *   5. **인스턴스를 삭제한다.** 삭제가 확인될 때까지 다시 시도하고, 그래도 안 되면 크게 경고한다
 *
 * ── 비밀값
 *   API 키는 환경변수 `VULTR_API_KEY` 로만 받는다. **파일에 적지 않는다.** 로그에도 안 찍는다.
 *
 * ── 이 PC 사정
 *   소켓이 EFAULT 로 가끔 끊긴다. 모든 HTTP 호출을 8회까지 다시 시도한다.
 *   Ctrl+C 를 눌러도 만들어 둔 인스턴스는 지우고 나간다.
 *
 * ── 사용법
 *   node scripts/vps-probe/run.mjs --dry-run              API 를 한 번도 부르지 않고 절차만 찍는다
 *   $env:VULTR_API_KEY = '...'; node scripts/vps-probe/run.mjs [--min-ram 2048] [--timeout-min 15] [--out 파일]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://api.vultr.com/v2'
const REGION_HINT = 'icn' // Vultr 서울
const OS_NAME = 'Ubuntu 24.04 LTS x64'
const LABEL = 'sacloud-barracks-probe'
const RESULT_PORT = 8080
const RETRIES = 8

const here = path.dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString().slice(11, 19)
const log = (line) => console.log(`[${now()}] ${line}`)

function parseArgs(argv) {
  const args = { dryRun: false, minRam: 1024, timeoutMin: 15, out: `vps-probe-result-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json` }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--min-ram') args.minRam = Number(argv[++i])
    else if (a === '--timeout-min') args.timeoutMin = Number(argv[++i])
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log('node run.mjs [--dry-run] [--min-ram 1024|2048] [--timeout-min 15] [--out <file>]')
      process.exit(0)
    } else {
      console.error(`모르는 인자: ${a}`)
      process.exit(2)
    }
  }
  return args
}

/* --------------------------------------------------------------- HTTP --- */

/** EFAULT · 끊김 · 429 · 5xx 를 8회까지 다시 시도한다. 4xx 는 바로 실패다 (키가 틀렸거나 요청이 틀린 것) */
async function retry(label, fn, tries = RETRIES) {
  let last
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      last = error
      const fatal = error?.noRetry === true
      if (fatal || attempt === tries) break
      const wait = Math.min(15000, 1500 * attempt)
      log(`${label} 실패 (${attempt}/${tries}): ${error?.message ?? error} — ${wait}ms 뒤 다시`)
      await sleep(wait)
    }
  }
  throw last
}

function vultr(apiKey) {
  return async function call(method, route, body) {
    const res = await fetch(`${API}${route}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    if (res.status === 429 || res.status >= 500) throw new Error(`Vultr ${method} ${route} → HTTP ${res.status}`)
    if (!res.ok) {
      const e = new Error(`Vultr ${method} ${route} → HTTP ${res.status}: ${text.slice(0, 300)}`)
      e.noRetry = true
      e.status = res.status
      throw e
    }
    return text ? JSON.parse(text) : {}
  }
}

/* --------------------------------------------------------------- 고르기 --- */

async function pickRegion(call) {
  const { regions } = await retry('regions', () => call('GET', '/regions?per_page=500'))
  const byId = regions.find((r) => r.id === REGION_HINT)
  const byCity = regions.find((r) => /seoul/i.test(r.city ?? ''))
  const region = byId ?? byCity
  if (!region) throw new Error('서울 리전을 못 찾았다 — Vultr 리전 목록에 icn/Seoul 이 없다')
  return region
}

async function pickPlan(call, regionId, minRam) {
  const { plans } = await retry('plans', () => call('GET', '/plans?type=vc2&per_page=500'))
  const ok = plans
    .filter((p) => Array.isArray(p.locations) && p.locations.includes(regionId))
    .filter((p) => (p.ram ?? 0) >= minRam && (p.vcpu_count ?? 0) >= 1)
    .sort((a, b) => (a.monthly_cost ?? 1e9) - (b.monthly_cost ?? 1e9) || (a.ram ?? 0) - (b.ram ?? 0))
  if (ok.length === 0) throw new Error(`서울에서 RAM ≥ ${minRam}MB 인 vc2 플랜이 없다`)
  return ok[0]
}

async function pickOs(call) {
  const { os } = await retry('os', () => call('GET', '/os?per_page=500'))
  const exact = os.find((o) => o.name === OS_NAME)
  const loose = os.find((o) => /ubuntu 24\.04/i.test(o.name ?? '') && /x64/i.test(o.name ?? ''))
  const chosen = exact ?? loose
  if (!chosen) throw new Error(`${OS_NAME} 를 못 찾았다`)
  return chosen
}

/* --------------------------------------------------------------- user-data --- */

async function buildUserData(token) {
  let sh = await readFile(path.join(here, 'setup.sh'), 'utf8')
  // 윈도우 체크아웃이면 CRLF 다. cloud-init 은 LF 여야 한다 — 그대로 넣으면 `\r` 이 명령 끝에 붙어 전부 깨진다
  sh = sh.replace(/\r\n/g, '\n')
  if (!sh.startsWith('#!/bin/bash')) throw new Error('setup.sh 가 #!/bin/bash 로 시작하지 않는다')
  if (!sh.includes('__PROBE_TOKEN__')) throw new Error('setup.sh 에 __PROBE_TOKEN__ 자리가 없다')
  sh = sh.replace('TOKEN="__PROBE_TOKEN__"', `TOKEN="${token}"`)
  return { script: sh, base64: Buffer.from(sh, 'utf8').toString('base64') }
}

/* --------------------------------------------------------------- 기다리기 --- */

async function waitForInstance(call, id, timeoutMs) {
  const started = Date.now()
  let lastLine = ''
  while (Date.now() - started < timeoutMs) {
    const { instance } = await retry('instance', () => call('GET', `/instances/${id}`))
    const line = `status=${instance.status} server=${instance.server_status} power=${instance.power_status} ip=${instance.main_ip}`
    if (line !== lastLine) {
      log(`인스턴스 ${line}`)
      lastLine = line
    }
    if (instance.main_ip && instance.main_ip !== '0.0.0.0' && instance.status === 'active') return instance
    await sleep(10_000)
  }
  throw new Error('인스턴스가 시간 안에 active 가 되지 않았다')
}

async function waitForResult(ip, token, timeoutMs) {
  const url = `http://${ip}:${RESULT_PORT}/${token}/probe-result.json`
  const started = Date.now()
  let tries = 0
  while (Date.now() - started < timeoutMs) {
    tries += 1
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (res.status === 200) {
        const text = await res.text()
        return JSON.parse(text)
      }
    } catch {
      /* 아직 setup.sh 가 도는 중이다 */
    }
    if (tries % 6 === 1) log(`결과 기다리는 중 … ${Math.round((Date.now() - started) / 1000)}초 (${url})`)
    await sleep(15_000)
  }
  return null
}

/* --------------------------------------------------------------- 삭제 --- */

async function destroy(call, id) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await call('DELETE', `/instances/${id}`)
    } catch (error) {
      if (error?.status === 404) return true
      log(`삭제 요청 실패 (${attempt}/${RETRIES}): ${error?.message ?? error}`)
    }
    // 진짜 없어졌는지 본다
    await sleep(3000)
    try {
      await call('GET', `/instances/${id}`)
      log(`아직 남아 있다 (${attempt}/${RETRIES}) — 다시 지운다`)
    } catch (error) {
      if (error?.status === 404) return true
    }
    await sleep(Math.min(15000, 2000 * attempt))
  }
  return false
}

function screamNotDeleted(id, ip) {
  const bar = '!'.repeat(72)
  console.error(`\n${bar}\n!!  인스턴스를 지우지 못했다 — 돈이 계속 나간다\n!!  id=${id} ip=${ip ?? '?'}\n!!  Vultr 콘솔(my.vultr.com → Products) 에서 «${LABEL}» 을 직접 Destroy 해라\n!!  또는:  curl -X DELETE -H "Authorization: Bearer $VULTR_API_KEY" ${API}/instances/${id}\n${bar}\n`)
}

/* --------------------------------------------------------------- 본체 --- */

function printSummary(result) {
  const line = (r) => (r?.requests ?? []).map((q) => `${q.id}=${q.status ?? 'ERR'}`).join(' · ') || '(없음)'
  console.log('')
  console.log(`공인 IP      ${result.publicIp}`)
  console.log(`크롬         ${result.chrome}`)
  console.log(`puppeteer    ${line(result.puppeteerHeadful)}   webdriver=${result.puppeteerHeadful?.browser?.navigatorWebdriver}`)
  console.log(`맨 크롬      ${line(result.bareChrome)}   webdriver=${result.bareChrome?.browser?.navigatorWebdriver}`)
  if (result.puppeteerHeadful?.fatal) console.log(`puppeteer FATAL: ${String(result.puppeteerHeadful.fatal).split('\n')[0]}`)
  if (result.bareChrome?.fatal) console.log(`맨 크롬 FATAL: ${String(result.bareChrome.fatal).split('\n')[0]}`)
  console.log('')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = randomBytes(12).toString('hex')
  const userData = await buildUserData(token)

  if (args.dryRun) {
    log('dry-run — Vultr API 를 한 번도 부르지 않는다. 절차만 찍는다')
    log(`1. GET  ${API}/regions           → id=${REGION_HINT} (서울)`)
    log(`2. GET  ${API}/plans?type=vc2    → 서울 포함 · RAM ≥ ${args.minRam}MB · 가장 싼 것`)
    log(`3. GET  ${API}/os                → "${OS_NAME}"`)
    log(`4. POST ${API}/instances         label=${LABEL} · user_data=setup.sh(base64 ${userData.base64.length}자 · 토큰 ${token})`)
    log(`5. GET  ${API}/instances/<id>    10초마다 · active + IP 가 나올 때까지`)
    log(`6. GET  http://<IP>:${RESULT_PORT}/${token}/probe-result.json   15초마다 · 최대 ${args.timeoutMin}분`)
    log(`7. 결과 → ${args.out} · 요약 출력`)
    log(`8. DELETE ${API}/instances/<id>  404 가 확인될 때까지 ${RETRIES}회 · 실패하면 크게 경고`)
    log(`API 키: ${process.env.VULTR_API_KEY ? '환경변수에 있다 (값은 안 찍는다)' : '없다 — 실제 실행 전에 $env:VULTR_API_KEY 를 넣어라'}`)
    log(`user-data 첫 줄: ${userData.script.split('\n')[0]}  · 줄 수 ${userData.script.split('\n').length} · CRLF 없음=${!userData.script.includes('\r')}`)
    return 0
  }

  const apiKey = process.env.VULTR_API_KEY?.trim()
  if (!apiKey) {
    console.error('VULTR_API_KEY 환경변수가 없다. PowerShell:  $env:VULTR_API_KEY = "<키>"')
    return 2
  }
  const call = vultr(apiKey)

  const region = await pickRegion(call)
  const plan = await pickPlan(call, region.id, args.minRam)
  const os = await pickOs(call)
  log(`리전 ${region.id} (${region.city}) · 플랜 ${plan.id} ${plan.vcpu_count}vCPU/${plan.ram}MB $${plan.monthly_cost}/월 ≈ $${plan.hourly_cost ?? (plan.monthly_cost / 730).toFixed(4)}/시간 · OS ${os.name} (#${os.id})`)

  let instance = null
  let ip = null
  let exitCode = 0
  const cleanup = async () => {
    if (!instance) return
    log(`인스턴스 ${instance.id} 삭제 중 …`)
    const gone = await destroy(call, instance.id)
    if (gone) log(`삭제 확인 (${instance.id})`)
    else {
      screamNotDeleted(instance.id, ip)
      exitCode = 1
    }
    instance = null
  }
  const onSignal = async () => {
    log('중단 신호 — 인스턴스부터 지우고 나간다')
    await cleanup()
    process.exit(130)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    const created = await retry('create', () =>
      call('POST', '/instances', {
        region: region.id,
        plan: plan.id,
        os_id: os.id,
        label: LABEL,
        hostname: 'barracks-probe',
        tags: ['sacloud-probe'],
        user_data: userData.base64,
        activation_email: false,
        backups: 'disabled',
      }),
    )
    instance = created.instance
    log(`만들었다: id=${instance.id} (이제부터 과금. 끝나면 지운다)`)

    const active = await waitForInstance(call, instance.id, 8 * 60_000)
    ip = active.main_ip
    log(`서버 떴다: ${ip} — cloud-init 이 setup.sh 를 돌리는 중. 보통 4~6분`)

    const result = await waitForResult(ip, token, args.timeoutMin * 60_000)
    if (!result) {
      log(`::경고:: ${args.timeoutMin}분 안에 결과가 안 나왔다. setup.sh 가 죽었거나 8080 이 막혔을 수 있다 — 서버는 그래도 지운다`)
      exitCode = 1
    } else {
      const wrapped = { fetchedAt: new Date().toISOString(), instance: { id: instance.id, ip, region: region.id, plan: plan.id, hourlyCost: plan.hourly_cost ?? null }, ...result }
      await writeFile(args.out, JSON.stringify(wrapped, null, 2), 'utf8')
      log(`결과 저장 → ${args.out}`)
      printSummary(result)
    }
  } catch (error) {
    log(`오류: ${error?.message ?? error}`)
    exitCode = 1
  } finally {
    await cleanup()
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  return exitCode
}

process.exit(await main())
