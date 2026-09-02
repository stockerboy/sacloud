/**
 * **부하 시험** — 「몇 명까지 버티나」를 숫자로 낸다 (2026-09-01 · D-240 / 2026-09-02 · O-012 개정).
 *
 * ```
 * node scripts/load-test.mjs                       # 동시 1 → 5 → 10 → 20 → 30
 * node scripts/load-test.mjs --levels 10,30        # 단계를 직접
 * node scripts/load-test.mjs --seconds 20          # 단계마다 몇 초
 * node scripts/load-test.mjs --base http://...     # 다른 주소
 * ```
 *
 * ── 왜 만들었나
 *   사용자가 물었다 — *"만약에 사람들 많이 들어오면 터지면 어떡하려고 그래"*.
 *   그 답은 «괜찮을 것 같다» 가 아니라 **숫자**여야 한다.
 *
 * ══ 2026-09-02 (O-012) — **다섯 군데를 고쳤다. 그전 숫자는 믿을 수 없다** ══
 *
 * 1. **대상이 운영이 아니었다.** 기본값이 preview 주소(`sacloud-web-….vercel.app`)였다.
 *    사람이 오는 곳은 `3rdcloud.my` 다. 캐시도 도메인마다 따로 논다.
 *
 * 2. **검색을 한 번도 안 쟀다.** 홈이 검색창이 되고(O-001) 자동완성이 붙으면서(O-002)
 *    **모든 방문자의 첫 동작이 검색**이 됐는데 시험 경로에 없었다. 선수 화면도 없었다.
 *
 * 3. **검색어를 매번 다르게 한다.** 같은 말을 반복하면 엣지가 다 받아 내서
 *    **거짓 합격**이 난다 (D-238 이 그렇게 속았다). 글자 수도 섞는다 —
 *    2글자는 인덱스를 못 타서(O-009) 3글자 이상과 다르게 굴 수 있다.
 *
 * 4. **`x-vercel-cache` 를 센다.** HIT/MISS 비율이 없으면 숫자를 해석할 수 없다.
 *    「빨랐다」가 캐시 덕인지 DB 가 빨라서인지 구별이 안 된다.
 *
 * 5. **식은 람다를 갈라 적는다.** 첫 요청이 10초 넘게 걸리는 일이 있다
 *    (`respond.ts` 31행 · 실제로 20초짜리를 봤다). 그걸 섞으면 중앙값이 거짓말을 한다.
 *    각 단계의 **첫 요청 무리**를 따로 적는다.
 *
 * ── 읽는 법
 *   `p50` 은 «보통 사람이 겪는 시간», `p95` 는 «스무 명 중 한 명».
 *   **오류율이 0이 아니면 그 단계는 실패다.** 느린 것과 죽는 것은 다르다.
 *   `HIT` 비율이 높은데 빠르면 그건 엣지가 받아 낸 것이지 DB 가 튼튼한 게 아니다.
 *
 * ⚠ **운영에 대고 돌린다.** 사람이 적은 시간에 돌리고, 시작 시각을 기록해 둔다 —
 *   그 시간에 사이트가 이상했다는 말이 나오면 원인을 알아야 한다.
 *   단계를 낮은 데서 올린다(1 → 30). 어디서 처음 오류가 나는지가 이 시험의 답이다.
 */

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

/** ★사람이 오는 곳★ — preview 주소가 아니다 (O-012 에서 고쳤다) */
const BASE = argOf('base', 'https://3rdcloud.my')
const LEVELS = argOf('levels', '1,5,10,20,30')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
const SECONDS = Number(argOf('seconds', '15'))

/** 각 단계에서 **처음 이만큼**은 「식은 것」으로 따로 센다 */
const COLD_SAMPLE = 3

/* -------------------------------------------------------------------------- */
/* 실제 값 가져오기 — 경로를 손으로 적어 두면 데이터가 바뀔 때 조용히 404 를 잰다        */
/* -------------------------------------------------------------------------- */

/**
 * 검색어와 상세 경로를 **운영에서 받아** 만든다.
 *
 * 이름을 여기 적어 두지 않는 이유 — 그 선수가 이름을 바꾸거나 빠지면 시험이
 * 404 를 재면서 「빠르다」고 말한다. 실제 데이터에서 뽑으면 그런 일이 없다.
 */
