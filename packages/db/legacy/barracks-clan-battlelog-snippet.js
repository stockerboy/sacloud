/**
 * 클랜 단위 배틀로그 수집 — **브라우저에서 돌리는** 스니펫 (D-184).
 *
 * ── 왜 클랜 단위인가 (선수 단위와 무엇이 다른가)
 *   지금까지 받아 둔 것은 **선수 단위**(`GetBattleLog/<match>/<usn>`)다.
 *   그 응답에는 그 선수 본인이 얽힌 이벤트만 오고, 실측 결과
 *   **경기 616건 중 485건이 선수 1명분뿐**이었다(최대 4명분). 라운드 복원에 필요한
 *   10명이 모인 경기는 **한 건도 없다.**
 *
 *   클랜 단위(`GetBattleLogClan/<match>/<clan_no>`)는 한 번에 그 클랜 전원의
 *   이벤트가 오고, 선수 응답에 **없는 필드가 11개** 더 있다.
 *
 *     team_no · target_team_no · win_team_no · win_flag · myself_tag
 *     target_event_type · target_event_category · target_weapon
 *     team_name · target_team_name · teamList
 *
 *   실측: 한 번 호출에 이벤트 135건 · 선수 13명 등장 · 1~14라운드 전부.
 *   경기당 두 클랜을 부르면 10명이 채워진다.
 *
 *   ⚠ **`team_no` 는 진영이 아니라 클랜 번호다.** `teamList` 가 그 짝을 알려 준다.
 *     14라운드 내내 아무도 안 바뀐다. 진영은 **폭탄**으로 되짚는다 (D-184).
 *
 * ── 왜 브라우저인가
 *   Node 로 병영수첩을 부르면 403 이다(봇차단). UA 를 위조해 뚫지 않는다
 *   (`CLAUDE.md` 3-A 5번). **사용자 자신의 로그인된 브라우저가 정상 요청을 보내고,**
 *   워커는 그 결과 파일을 읽기만 한다.
 *
 * ── 쓰는 법
 *   1. 병영수첩(`https://barracks.sa.nexon.com`)을 연다
 *   2. F12 → Console 에 이 파일 전체를 붙여 넣는다
 *   3. 아래를 실행한다
 *
 *        await collectClanBattleLogs(['4473', 'eee07'], { matches: 200 })
 *
 *      인자는 **클랜 URL 조각(slug)** 이다 — `https://barracks.sa.nexon.com/clan/4473` 의 `4473`.
 *      `docs/IPL_SPEC.md` 2장 표에 39곳이 정리돼 있다.
 *
 *   4. 끝나면 `barracks-clan-battlelog.json` 이 저장된다
 *        pnpm --filter @sacloud/worker nexon battlelog-import --file <그 파일> --confirm
 *
 * ── 중단되면
 *   진행 상황을 `localStorage` 에 남긴다. 창을 닫았다 다시 열고 같은 명령을 실행하면
 *   **이미 받은 것은 건너뛴다.**
 *     __clanLogStatus()  현재 진행
 *     __clanLogExport()  지금까지 받은 것만 파일로 저장
 *     __clanLogReset()   전부 지우고 처음부터
 *
 * ── 원본에 대한 예의
 *   요청 간격 320ms 를 지킨다. 실패하면 그대로 실패로 적고 두들기지 않는다.
 */

/** 요청 간격(ms). 줄이지 마라 — 원본에 대한 예의다 */
const CLAN_DELAY_MS = 320
/** 클랜 하나당 훑을 최근 경기 수 기본값 */
const CLAN_DEFAULT_MATCHES = 200
/** 우리가 쓰는 맵. 다른 맵 경기는 받지 않는다 */
const CLAN_MAP_NAME = '제3보급창고'
const CLAN_STORE_KEY = 'sacloud_clan_battlelog_v1'

const clanSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ 저장 --- */

function clanEmptyStore() {
  return { rows: [], failures: [], done: [], seenMatches: [] }
}

