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
/** **완료 표시만** 담는다. 원문은 담지 않는다 (아래 참조) */
const CLAN_STORE_KEY = 'sacloud_clan_battlelog_done_v2'
/**
 * 이만큼 모이면 파일로 내리고 메모리를 비운다.
 *
 * ⚠ **원문을 `localStorage` 에 쌓지 않는다.** 경기 하나가 이벤트 100~130건이라
 * 원문이 **90KB 안팎**이다. 수천 경기면 수백 MB 인데 `localStorage` 는 보통 5~10MB 다.
 * 예전 방식대로 쌓으면 중간에 조용히 저장이 끊기고, "저장된 줄 알았던" 것이 사라진다.
 *
 * 그래서 원문은 **메모리에만** 두고 40건마다 파일로 내린다(≈3~4MB).
 * `localStorage` 에는 "이건 이미 받았다" 는 표시만 남긴다.
 */
const CLAN_FLUSH_EVERY = 40

const clanSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ 저장 --- */

/** 아직 파일로 안 내린 것들 — **메모리에만** 있다 */
const clanBuffer = { rows: [], failures: [], part: 0 }

/** 밖에서 지켜보라고 두는 진행 상황. 숫자만 담는다 */
const clanState = {
  running: false,
  stop: false,
  slug: null,
  slugsDone: 0,
  slugsTotal: 0,
  rows: 0,
  startedAt: null,
  finishedAt: null,
}

function clanLoadDone() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAN_STORE_KEY) ?? '')
    return new Set(Array.isArray(raw?.done) ? raw.done : [])
  } catch {
    return new Set()
  }
}

/**
 * 완료 표시를 남긴다. **파일로 내린 뒤에만 부른다** —
 * 받자마자 표시하면, 내리기 전에 창이 죽었을 때 그 조각을 영영 다시 안 받는다.
 */
function clanSaveDone(done) {
  try {
    localStorage.setItem(CLAN_STORE_KEY, JSON.stringify({ done: [...done] }))
  } catch (error) {
    console.warn('[수집] 완료 표시를 저장하지 못했다 — 다시 돌리면 겹쳐 받는다:', error)
  }
}

/** 버퍼를 파일 하나로 내리고 비운다. 내린 뒤에 완료 표시를 남긴다 */
function clanFlush(done, pending) {
  if (clanBuffer.rows.length === 0 && clanBuffer.failures.length === 0) return false
  clanBuffer.part += 1
  const name = `barracks-clan-battlelog-${String(clanBuffer.part).padStart(3, '0')}.json`
  clanDownload(name, {
    collected_at: new Date().toISOString(),
    part: clanBuffer.part,
    note: '클랜 단위 배틀로그 원문 (D-184). team_no 는 진영이 아니라 클랜 번호다 — teamList 참조',
    rows: clanBuffer.rows,
    failures: clanBuffer.failures,
  })
  console.info(`[수집] ${name} 내림 — ${clanBuffer.rows.length}건 (실패 ${clanBuffer.failures.length})`)
  clanBuffer.rows = []
  clanBuffer.failures = []
  for (const key of pending) done.add(key)
  pending.clear()
  clanSaveDone(done)
  return true
}

