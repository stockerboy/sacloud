/**
 * **부하 시험** — 「몇 명까지 버티나」를 숫자로 낸다 (2026-09-01 · D-240).
 *
 * ```
 * node scripts/load-test.mjs                       # 기본: 동시 5 → 10 → 20 → 30
 * node scripts/load-test.mjs --levels 10,30,50     # 단계를 직접
 * node scripts/load-test.mjs --seconds 20          # 단계마다 몇 초
 * node scripts/load-test.mjs --base http://...     # 다른 주소
 * ```
 *
 * ── 왜 만들었나
 *   사용자가 물었다 — *"만약에 사람들 많이 들어오면 터지면 어떡하려고 그래"*.
 *   그 답은 «괜찮을 것 같다» 가 아니라 **숫자**여야 한다. 이 스크립트가 그 숫자를 만든다.
 *
 * ── 무엇을 재나
 *   실제 사용자가 도는 길을 흉내 낸다. 홈만 두들기면 엣지 캐시가 다 받아 내서
 *   **DB 를 안 때리고** 「멀쩡하다」는 거짓 결론이 나온다 (D-238 의 교훈 그대로다).
 *   그래서 **무거운 경로를 섞고**, 캐시를 우회하는 요청과 우회하지 않는 요청을 **둘 다** 넣는다.
 *
 *     캐시 우회 안 함 (`cb` 없음)   실제 사용자와 같다. 엣지가 받아 낸다
 *     캐시 우회 함    (`cb` 있음)   전부 DB 까지 간다. **최악의 경우**다
 *
 *   두 숫자가 크게 다르면 그 차이가 곧 **캐시가 지고 있는 짐**이다.
 *
 * ── 읽는 법
 *   `p50` 은 «보통 사람이 겪는 시간», `p95` 는 «스무 명 중 한 명이 겪는 시간» 이다.
 *   **오류율이 0이 아니면 그 단계는 실패다.** 느린 것과 죽는 것은 다르다.
 *
 * ⚠ 운영에 대고 돌린다. **사람이 적은 시간에** 돌리고, 단계를 무작정 올리지 마라 —
 *   이 스크립트가 사이트를 죽이면 그건 시험이 아니라 사고다.
 */

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const BASE = argOf('base', 'https://sacloud-web-softgw01-8957s-projects.vercel.app')
const LEVELS = argOf('levels', '5,10,20,30')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
const SECONDS = Number(argOf('seconds', '15'))

/**
 * 도는 길. **무거운 것과 가벼운 것을 섞는다** — 실제 사용자가 그렇게 돈다.
 * 가중치는 «몇 번에 한 번 고르나» 다.
 */
const PATHS = [
  { path: '/', weight: 3, what: '홈' },
  { path: '/api/home/top', weight: 3, what: '홈 데이터' },
  { path: '/api/leagues/supply/clans', weight: 2, what: 'DPL 클랜목록' },
  { path: '/api/leagues/nolink/clans', weight: 1, what: 'IPL 클랜목록' },
  { path: '/api/leagues/supply/ranks/players', weight: 2, what: 'DPL 개인랭킹' },
  { path: '/api/leagues/supply/clans/lpcrew/show', weight: 2, what: 'DPL 최대클랜 상세' },
  { path: '/api/leagues/nolink/clans/JJUN/show', weight: 1, what: 'IPL 클랜 상세' },
]

const bag = []
for (const p of PATHS) for (let i = 0; i < p.weight; i += 1) bag.push(p)

/** 결정적으로 고른다 — 같은 시험을 다시 돌리면 같은 길을 돈다 */
function pick(counter) {
  return bag[counter % bag.length]
}

async function once(entry, bust, counter) {
  const sep = entry.path.includes('?') ? '&' : '?'
  const url = bust ? `${BASE}${entry.path}${sep}cb=lt${counter}` : `${BASE}${entry.path}`
  const started = Date.now()
  try {
    const res = await fetch(url, { redirect: 'manual' })
    /* 본문을 끝까지 읽어야 실제 시간이다 — 머리말만 받고 끊으면 짧게 나온다 */
    await res.arrayBuffer()
    return { ms: Date.now() - started, code: res.status, ok: res.status < 400 }
  } catch (e) {
    return { ms: Date.now() - started, code: 0, ok: false, err: String(e).slice(0, 60) }
  }
}

function stat(list) {
  if (list.length === 0) return { n: 0 }
  const sorted = [...list].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return {
    n: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  }
}

async function level(concurrency, bust) {
  const deadline = Date.now() + SECONDS * 1000
  const times = []
  const byCode = {}
  let counter = 0
  let errors = 0

  const worker = async (slot) => {
    while (Date.now() < deadline) {
      const n = counter++
      const entry = pick(n + slot)
      const r = await once(entry, bust, n)
      times.push(r.ms)
      byCode[r.code] = (byCode[r.code] ?? 0) + 1
      if (!r.ok) errors += 1
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)))
  const s = stat(times)
  return { concurrency, bust, ...s, errors, errorRate: s.n ? errors / s.n : 0, byCode }
}

console.info(`대상 : ${new URL(BASE).host}`)
console.info(`단계 : 동시 ${LEVELS.join(' → ')} · 각 ${SECONDS}초`)
console.info(`경로 : ${PATHS.length}종 (무거운 것 포함)\n`)

const rows = []
for (const bust of [false, true]) {
  console.info(bust ? '── 캐시 우회 (전부 DB 까지 간다 · 최악)' : '── 실제 사용자와 같음 (엣지가 받아 낸다)')
  for (const c of LEVELS) {
    const r = await level(c, bust)
    rows.push(r)
    const bad = r.errorRate > 0
    console.info(
      `  동시 ${String(c).padStart(3)}  요청 ${String(r.n).padStart(5)}  ` +
        `p50 ${String(r.p50).padStart(6)}ms  p95 ${String(r.p95).padStart(6)}ms  ` +
        `최대 ${String(r.max).padStart(6)}ms  ` +
        `오류 ${(r.errorRate * 100).toFixed(1)}%${bad ? '  ← 실패' : ''}  ${JSON.stringify(r.byCode)}`,
    )
    /* 한 단계 끝나면 잠깐 쉰다 — 앞 단계의 여진이 다음 단계에 섞이지 않게 */
    await new Promise((r2) => setTimeout(r2, 5000))
  }
  console.info('')
}

/* 판정 — «몇 명까지 버티나» 를 한 줄로 */
const cleanCached = rows.filter((r) => !r.bust && r.errorRate === 0).map((r) => r.concurrency)
const cleanDirect = rows.filter((r) => r.bust && r.errorRate === 0).map((r) => r.concurrency)
console.info('판정')
console.info(
  `  실제 사용자 기준 오류 없이 버틴 최대 동시수 : ${cleanCached.length ? Math.max(...cleanCached) : '없음(가장 낮은 단계부터 실패)'}`,
)
console.info(
  `  캐시 없이(최악) 오류 없이 버틴 최대 동시수  : ${cleanDirect.length ? Math.max(...cleanDirect) : '없음(가장 낮은 단계부터 실패)'}`,
)
console.info('\n※ 오류율이 0이 아닌 단계는 «느린» 것이 아니라 «죽은» 것이다.')
