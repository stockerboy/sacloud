/**
 * 자동수집 본체 — **병영수첩 탭의 페이지 안**(MAIN world)에서 돈다 (2026-09-02 · 지시 #7).
 *
 * ── 무엇을
 *   15분마다(서비스워커 알람 → 메시지) IPL 클랜마다:
 *     1. `collectClanMatchList(slug, …)`  최근 경기 목록. **마지막으로 받은 경기 이후** 만 새것으로 친다
 *        (`ingest`+`token` 을 주면 목록 페이지도 창구로 같이 간다 — 스니펫이 그렇게 만들어져 있다)
 *     2. 새 경기마다 `blFetchClan(match_key, clan_no)`  배틀로그 원문
 *     3. 40건씩 창구(`POST /api/ingest/barracks`, Bearer)로 보낸다. **보낸 뒤에만** 「마지막」을 전진시킨다
 *   실패하면 「마지막」이 그대로라 다음 주기에 다시 받는다. 창구는 멱등이라 겹쳐 보내도 행이 늘지 않는다.
 *
 * ── 로직을 두 벌 만들지 않는다
 *   요청·페이지 넘기기·재시도는 전부 `snippet.js`(= `scripts/battlelog-collect-snippet.js` 의 복사본,
 *   `pack.mjs` 가 만든다)의 함수를 부른다: `collectClanMatchList` · `blFetchClan` · `blSleep` · `BL_DELAY_MS`.
 *   여기 있는 것은 「언제 · 무엇을 · 어디까지」뿐이다.
 *
 * ── 로그인
 *   필요 없다. 2026-09-02 실측 — 빈 프로필(쿠키 없음)로도 세 요청이 200 이었다.
 *
 * ── 이 탭만 돈다
 *   URL 이 `…/#sacloud-autocollect` 일 때만 시작한다. 사장님이 병영수첩을 따로 열어 봐도 거기서는 돌지 않는다.
 *
 * ── 상태
 *   `localStorage['sacloud_autocollect_v1']` = { last: { [slug]: { key, at } }, status }
 *   원문은 담지 않는다. 진행은 `__acStatus()` 로 본다.
 */