function clanDownload(name, payload) {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
window.collectClanBattleLogs = async function collectClanBattleLogs(slugs, options = {}) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    console.error('클랜 slug 배열을 넘겨라. 예: collectClanBattleLogs(["4473"])')
    return null
  }
  const limit = options.matches ?? CLAN_DEFAULT_MATCHES
  const mapName = options.map ?? CLAN_MAP_NAME
  const from = options.from ? new Date(`${options.from}T00:00:00+09:00`).getTime() : null

  const done = clanLoadDone()
  /** 받았지만 아직 파일로 안 내린 것 — 내린 뒤에 `done` 으로 옮긴다 */
  const pending = new Set()
  clanState.running = true
  clanState.stop = false
  clanState.slugsTotal = slugs.length
  clanState.slugsDone = 0
  clanState.rows = 0
  clanState.startedAt = new Date().toISOString()
  clanState.finishedAt = null

  for (const slug of slugs) {
    if (clanState.stop) break
    clanState.slug = slug
    console.info(`[수집] 클랜 ${slug} — 경기 목록`)
    let list
    try {
      list = await clanMatchList(slug, limit)
    } catch (error) {
      clanBuffer.failures.push({ slug, stage: 'matchList', error: String(error) })
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
      if (clanState.stop) break
      const matchKey = String(row.match_key)
      /* ⚠ 응답에 **`red_clan_no` · `blue_clan_no` 는 없다** (2026-08-29 실측).
         있는 것은 조회한 클랜의 `clan_no` 하나와, 양 팀의 **이름**뿐이다.
         그래서 한 클랜을 조회하면 그 클랜 쪽 응답만 받는다 —
         상대 쪽은 그 클랜을 조회할 차례에 받는다. 39곳을 다 돌면 양쪽이 채워진다. */
      const clanNo = String(row.clan_no ?? '')
      if (clanNo === '') {
        clanBuffer.failures.push({ matchKey, slug, stage: 'clanNo', error: '응답에 clan_no 가 없다' })
        continue
      }
      const key = `${matchKey}:${clanNo}`
      if (done.has(key) || pending.has(key)) continue
      try {
        const json = await clanPost(`/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`)
        const events = Array.isArray(json?.battleLog) ? json.battleLog : []
        if (events.length === 0) {
          clanBuffer.failures.push({ matchKey, clanNo, stage: 'battleLog', error: '이벤트 0건' })
        } else {
          clanBuffer.rows.push({
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
        pending.add(key)
        clanState.rows += 1
        /* 쌓아 두지 않고 40건마다 내린다 — 메모리와 유실 폭을 동시에 줄인다 */
        if (clanBuffer.rows.length >= CLAN_FLUSH_EVERY) clanFlush(done, pending)
      } catch (error) {
        clanBuffer.failures.push({ matchKey, clanNo, stage: 'battleLog', error: String(error) })
      }
      await clanSleep(CLAN_DELAY_MS)
    }
    clanState.slugsDone += 1
    console.info(`[수집] 클랜 ${slug} 끝 — 누적 ${clanState.rows}건 (파일 ${clanBuffer.part}개)`)
  }

  clanFlush(done, pending)
  clanState.running = false
  clanState.finishedAt = new Date().toISOString()
  console.info(`[수집] 전부 끝 — ${clanState.rows}건 · 파일 ${clanBuffer.part}개`)
  return window.__clanLogStatus()
}

/* ------------------------------------------------------------------ 도구 --- */

/**
 * 지금 진행 상황. **숫자만 돌려준다** — 원문을 돌려주면 콘솔이 잠긴다.
 *
 * 오래 도는 수집을 밖에서 지켜보려고 만든 것이다.
 * `javascript_tool` 은 30초에 끊기므로 수집은 `await` 하지 말고 띄워 두고 이걸로 본다.
 */
window.__clanLogStatus = function __clanLogStatus() {
  return {
    running: clanState.running,
    slug: clanState.slug,
    slugsDone: clanState.slugsDone,
    slugsTotal: clanState.slugsTotal,
    rows: clanState.rows,
    buffered: clanBuffer.rows.length,
    files: clanBuffer.part,
    failures: clanBuffer.failures.length,
    startedAt: clanState.startedAt,
    finishedAt: clanState.finishedAt,
  }
}

/** 아직 안 내린 버퍼를 지금 내린다. 중간에 멈추고 싶을 때 쓴다 */
window.__clanLogExport = function __clanLogExport() {
  const done = clanLoadDone()
  const pending = new Set()
  const flushed = clanFlush(done, pending)
  if (!flushed) console.info('내릴 것이 없다')
  return window.__clanLogStatus()
}

/** 돌던 수집을 멈춘다. 다음 경기 직전에 빠져나온다 */
window.__clanLogStop = function __clanLogStop() {
  clanState.stop = true
  console.info('멈추라고 표시했다. 받던 것 하나는 마저 받는다')
}

window.__clanLogReset = function __clanLogReset() {
  localStorage.removeItem(CLAN_STORE_KEY)
  clanBuffer.rows = []
  clanBuffer.failures = []
  clanBuffer.part = 0
  console.info('지웠다. 다음 실행은 처음부터다')
}

console.info(
  '준비됐다. 예) await collectClanBattleLogs(["4473","eee07"], { matches: 200, from: "2026-01-01" })',
)