async function seedFromLive() {
  const names = new Set()
  let playerId = null
  let clanSlug = null

  /*
   * ★선수·클랜은 **랭킹에서 뽑는다.** 검색에서 뽑으면 안 된다.★
   *   검색 결과의 선수는 그 리그 소속이라는 보장이 없다. 실제로 첫 판에서
   *   `/api/leagues/supply/players/{id}` 가 **404** 를 냈고, 시험은 그걸
   *   「오류 4.7%」로 셌다 — 사이트가 아니라 내 경로가 틀린 것이었다.
   *   랭킹에 있는 선수는 그 리그에 있는 게 보장된다.
   */
  try {
    const res = await fetch(`${BASE}/api/leagues/supply/ranks/players`)
    if (res.ok) {
      const body = await res.json()
      const row = (body.data ?? [])[0]
      playerId = row?.player?.id ?? null
      clanSlug = row?.clan?.slug ?? null
    }
  } catch {
    /* 못 받으면 아래에서 그 경로를 뺀다 */
  }

  for (const seed of ['a', 'e', 'i', 'o', 's', 'n', 'k', 'r']) {
    try {
      const res = await fetch(`${BASE}/api/players/search/${seed}`)
      if (!res.ok) continue
      const body = await res.json()
      for (const row of body.data ?? []) if (row?.name) names.add(row.name)
    } catch {
      /* 못 받아도 아래 기본값으로 돈다 */
    }
  }

  /* 2 · 3 · 4 · 7 글자로 잘라 섞는다 — 2글자만 인덱스를 못 탄다 (O-009) */
  const terms = []
  for (const name of names) {
    for (const len of [2, 3, 4, 7]) {
      const cut = name.slice(0, len).trim()
      if (cut.length === len) terms.push(cut)
    }
  }
  return {
    terms: terms.length ? [...new Set(terms)] : ['ts', 'tsA', 'tsAr', 'Jaehyun'],
    playerId,
    clanSlug,
  }
}

/* -------------------------------------------------------------------------- */

const seed = await seedFromLive()

/**
 * 도는 길. **무거운 것과 가벼운 것을 섞는다** — 실제 사용자가 그렇게 돈다.
 * `weight` 는 «몇 번에 한 번 고르나».
 * `dynamic` 이 있으면 요청마다 주소가 달라진다 (검색이 그렇다).
 */
const PATHS = [
  { path: () => '/', weight: 3, what: '홈' },

  /* ★검색 — 방문자의 첫 동작이다. 그전 시험에는 아예 없었다★
     글자 수를 섞고 매번 다른 말을 쓴다. 같은 말을 반복하면 엣지가 다 받아 낸다 */
  {
    path: (n) => `/api/players/search/${encodeURIComponent(seed.terms[n % seed.terms.length])}`,
    weight: 4,
    what: '선수 자동완성',
    dynamic: true,
  },
  {
    path: (n) => `/api/clans/search/${encodeURIComponent(seed.terms[(n * 7) % seed.terms.length])}`,
    weight: 1,
    what: '클랜 자동완성',
    dynamic: true,
  },

  /* 랭킹 — 사람이 오는 이유 ①② */
  { path: () => '/api/leagues/supply/ranks/players', weight: 2, what: 'SPL 개인랭킹' },
  { path: () => '/api/leagues/nolink/ranks/players', weight: 1, what: 'IPL 개인랭킹' },
  { path: () => '/api/leagues/supply/ranks/clans?division=1', weight: 1, what: 'SPL 클랜랭킹' },

  /* 클랜 — 무겁다 */
  { path: () => '/api/leagues/supply/clans', weight: 1, what: 'SPL 클랜목록' },
  ...(seed.clanSlug
    ? [
        {
          path: () => `/api/leagues/supply/clans/${seed.clanSlug}/show`,
          weight: 1,
          what: 'SPL 클랜 상세',
        },
      ]
    : []),

  /* ★선수 화면 — 사람이 오는 이유 ③④ 인데 그전 시험에 없었다★ */
  ...(seed.playerId
    ? [
        { path: () => `/player/${seed.playerId}`, weight: 2, what: '선수 화면' },
        {
          path: () => `/api/leagues/supply/players/${seed.playerId}`,
          weight: 1,
          what: '선수 기록실',
        },
      ]
    : []),
]

