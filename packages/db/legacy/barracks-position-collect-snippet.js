/**
 * 포지션 표본 수집 — **브라우저에서 돌리는** 스니펫 (D-174).
 *
 * ── 왜 브라우저인가
 *   Node 로 병영수첩을 부르면 403 이다(봇차단). UA 를 위조해 뚫지 않는다
 *   (`CLAUDE.md` 3-A 5번). **사용자 자신의 로그인된 브라우저가 정상 요청을 보내고,**
 *   워커는 그 결과 파일을 읽기만 한다.
 *
 * ── 쓰는 법
 *   1. 병영수첩(`https://barracks.sa.nexon.com`)에 로그인한 채로 아무 페이지나 연다
 *   2. F12 → Console 에 이 파일 전체를 붙여 넣는다
 *   3. 아래를 실행한다
 *
 *        await collectPositions(LABELS, { games: 100 })
 *
 *      `LABELS` 는 `data/barracks/position-labels.json` 의 `labels` 배열을 그대로 붙여 넣으면 된다.
 *      (이 파일 아래쪽 `DEFAULT_LABELS` 에 이미 넣어 두었다. 그대로 쓰려면
 *       `await collectPositions()` 만 실행한다.)
 *
 *   4. 끝나면 파일 두 개가 저장된다
 *        barracks-battlelog.json        원문 — `nexon battlelog-import --file` 에 넣는다
 *        position-labels.resolved.json  라벨 + 채워진 user_nexon_sn — `--labels` 에 넣는다
 *
 * ── 중단되면
 *   진행 상황을 `localStorage` 에 남긴다. 창을 닫았다 다시 열고 같은 명령을 실행하면
 *   **이미 받은 경기는 건너뛴다.** 처음부터 다시 받지 않는다.
 *     __positionStatus()  현재 진행
 *     __positionExport()  지금까지 받은 것만 파일로 저장
 *     __positionReset()   전부 지우고 처음부터
 *
 * ── 원본에 대한 예의
 *   요청 간격 320ms 를 지킨다. 실패하면 그대로 실패로 적고 두들기지 않는다.
 */

/** 요청 간격(ms). 줄이지 마라 — 원본에 대한 예의다 */
const DELAY_MS = 320
/** 한 사람당 받을 경기 수 기본값 */
const DEFAULT_GAMES = 100
const STORE_KEY = 'sacloud_position_collect_v1'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ 저장 --- */

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '') ?? emptyStore()
  } catch {
    return emptyStore()
  }
}

