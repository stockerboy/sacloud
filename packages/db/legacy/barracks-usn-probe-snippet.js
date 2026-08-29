/**
 * 병영수첩 **선수 번호(user_nexon_sn) 찾기** 진단 스니펫 (D-174).
 *
 * ── 왜 필요한가
 *   프로필 주소 조각은 `3F6FDE57149B54E6SA`(16진+SA)인데, BattleLog·경기목록 API 는
 *   숫자 `user_nexon_sn`(예: 252187085)을 쓴다. 우리 DB 실측으로 확인했다.
 *   주소를 그대로 받아 온 HTML 에서는 그 숫자를 못 찾았다(23명 전부 실패).
 *   **그래서 지어내지 않고, 실제로 어디서 오는지 관측한다.**
 *
 * ── 쓰는 법
 *   1. 대상 선수의 병영수첩 기록실 화면을 연다 (`/{주소조각}/match`)
 *   2. F12 → Console 에 이 파일 전체를 붙여 넣는다
 *   3. `await probeBarracks()` 를 실행한다
 *   4. 콘솔에 찍힌 것을 그대로 보여 준다
 *
 *   그래도 안 나오면 `watchBarracks()` 를 실행한 뒤 화면에서 **매치기록 탭을 한 번 누른다.**
 *   그때 페이지가 실제로 보내는 요청과 본문이 콘솔에 찍힌다.
 *
 * ── 원본에 대한 예의
 *   요청을 몰아치지 않는다. 여기서 보내는 요청은 **최대 4건**이다.
 *   차단을 우회하지 않는다 — 페이지가 이미 하는 것과 같은 요청만 해 본다.
 */

const PROBE_DELAY_MS = 320
const probeSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 지금 보고 있는 화면의 주소 조각 */
function currentBarracksId() {
  const first = location.pathname.split('/').filter(Boolean)[0]
  return first ?? null
}

/** 살아 있는 화면(DOM·전역변수) 안에 숫자 번호가 들어 있는지 훑는다 */
function scanLiveDocument() {
  const found = new Map()
  const html = document.documentElement.innerHTML
  const patterns = [
    /user_nexon_sn["'\s:=]+(\d{6,})/g,
    /str_usn["'\s:=]+(\d{6,})/g,
    /userNexonSn["'\s:=]+(\d{6,})/g,
    /strUsn["'\s:=]+(\d{6,})/g,
    /"usn"\s*:\s*"?(\d{6,})"?/g,
  ]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      found.set(match[1], (found.get(match[1]) ?? 0) + 1)
    }
  }
  /* 전역 상태에 들어 있는 경우 (SPA 는 흔히 여기에 둔다) */
  for (const key of Object.keys(window)) {
    if (!/state|store|__N|nuxt|data/i.test(key)) continue
    try {
      const text = JSON.stringify(window[key])
      if (!text || text.length > 3_000_000) continue
      for (const match of text.matchAll(/(?:user_nexon_sn|str_usn|usn)"?\s*:\s*"?(\d{6,})"?/g)) {
        found.set(match[1], (found.get(match[1]) ?? 0) + 1)
      }
    } catch {
      /* 순환 참조 등은 그냥 건너뛴다 */
    }
  }
  return [...found.entries()].map(([sn, hits]) => ({ sn, hits }))
}

/** 주소 조각을 그대로 키로 써 보면 되는지 확인한다 */
async function tryMatchList(key) {
  const response = await fetch('/api/Match/GetMatchList/', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ user_nexon_sn: String(key), mode_flag: 'ALL' }),
  })
  let body
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return {
    key,
    status: response.status,
    rtnCode: body?.rtnCode ?? null,
    count: Array.isArray(body?.result) ? body.result.length : null,
    first: Array.isArray(body?.result) ? body.result[0] : null,
  }
}

window.probeBarracks = async function probeBarracks(barracksId) {
  const id = barracksId ?? currentBarracksId()
  console.info(`대상 주소 조각: ${id}`)

  console.info('--- 1. 화면 안에 숫자 번호가 있는가 ---')
  const scanned = scanLiveDocument()
  console.info(scanned.length > 0 ? scanned : '(없다)')

  console.info('--- 2. 이미 오간 API 요청 주소 ---')
  const urls = [
    ...new Set(
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('/api/')),
    ),
  ]
  console.info(urls.length > 0 ? urls : '(없다 — 아직 아무 요청도 안 갔다)')

  console.info('--- 3. 주소 조각을 그대로 키로 써 본다 ---')
  const candidates = [id, id?.replace(/SA$/i, '')].filter(Boolean)
  const results = []
  for (const key of candidates) {
    try {
      const result = await tryMatchList(key)
      results.push(result)
      console.info(key, `HTTP ${result.status}`, `rtnCode ${result.rtnCode}`, `경기 ${result.count}`)
      if (result.first) console.info('첫 경기', result.first)
    } catch (error) {
      console.warn(key, String(error))
    }
    await probeSleep(PROBE_DELAY_MS)
  }

  console.info('--- 4. 화면에 보이는 닉네임 ---')
  const nickname = document.querySelector('h1, h2, .nickname, [class*="nick"]')?.textContent?.trim()
  console.info(nickname ?? '(못 찾음)')

  return { id, scanned, urls, results, nickname }
}

/**
 * 페이지가 **실제로** 보내는 요청을 엿본다.
 *
 * 실행한 뒤 화면에서 매치기록 탭을 한 번 눌러라. 그때 오가는 주소와 본문이 찍힌다.
 * 요청을 만들어 보내지 않는다 — 페이지가 하는 것을 지켜보기만 한다.
 */
window.watchBarracks = function watchBarracks() {
  const seen = []
  const originalFetch = window.fetch
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url
    if (url && url.includes('/api/')) {
      seen.push({ how: 'fetch', url, body: init?.body ?? null })
      console.info('요청', url, init?.body ?? '')
    }
    return originalFetch.apply(this, arguments)
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__probeUrl = url
    return originalOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function patchedSend(body) {
    if (this.__probeUrl && String(this.__probeUrl).includes('/api/')) {
      seen.push({ how: 'xhr', url: this.__probeUrl, body: body ?? null })
      console.info('요청(xhr)', this.__probeUrl, body ?? '')
    }
    return originalSend.apply(this, arguments)
  }

  window.__probeSeen = seen
  console.info('지켜보는 중이다. 이제 화면에서 매치기록 탭을 한 번 눌러라. `__probeSeen` 에 쌓인다')
  return seen
}

console.info('준비됐다. `await probeBarracks()` 를 실행해라.')