const bag = []
for (const p of PATHS) for (let i = 0; i < p.weight; i += 1) bag.push(p)

/** 결정적으로 고른다 — 같은 시험을 다시 돌리면 같은 길을 돈다 */
const pick = (counter) => bag[counter % bag.length]

async function once(entry, bust, counter) {
  const path = entry.path(counter)
  const sep = path.includes('?') ? '&' : '?'
  const url = bust ? `${BASE}${path}${sep}cb=lt${counter}` : `${BASE}${path}`
  const started = Date.now()
  try {
    const res = await fetch(url, { redirect: 'manual' })
    /* 본문을 끝까지 읽어야 실제 시간이다 — 머리말만 받고 끊으면 짧게 나온다 */
    await res.arrayBuffer()
    return {
      ms: Date.now() - started,
      code: res.status,
      ok: res.status < 400,
      cache: res.headers.get('x-vercel-cache') ?? '-',
    }
  } catch (e) {
    return { ms: Date.now() - started, code: 0, ok: false, cache: '-', err: String(e).slice(0, 60) }
  }
}

function stat(list) {
  if (list.length === 0) return { n: 0, p50: 0, p95: 0, max: 0 }
  const sorted = [...list].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] }
}

async function level(concurrency, bust) {
  const deadline = Date.now() + SECONDS * 1000
  const cold = []
  const warm = []
  const byCode = {}
  const byCache = {}
  let counter = 0
  let errors = 0

  const worker = async (slot) => {
    while (Date.now() < deadline) {
      const n = counter++
      const r = await once(pick(n + slot), bust, n)
      /* ★첫 무리는 「식은 람다」라 따로 센다★ — 섞으면 중앙값이 거짓말을 한다 */
      ;(n < COLD_SAMPLE * concurrency ? cold : warm).push(r.ms)
      byCode[r.code] = (byCode[r.code] ?? 0) + 1
      byCache[r.cache] = (byCache[r.cache] ?? 0) + 1
      if (!r.ok) errors += 1
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)))
  const w = stat(warm)
  const c = stat(cold)
  const n = w.n + c.n
  return { concurrency, bust, warm: w, cold: c, n, errors, errorRate: n ? errors / n : 0, byCode, byCache }
}