function emptyStore() {
  return { rows: [], failures: [], resolved: {}, done: [] }
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

function download(name, value) {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

/* ------------------------------------------------------------ 신원 확인 --- */

/**
 * 주소 조각으로 **바로 API 를 부를 수 있다** (2026-08-29 실측).
 *
 *   POST /api/Match/GetMatchList/  {"user_nexon_sn":"3F6FDE57149B54E6SA","mode_flag":"ALL"}
 *     → rtnCode 20 · 경기 20건 · 첫 행에 `user_nexon_sn: 973207158`
 *
 * 즉 이 API 는 **주소 조각(16진+SA)** 을 키로 받고, 응답에는 **숫자 번호**가 함께 온다.
 * `SA` 를 떼면 `rtnCode -999` 다 — 떼지 마라.
 *
 * 숫자 번호는 우리 DB(`Player.sourcePlayerId` · `MatchWeaponEvidence.userNexonSn`)와
 * 같은 형식이라 **사람을 잇는 키**로 쓴다. 응답에 없으면 `null` 로 두고 지어내지 않는다.
 */
async function resolveIdentity(barracksId) {
  const page = await fetchMatchList(barracksId, null)
  if (page?.rtnCode !== 20) throw new Error(`목록 rtnCode ${page?.rtnCode ?? '(없음)'}`)
  const rows = Array.isArray(page?.result) ? page.result : []
  const numeric = rows.find((row) => row?.user_nexon_sn)?.user_nexon_sn ?? null
  return { numericSn: numeric === null ? null : String(numeric), page }
}

/* ------------------------------------------------------------ 경기 목록 --- */

async function fetchMatchList(userSn, seqNo) {
  const body = { user_nexon_sn: String(userSn), mode_flag: 'ALL' }
  /* ⚠ 빈 문자열을 보내면 rtnCode:-999 다. 없으면 아예 넣지 않는다 */
  if (seqNo) {
    body.seq_no = String(seqNo)
    body.min_seq_no = '0'
  }
  const response = await fetch('/api/Match/GetMatchList/', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`목록 ${response.status}`)
  return response.json()
}

/**
 * 경기 번호를 원하는 수만큼 모은다. 더 없으면 그만둔다.
 *
 * 첫 페이지는 신원 확인 때 이미 받았으므로 **다시 받지 않는다** — 같은 것을 두 번
 * 부르지 않는 것도 원본에 대한 예의다.
 */
async function matchKeysOf(barracksId, want, firstPage) {
  const keys = []
  let page = firstPage ?? null
  let cursor = null
  while (keys.length < want) {
    if (!page) {
      page = await fetchMatchList(barracksId, cursor)
    }
    const rows = Array.isArray(page?.result) ? page.result : []
    if (rows.length === 0) break
    for (const row of rows) {
      const key = row?.match_key
      if (key) keys.push(String(key))
    }
    cursor = page?.message
    page = null
    if (!cursor) break
    await sleep(DELAY_MS)
  }
  return keys.slice(0, want)
}

/* -------------------------------------------------------------- 배틀로그 --- */

async function callBattleLog(matchKey, key) {
  const url = `/api/BattleLog/GetBattleLog/${matchKey}/${key}`
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
  /* ⚠ 이 응답에는 rtnCode 가 없다. 그걸 검사하면 전부 실패로 처리된다 */
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return { url, raw: await response.json() }
}

/** 이벤트가 실제로 들어 있는가 — 200 이어도 빈 껍데기면 다른 키를 써야 한다 */
function eventCountOf(raw) {
  if (Array.isArray(raw)) return raw.length
  if (raw === null || typeof raw !== 'object') return 0
  for (const value of Object.values(raw)) if (Array.isArray(value)) return value.length
  return 0
}

/**
 * 배틀로그는 **어느 키를 받는지 모른다** — 주소 조각인지 숫자 번호인지.
 * 그래서 첫 경기에서 한 번만 둘 다 시도해 보고, 되는 쪽을 기억해 나머지에 쓴다.
 * 둘 다 안 되면 실패로 적는다. 지어내지 않는다.
 */
let battleLogKeyKind = null

async function fetchBattleLog(matchKey, keys) {
  const order = battleLogKeyKind
    ? [battleLogKeyKind]
    : ['barracksId', 'numericSn']
  let lastError = null
  for (const kind of order) {
    const key = keys[kind]
    if (!key) continue
    try {
      const result = await callBattleLog(matchKey, key)
      if (eventCountOf(result.raw) === 0 && !battleLogKeyKind && kind !== order[order.length - 1]) {
        lastError = new Error(`${kind} 로는 이벤트가 0건이다`)
        continue
      }
      if (!battleLogKeyKind) {
        battleLogKeyKind = kind
        console.info(`배틀로그 키는 ${kind} 다`)
      }
      return result
    } catch (error) {
      lastError = error
    }
    await sleep(DELAY_MS)
  }
  throw lastError ?? new Error('배틀로그 키를 못 정했다')
}

/* ------------------------------------------------------------------ 본체 --- */

window.collectPositions = async function collectPositions(labels, options = {}) {
  const list = labels ?? DEFAULT_LABELS
  const want = options.games ?? DEFAULT_GAMES
  const store = loadStore()
  const doneKeys = new Set(store.done)

  console.info(`${list.length}명 · 1인당 최대 ${want}경기 · 요청 간격 ${DELAY_MS}ms`)

  for (const label of list) {
    const barracksId = label.barracksId ?? label.id
    if (!barracksId) continue

    let numericSn = store.resolved[barracksId] ?? label.userNexonSn ?? null
    let matchKeys
    try {
      /* 주소 조각이 곧 API 키다. 숫자 번호는 응답에서 얻는다 (지어내지 않는다) */
      const identity = await resolveIdentity(barracksId)
      numericSn = identity.numericSn ?? numericSn
      if (numericSn) store.resolved[barracksId] = numericSn
      saveStore(store)
      console.info(`${barracksId} → 숫자번호 ${numericSn ?? '(응답에 없다)'}`)
      await sleep(DELAY_MS)
      matchKeys = await matchKeysOf(barracksId, want, identity.page)
    } catch (error) {
      store.failures.push({ barracksId, stage: 'matchlist', error: String(error) })
      saveStore(store)
      console.warn(`${barracksId} 목록 실패 — ${error}`)
      continue
    }
    console.info(`${barracksId} 경기 ${matchKeys.length}건`)

    for (const matchKey of matchKeys) {
      const mark = `${matchKey}|${barracksId}`
      if (doneKeys.has(mark)) continue
      try {
        const { url, raw } = await fetchBattleLog(matchKey, { barracksId, numericSn })
        store.rows.push({
          source: 'nexon_barracks',
          endpoint: url,
          matchKey,
          /* 사람 키는 **숫자 번호**다 — 우리 DB 가 그 형식을 쓴다.
             응답에 없었으면 주소 조각으로라도 남긴다. 비워 두지 않는다 */
          strUsn: String(numericSn ?? barracksId),
          barracksId,
          fetched_at: new Date().toISOString(),
          raw,
        })
      } catch (error) {
        store.failures.push({ matchKey, barracksId, stage: 'battlelog', error: String(error) })
      }
      doneKeys.add(mark)
      store.done = [...doneKeys]
      saveStore(store)
      await sleep(DELAY_MS)
    }
    console.info(`진행 — 원문 ${store.rows.length}건 · 실패 ${store.failures.length}건`)
  }

  return window.__positionExport(list)
}

window.__positionStatus = function __positionStatus() {
  const store = loadStore()
  console.info(
    `원문 ${store.rows.length}건 · 실패 ${store.failures.length}건 · 신원 ${Object.keys(store.resolved).length}명`,
  )
  return store
}

window.__positionExport = function __positionExport(labels) {
  const store = loadStore()
  download('barracks-battlelog.json', {
    collected_at: new Date().toISOString(),
    rows: store.rows,
    failures: store.failures,
  })
  const list = labels ?? DEFAULT_LABELS
  download('position-labels.resolved.json', {
    note: '수집 때 채운 user_nexon_sn 이 들어 있다. nexon position-build --labels 에 넣는다',
    labels: list.map((label) => ({
      ...label,
      userNexonSn: store.resolved[label.barracksId ?? label.id] ?? label.userNexonSn ?? null,
    })),
  })
  console.info(`저장했다 — 원문 ${store.rows.length}건 · 실패 ${store.failures.length}건`)
  return { rows: store.rows.length, failures: store.failures.length }
}

window.__positionReset = function __positionReset() {
  localStorage.removeItem(STORE_KEY)
  console.info('지웠다. 다음 실행은 처음부터 받는다')
}

/** `data/barracks/position-labels.json` 과 같은 내용이다. 바뀌면 양쪽을 같이 고친다 */
const DEFAULT_LABELS = [
  { barracksId: 'BE60BA2EA16C2A94SA', position: 'B' },
  { barracksId: 'ABAC4D9DD6600636SA', position: 'B' },
  { barracksId: '79BEC17430DF291ESA', position: 'B' },
  { barracksId: 'D8B3C973C06BB0FESA', position: 'B' },
  { barracksId: '293ED6C0C2B49B57SA', position: 'B' },
  { barracksId: '5CA3F0623A30124ASA', position: 'B' },
  { barracksId: '51975267F8A18F52SA', position: '2F' },
  { barracksId: '95ED5BDBB18CDA27SA', position: '2F' },
  { barracksId: '791C5776190D4589SA', position: '2F' },
  { barracksId: 'F0BB03E0F4771644SA', position: '2F' },
  { barracksId: 'BE670A90968922B5SA', position: '2F' },
  { barracksId: 'C348189581244C65SA', position: 'SHORT' },
  { barracksId: '7C313643067A5FCASA', position: 'SHORT' },
  { barracksId: 'FBD6DA3C1C1526C4SA', position: 'SHORT' },
  { barracksId: 'D596137C144C183CSA', position: 'SHORT' },
  { barracksId: '5680A2E6F8308820SA', position: 'SHORT' },
  { barracksId: 'C26B14561456F162SA', position: 'SHORT' },
  { barracksId: '02773269A8CAF900SA', position: 'LIBERO' },
  { barracksId: '67C2B2BC7406EC34SA', position: 'LIBERO' },
  { barracksId: '1F43552B9AB9EB13SA', position: 'LIBERO' },
  { barracksId: '0316133F90948FC6SA', position: 'LIBERO' },
  { barracksId: 'A49F0592B0050E7BSA', position: 'LIBERO' },
  { barracksId: '3F6FDE57149B54E6SA', position: 'LIBERO' },
]

console.info('준비됐다. `await collectPositions()` 를 실행하면 23명분을 받는다.')