;(() => {
  const MARK = '#sacloud-autocollect'
  if (location.hash !== MARK) return

  const SRC = 'sacloud-ac'
  const STORE_KEY = 'sacloud_autocollect_v1'
  const BATCH = 40
  /** 처음 보는 클랜은 **어제부터** 만 본다. 과거 전수 수집은 사람이 스니펫으로 한다 (D-218) */
  const FIRST_RUN_DAYS = 1
  /** 목록 요청 간격. 스니펫 하한(500) 위. 원본에 대한 예의 */
  const LIST_DELAY_MS = 1000

  const post = (type, payload) => window.postMessage({ source: SRC, type, ...payload }, location.origin)
  const log = (line) => console.info(`[자동수집] ${line}`)

  const ac = {
    config: null,
    running: false,
    timer: null,
    store: load(),
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '')
      return { last: raw?.last ?? {}, status: raw?.status ?? null }
    } catch {
      return { last: {}, status: null }
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(ac.store))
    } catch (error) {
      console.warn('[자동수집] 진행 표시를 저장하지 못했다:', error)
    }
  }
  function report(status) {
    ac.store.status = status
    save()
    post('status', { status })
  }

  /** `YYYY-MM-DD` (KST 기준으로 며칠 전) — 스니펫의 `from` 형식 */
  function daysAgo(days) {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - days * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  /** match_key 앞 12자리(YYMMDDHHMMSS) → `YYYY-MM-DD` */
  function dateOfKey(key) {
    const k = String(key)
    return `20${k.slice(0, 2)}-${k.slice(2, 4)}-${k.slice(4, 6)}`
  }

  async function send(rows) {
    const response = await fetch(ac.config.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ac.config.token}` },
      body: JSON.stringify({ rows }),
    })
    if (!response.ok) throw new Error(`창구 HTTP ${response.status}`)
    return await response.json()
  }

  function clanList() {
    if (Array.isArray(ac.config?.clans) && ac.config.clans.length > 0) return ac.config.clans
    return Array.isArray(window.SACLOUD_IPL_CLANS) ? window.SACLOUD_IPL_CLANS : []
  }

  /** 클랜 하나. 새 경기의 배틀로그를 받아 보내고 「마지막」을 전진시킨다 */
  async function runClan(slug, totals) {
    const last = ac.store.last[slug]?.key ?? null
    const from = last ? dateOfKey(last) : daysAgo(FIRST_RUN_DAYS)
    const list = await window.collectClanMatchList(slug, {
      from,
      delay: LIST_DELAY_MS,
      keep: true,
      ingest: ac.config.ingestUrl,
      token: ac.config.token,
    })
    if (list.errors > 0 && list.pages === 0) throw new Error(`목록 실패: ${list.stoppedBecause}`)

    const fresh = list.rows
      .filter((r) => r?.match_key && (!last || String(r.match_key) > String(last)))
      .sort((a, b) => String(a.match_key).localeCompare(String(b.match_key)))
    totals.newMatches += fresh.length
    if (fresh.length === 0) return

    /**
     * 「마지막」은 **창구로 보낸 뒤에만** 전진한다 (스니펫의 규칙과 같다).
     *   buffer    받았지만 아직 안 보낸 것
     *   pending   받았고(빈 응답 포함) 아직 「마지막」에 반영 안 된 키 — flush 가 성공하면 committed 로 옮긴다
     *   committed 보낸 것이 확정된 키 중 가장 큰 것 = 새 「마지막」
     * 중간에 실패하면 `break` 한다. 실패한 경기와 그 뒤 경기는 「마지막」 앞에 남아 다음 주기에 다시 온다.
     */
    let buffer = []
    let pending = []
    let committed = last
    const flush = async () => {
      if (buffer.length > 0) {
        const r = await send(buffer)
        totals.sent += buffer.length
        totals.inserted += r.inserted ?? 0
        totals.duplicated += r.duplicated ?? 0
        buffer = []
      }
      // 보낸 것(과 빈 응답)까지 확정. fresh 는 오름차순이라 마지막 원소가 가장 크다
      if (pending.length > 0) {
        committed = pending[pending.length - 1]
        pending = []
      }
    }

    for (const row of fresh) {
      const matchKey = String(row.match_key)
      const clanNo = String(row.clan_no ?? '')
      if (!clanNo) {
        // 주인을 모르는 경기는 받을 수 없다. 키를 추측하지 않는다 — 건너뛰고 「마지막」도 넘긴다
        totals.failed += 1
        pending.push(matchKey)
        continue
      }
      try {
        const json = await window.blFetchClan(matchKey, clanNo)
        const events = Array.isArray(json?.battleLog) ? json.battleLog : []
        if (events.length === 0) totals.empties += 1
        else {
          buffer.push({
            kind: 'battlelog',
            source: 'nexon_barracks',
            endpoint: `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`,
            matchKey,
            clanNo,
            subject: clanNo,
            raw: json,
          })
        }
        pending.push(matchKey)
        if (buffer.length >= BATCH) await flush()
      } catch (error) {
        totals.failed += 1
        log(`${slug} ${matchKey} 실패: ${error?.message ?? error} — 다음 주기에 다시`)
        break
      }
      await window.blSleep(window.BL_DELAY_MS ?? 200)
    }
    try {
      await flush()
    } catch (error) {
      // 마지막 묶음을 못 보냈다. pending 은 확정하지 않는다 — 다음 주기에 다시 받는다 (창구는 멱등)
      totals.failed += 1
      log(`${slug} 창구 전송 실패: ${error?.message ?? error} — 다음 주기에 다시`)
    }
    if (committed && committed !== last) {
      ac.store.last[slug] = { key: committed, at: new Date().toISOString() }
      save()
    }
  }

  async function runCycle(reason) {
    if (ac.running) {
      log(`이미 도는 중 — 이번(${reason}) 은 건너뛴다`)
      return
    }
    if (!ac.config?.token) {
      report({ phase: 'idle', error: '토큰이 없다 — 확장 옵션에서 넣어라', at: new Date().toISOString() })
      return
    }
    const clans = clanList()
    if (clans.length === 0) {
      report({ phase: 'idle', error: '클랜 명단이 없다', at: new Date().toISOString() })
      return
    }
    ac.running = true
    const startedAt = new Date().toISOString()
    const totals = { newMatches: 0, sent: 0, inserted: 0, duplicated: 0, empties: 0, failed: 0, clansDone: 0, clansFailed: 0 }
    report({ phase: 'running', reason, startedAt, clans: clans.length })
    log(`시작 (${reason}) — 클랜 ${clans.length}곳`)
    let error = null
    for (const slug of clans) {
      try {
        await runClan(slug, totals)
        totals.clansDone += 1
      } catch (e) {
        totals.clansFailed += 1
        log(`${slug} 실패: ${e?.message ?? e}`)
        error = `${slug}: ${e?.message ?? e}`
      }
      await window.blSleep(LIST_DELAY_MS)
    }
    ac.running = false
    const status = {
      phase: 'idle',
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      clans: clans.length,
      ...totals,
      error: totals.clansFailed > 0 ? `${totals.clansFailed}곳 실패 · 마지막: ${error}` : null,
    }
    report(status)
    log(`끝 — 새 경기 ${totals.newMatches} · 보냄 ${totals.sent} · 새로 ${totals.inserted} · 이미있음 ${totals.duplicated} · 빈응답 ${totals.empties} · 실패 ${totals.failed}`)
  }

  function armFallbackTimer() {
    if (ac.timer) clearInterval(ac.timer)
    const ms = Math.max(5, ac.config?.intervalMin ?? 15) * 60 * 1000
    // 예비 시계. 숨은 탭에서는 늦을 수 있다 — 진짜 시계는 서비스워커 알람이다 (sw.js 머리말)
    ac.timer = setInterval(() => runCycle('interval'), ms)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== SRC) return
    if (event.data.type === 'config') {
      const first = !ac.config
      ac.config = event.data.config
      armFallbackTimer()
      if (first) setTimeout(() => runCycle('startup'), 10_000)
    } else if (event.data.type === 'tick') {
      runCycle(event.data.reason ?? 'alarm')
    }
  })

  window.__acStatus = () => ({ running: ac.running, hasToken: Boolean(ac.config?.token), clans: clanList().length, last: ac.store.last, status: ac.store.status })
  window.__acRun = () => runCycle('console')

  post('ready', {})
  log('준비됐다 — 설정을 기다린다. __acStatus() / __acRun()')
})()