const cacheLine = (byCache) => {
  const total = Object.values(byCache).reduce((a, b) => a + b, 0) || 1
  return Object.entries(byCache)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`)
    .join(' · ')
}

console.info(`대상 : ${new URL(BASE).host}`)
console.info(`시작 : ${new Date().toISOString()}   ← 사이트가 이상했다는 말이 나오면 이 시각을 본다`)
console.info(`단계 : 동시 ${LEVELS.join(' → ')} · 각 ${SECONDS}초`)
console.info(`경로 : ${PATHS.length}종 · 검색어 ${seed.terms.length}개 (2·3·4·7글자 섞음)`)
console.info(`선수 : ${seed.playerId ?? '(못 받음 — 선수 경로를 뺐다)'}`)
console.info(`클랜 : ${seed.clanSlug ?? '(못 받음 — 클랜 상세를 뺐다)'}\n`)

/*
 * ══ 중단선 — **시작 전에 정한다** ══
 *
 * 숫자를 보면서 정하면 「이 정도면 괜찮지」가 된다. 사람이 쓰고 있는 사이트라
 * 시험이 사고가 되면 안 된다.
 */
/** ① 한 단계에서 이걸 넘으면 그 바퀴를 **거기서 멈춘다** */
const STOP_ERROR_RATE = 0.05
/** ② 캐시 우회는 여기까지만. 우회는 전부 DB 로 간다 — 30까지 때리면 시험이 아니라 공격이다 */
const BUST_MAX_CONCURRENCY = 10
/** ③ 단계 사이마다 이걸 친다. 200 이 아니면 그 자리에서 멈춘다 */
const HEALTH_PATH = '/api/health'

async function healthy() {
  try {
    const res = await fetch(`${BASE}${HEALTH_PATH}?cb=h${Date.now()}`)
    return res.status === 200
  } catch {
    return false
  }
}

const rows = []
let stopped = null

outer: for (const bust of [false, true]) {
  console.info(bust ? '── 캐시 우회 (전부 DB 까지 간다 · 최악)' : '── 실제 사용자와 같음 (엣지가 받아 낸다)')
  for (const c of LEVELS) {
    if (bust && c > BUST_MAX_CONCURRENCY) {
      console.info(`  동시 ${String(c).padStart(3)}  건너뜀 — 우회는 ${BUST_MAX_CONCURRENCY} 까지만 (중단선 ②)`)
      continue
    }

    const r = await level(c, bust)
    rows.push(r)
    console.info(
      `  동시 ${String(c).padStart(3)}  요청 ${String(r.n).padStart(5)}  ` +
        `p50 ${String(r.warm.p50).padStart(6)}ms  p95 ${String(r.warm.p95).padStart(6)}ms  ` +
        `오류 ${(r.errorRate * 100).toFixed(1)}%${r.errorRate > 0 ? ' ← 실패' : ''}`,
    )
    console.info(
      `            식은 첫 ${String(r.cold.n).padStart(3)}건 p50 ${String(r.cold.p50).padStart(6)}ms ` +
        `최대 ${String(r.cold.max).padStart(6)}ms   캐시 ${cacheLine(r.byCache)}   ${JSON.stringify(r.byCode)}`,
    )

    if (r.errorRate > STOP_ERROR_RATE) {
      stopped = `오류율 ${(r.errorRate * 100).toFixed(1)}% 가 중단선 ${STOP_ERROR_RATE * 100}% 를 넘었다 (동시 ${c}${bust ? ' · 우회' : ''})`
      console.info(`  ★멈춘다 — ${stopped}★`)
      break outer
    }

    /* 한 단계 끝나면 잠깐 쉰다 — 앞 단계의 여진이 다음 단계에 섞이지 않게 */
    await new Promise((r2) => setTimeout(r2, 5000))

    if (!(await healthy())) {
      stopped = `${HEALTH_PATH} 가 200 이 아니다 (동시 ${c}${bust ? ' · 우회' : ''} 뒤)`
      console.info(`  ★멈춘다 — ${stopped}★`)
      break outer
    }
  }
  console.info('')
}

/* 판정 — «몇 명까지 버티나» 를 한 줄로 */
const maxClean = (bust) => {
  const ok = rows.filter((r) => r.bust === bust && r.errorRate === 0).map((r) => r.concurrency)
  return ok.length ? Math.max(...ok) : null
}
const firstBad = (bust) => {
  const bad = rows.filter((r) => r.bust === bust && r.errorRate > 0).map((r) => r.concurrency)
  return bad.length ? Math.min(...bad) : null
}
console.info('판정')
for (const [bust, label] of [
  [false, '실제 사용자 기준'],
  [true, '캐시 없이(최악)'],
]) {
  const ok = maxClean(bust)
  const bad = firstBad(bust)
  console.info(
    `  ${label.padEnd(16)} 오류 없이 버틴 최대 동시수 ${ok ?? '없음'}` +
      (bad ? `   ★처음 무너진 곳 동시 ${bad}★` : '   (시험한 모든 단계에서 오류 0)'),
  )
}
if (stopped) console.info(`\n★중단선에 걸려 끝까지 안 갔다 — ${stopped}★`)

console.info('\n※ 오류율이 0이 아닌 단계는 «느린» 것이 아니라 «죽은» 것이다.')
console.info('※ 캐시 HIT 비율이 높은데 빨랐다면 그건 엣지가 받아 낸 것이지 DB 가 튼튼한 게 아니다.')
console.info(
  '\n⚠ 끝나고 반드시 눈으로 본다 — 시크릿 창으로 홈·랭킹·선수 화면을 열어 **값이 정상인지**.\n' +
    '   `stale-while-revalidate=86400`(respond.ts 78행) 때문에 부하 중 DB 가 굶어서 나온\n' +
    '   「200 인데 빈 응답」이 엣지에 박히면 **내일까지 그 화면이 사람들에게 보인다.**\n' +
    '   5xx 는 보통 캐시가 안 받지만 「200 인데 내용이 빈 것」은 받는다.',
)