function clanLoadStore() {
  try {
    return JSON.parse(localStorage.getItem(CLAN_STORE_KEY) ?? '') ?? clanEmptyStore()
  } catch {
    return clanEmptyStore()
  }
}

function clanSaveStore(store) {
  try {
    localStorage.setItem(CLAN_STORE_KEY, JSON.stringify(store))
  } catch (error) {
    /* 용량이 차면 저장만 못 하는 것이지 수집이 틀린 것은 아니다. 조용히 넘기지 말고 알린다 */
    console.warn('[수집] 진행 상황을 저장하지 못했다 — 창을 닫으면 처음부터다:', error)
  }
}

/* ------------------------------------------------------------------ 요청 --- */

/**
 * 병영수첩 API 한 번. 실패하면 **두들기지 않고** 두 번만 더 시도한다.
 * 간헐적으로 `TypeError: Failed to fetch` 가 난다(실측).
 */
async function clanPost(path, body) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      if (attempt === 2) throw error
      await clanSleep(1200)
    }
  }
  return null
}

/**
 * 그 클랜의 클랜전 목록. **`match_time_date` 는 항상 `0001-01-01` 이라 쓸모없다** —
 * 시각은 `match_key` 앞 12자리(`YYMMDDHHMMSS`)에서 뽑는다 (D-181).
 */
async function clanMatchList(slug, limit) {
  const out = []
  let cursor = 0
  while (out.length < limit) {
    const json = await clanPost('/api/ClanHome/GetClanMatchList/', {
      clan_id: slug,
      seq_no: cursor,
      mode_flag: 'ALL',
      min_seq_no: 0,
    })
    /* 전적이 아예 없는 클랜은 result 가 배열이 아니라 **빈 문자열**이다 (D-181) */
    const rows = Array.isArray(json?.result) ? json.result : []
    if (rows.length === 0) break
    out.push(...rows)
    const last = rows[rows.length - 1]
    const next = Number(last?.match_key)
    if (!Number.isFinite(next) || next === cursor) break
    cursor = next
    if (rows.length < 20) break
    await clanSleep(CLAN_DELAY_MS)
  }
  return out.slice(0, limit)
}

/** `match_key` 앞 12자리 → ISO 시각. 원본이 주는 유일한 절대시각이다 */
function clanMatchTime(matchKey) {
  const s = String(matchKey ?? '')
  if (s.length < 12) return null
  const [yy, mm, dd, hh, mi, ss] = [
    s.slice(0, 2),
    s.slice(2, 4),
    s.slice(4, 6),
    s.slice(6, 8),
    s.slice(8, 10),
    s.slice(10, 12),
  ]
  return `20${yy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`
}

/* ------------------------------------------------------------------ 수집 --- */

/**
 * 클랜 여러 곳의 클랜전 배틀로그를 **클랜 단위로** 받는다.
 *
 * @param slugs   클랜 URL 조각 배열 (`['4473', 'eee07']`)
 * @param options `{ matches: 최근 몇 경기, from: 'YYYY-MM-DD', map: '제3보급창고' }`
 */
