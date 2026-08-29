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
 * 프로필 주소 조각(16진+SA) → BattleLog API 가 쓰는 `user_nexon_sn`(숫자).
 *
 * 둘은 **다른 값이다.** 주소 조각으로는 API 를 부를 수 없어서 프로필 화면을 한 번 받아
 * 그 안에 있는 숫자를 찾는다. 못 찾으면 **찍지 않고 실패로 남긴다.**
 */
async function resolveUserSn(barracksId) {
  const response = await fetch(`/${barracksId}/match`, { credentials: 'include' })
  if (!response.ok) throw new Error(`프로필 ${response.status}`)
  const html = await response.text()

  const patterns = [
    /"user_nexon_sn"\s*:\s*"?(\d{6,})"?/,
    /"str_usn"\s*:\s*"?(\d{6,})"?/,
    /userNexonSn["'\s:=]+(\d{6,})/,
    /strUsn["'\s:=]+(\d{6,})/,
  ]
  for (const pattern of patterns) {
    const found = html.match(pattern)
    if (found) return found[1]
  }
  throw new Error('프로필에서 user_nexon_sn 을 못 찾았다')
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

/** 경기 번호를 원하는 수만큼 모은다. 더 없으면 그만둔다 */
async function matchKeysOf(userSn, want) {
  const keys = []
  let cursor = null
  while (keys.length < want) {
    const page = await fetchMatchList(userSn, cursor)
    const rows = Array.isArray(page?.result) ? page.result : []
    if (rows.length === 0) break
    for (const row of rows) {
      const key = row?.match_key
      if (key) keys.push(String(key))
    }
    cursor = page?.message
    if (!cursor) break
    await sleep(DELAY_MS)
  }
  return keys.slice(0, want)
}

/* -------------------------------------------------------------- 배틀로그 --- */

async function fetchBattleLog(matchKey, userSn) {
  const url = `/api/BattleLog/GetBattleLog/${matchKey}/${userSn}`
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
  /* ⚠ 이 응답에는 rtnCode 가 없다. 그걸 검사하면 전부 실패로 처리된다 */
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return { url, raw: await response.json() }
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

    let userSn = store.resolved[barracksId] ?? label.userNexonSn ?? null
    if (!userSn) {
      try {
        userSn = await resolveUserSn(barracksId)
        store.resolved[barracksId] = userSn
        saveStore(store)
        console.info(`${barracksId} → ${userSn}`)
      } catch (error) {
        store.failures.push({ barracksId, stage: 'resolve', error: String(error) })
        saveStore(store)
        console.warn(`${barracksId} 신원 실패 — ${error}`)
        continue
      }
      await sleep(DELAY_MS)
    }

    let keys
    try {
      keys = await matchKeysOf(userSn, want)
    } catch (error) {
      store.failures.push({ barracksId, userSn, stage: 'matchlist', error: String(error) })
      saveStore(store)
      console.warn(`${barracksId} 목록 실패 — ${error}`)
      continue
    }
    console.info(`${barracksId} (${userSn}) 경기 ${keys.length}건`)

    for (const matchKey of keys) {
      const mark = `${matchKey}|${userSn}`
      if (doneKeys.has(mark)) continue
      try {
        const { url, raw } = await fetchBattleLog(matchKey, userSn)
        store.rows.push({
          source: 'nexon_barracks',
          endpoint: url,
          matchKey,
          strUsn: String(userSn),
          fetched_at: new Date().toISOString(),
          raw,
        })
      } catch (error) {
        store.failures.push({ matchKey, userSn, stage: 'battlelog', error: String(error) })
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