async function collectClanBattleLogs(slugs, options = {}) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    console.error('클랜 slug 배열을 넘겨라. 예: collectClanBattleLogs(["4473"])')
    return null
  }
  const limit = options.matches ?? CLAN_DEFAULT_MATCHES
  const mapName = options.map ?? CLAN_MAP_NAME
  const from = options.from ? new Date(`${options.from}T00:00:00+09:00`).getTime() : null

  const store = clanLoadStore()
  const done = new Set(store.done)

  for (const slug of slugs) {
    console.info(`[수집] 클랜 ${slug} — 경기 목록`)
    let list
    try {
      list = await clanMatchList(slug, limit)
    } catch (error) {
      store.failures.push({ slug, stage: 'matchList', error: String(error) })
      clanSaveStore(store)
      continue
    }

    /* 우리가 쓰는 맵만. 다른 맵을 받아 두면 나중에 세는 사람이 헷갈린다 */
    const targets = list.filter((row) => {
      if (String(row?.map_name ?? '') !== mapName) return false
      if (from === null) return true
      const time = clanMatchTime(row?.match_key)
      return time !== null && new Date(time).getTime() >= from
    })
    console.info(`[수집] 클랜 ${slug} — 목록 ${list.length}건 중 ${mapName} ${targets.length}건`)

    for (const row of targets) {
      const matchKey = String(row.match_key)
      /* ⚠ 응답에 **`red_clan_no` · `blue_clan_no` 는 없다** (2026-08-29 실측).
         있는 것은 조회한 클랜의 `clan_no` 하나와, 양 팀의 **이름**뿐이다.
         그래서 한 클랜을 조회하면 그 클랜 쪽 응답만 받는다 —
         상대 쪽은 그 클랜을 조회할 차례에 받는다. 39곳을 다 돌면 양쪽이 채워진다. */
      const clanNo = String(row.clan_no ?? '')
      if (clanNo === '') {
        store.failures.push({ matchKey, slug, stage: 'clanNo', error: '응답에 clan_no 가 없다' })
        continue
      }
      const key = `${matchKey}:${clanNo}`
      if (done.has(key)) continue
      try {
        const json = await clanPost(`/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`)
        const events = Array.isArray(json?.battleLog) ? json.battleLog : []
        if (events.length === 0) {
          store.failures.push({ matchKey, clanNo, stage: 'battleLog', error: '이벤트 0건' })
        } else {
          store.rows.push({
            source: 'nexon_barracks',
            endpoint: `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`,
            matchKey,
            clanNo,
            subject: clanNo,
            matchTime: clanMatchTime(matchKey),
            mapName,
            /* 목록이 주는 값도 같이 남긴다 — **진영 판정을 교차 검산**하는 데 쓴다.
               red/blue 는 그 경기에서 어느 클랜이 어느 진영으로 **시작**했는지다 */
            listed: {
              redClanName: row.red_clan_name ?? null,
              blueClanName: row.blue_clan_name ?? null,
              redWinCnt: row.red_win_cnt ?? null,
              blueWinCnt: row.blue_win_cnt ?? null,
              resultWdl: row.result_wdl ?? null,
              plimit: row.plimit ?? null,
            },
            /* **원문을 그대로 담는다.** `teamList` 를 버리면 team_no 가 어느 클랜인지
               알 수 없게 되고, 그러면 진영 판정이 통째로 불가능해진다 */
            raw: json,
          })
        }
        done.add(key)
        store.done = [...done]
        clanSaveStore(store)
      } catch (error) {
        store.failures.push({ matchKey, clanNo, stage: 'battleLog', error: String(error) })
        clanSaveStore(store)
      }
      await clanSleep(CLAN_DELAY_MS)
    }
    console.info(`[수집] 클랜 ${slug} 끝 — 지금까지 ${store.rows.length}건`)
  }

  return __clanLogExport()
}

/* ------------------------------------------------------------------ 도구 --- */

function __clanLogStatus() {
  const store = clanLoadStore()
  const matches = new Set(store.rows.map((row) => row.matchKey))
  console.info(
    `받은 응답 ${store.rows.length}건 · 경기 ${matches.size}건 · 실패 ${store.failures.length}건`,
  )
  return { rows: store.rows.length, matches: matches.size, failures: store.failures.length }
}

function __clanLogExport() {
  const store = clanLoadStore()
  const payload = {
    collected_at: new Date().toISOString(),
    note: '클랜 단위 배틀로그 원문 (D-184). team_no 는 진영이 아니라 클랜 번호다 — teamList 참조',
    rows: store.rows,
    failures: store.failures,
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'barracks-clan-battlelog.json'
  a.click()
  URL.revokeObjectURL(url)
  __clanLogStatus()
  return payload
}

function __clanLogReset() {
  localStorage.removeItem(CLAN_STORE_KEY)
  console.info('지웠다. 다음 실행은 처음부터다')
}

console.info(
  '준비됐다. 예) await collectClanBattleLogs(["4473","eee07"], { matches: 200, from: "2026-01-01" })',
)
