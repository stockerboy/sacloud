/**
 * 시즌7 미러링 수집기 — 사람이 자기 브라우저 콘솔에서 직접 돌리는 도구 (D-153).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 자동 크롤러가 아니다. **사람이 연 자기 세션에서, 그 사이트가 자기 화면을 그릴 때
 * 쓰는 바로 그 공개 API를** 같은 속도로 부른다.
 * WAF/CAPTCHA/rate limit 을 우회하지 않는다 (`CLAUDE.md` 3-A 5번).
 * 요청 간 간격을 두고, 429/5xx 를 만나면 물러선다.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 왜 이렇게 만들었나
 *   3rd.supply 는 브라우저 밖 클라이언트에 403 을 준다. 헤더를 위조해 뚫는 것은 금지다.
 *   그래서 **사람의 브라우저 안에서** 돈다. 기존 `collect-snippet.js` 와 같은 방식이다.
 *
 *   그리고 예전 스냅샷은 클랜 페이지 **첫 20건만** 받아 갔다
 *   (`paginated: false`). 그래서 시즌7 경기의 상당수가 처음부터 없었다.
 *   이 도구는 커서를 끝까지 따라간다.
 *
 * 무엇을 가져오나
 *   1) 클랜 목록      /leagues/1/ranks/clans?division=1|2
 *   2) 경기 목록      /leagueclans/{leagueClanId}/matches?cursor=...   ← 커서 끝까지
 *   3) 경기 상세      /leagues/1/matches/{matchId}
 *      여기에 K/D/A · 딜량 · 헤드샷 · **경기 당시 선수별 래더** 가 있다.
 *      경기 목록에는 없다 — 그래서 상세를 따로 받는다.
 *
 * 쓰는 법
 *   0) https://3rd.supply/league/supply 를 연다 (로그인 불필요)
 *   1) F12 → Console. 붙여넣기를 막으면 `allow pasting` 입력 후 Enter
 *   2) 이 파일 전체를 붙여넣고 Enter
 *   3)  await __s7Run()        수집 시작 (중단해도 됨 — 이어서 돈다)
 *       __s7Status()           진행 상황
 *       __s7Export()           JSON 파일로 내려받기
 *       __s7Reset()            처음부터
 *
 *   탭을 닫아도 `localStorage` 에 남는다. 다시 열고 `__s7Run()` 하면 이어서 한다.
 *
 * 이어받기(증분)
 *   이미 받은 matchId 는 다시 상세를 받지 않는다. 나중에 또 돌리면
 *   **새 경기만** 받아 온다. 그래서 이 도구가 그대로 증분 동기화 도구가 된다.
 */
;(() => {
  const API = 'https://api-v2.3rd.supply'
  const LEAGUE_ID = 1
  const LEAGUE_SLUG = 'supply'
  const KEY = 'sacloud.s7.v1'

  /**
   * 이 날짜보다 **이전** 경기를 만나면 그 클랜은 거기서 멈춘다.
   *
   * 우리 DB 의 시즌7 은 2026-06-16 ~ 2026-08-22 다. 여유를 두고 6월 1일로 잡았다.
   * 넉넉히 받는 쪽이 안전하다 — 남는 건 나중에 걸러낼 수 있지만, 빠진 건 못 만든다.
   * 더 과거까지 필요하면 이 값을 바꾼다.
   */
  const FLOOR = '2026-06-01'

  /** 요청 간격(ms). 사이트를 때리지 않기 위한 값이다. 줄이지 말 것. */
  const DELAY = 130

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) ?? null
    } catch {
      return null
    }
  }
  const blank = () => ({
    startedAt: new Date().toISOString(),
    floor: FLOOR,
    clans: {}, // slug -> {leagueClanId, name, division, done, cursor}
    matchList: {}, // matchId -> 목록 항목(요약)
    matchDetail: {}, // matchId -> 상세 응답
    failures: [], // {matchId, status}
  })
  let S = load() ?? blank()
  const save = () => localStorage.setItem(KEY, JSON.stringify(S))

  /** 공개 API 한 번. 429/5xx 는 물러선다. */
  async function get(path, tries = 0) {
    const res = await fetch(`${API}${path}`, { credentials: 'include' })
    if (res.status === 429 || res.status >= 500) {
      if (tries >= 5) throw new Error(`${res.status} ${path}`)
      const wait = Math.min(30000, 1000 * 2 ** tries)
      console.warn(`[s7] ${res.status} — ${wait}ms 쉬고 다시`)
      await sleep(wait)
      return get(path, tries + 1)
    }
    if (!res.ok) {
      const e = new Error(`${res.status} ${path}`)
      e.status = res.status
      throw e
    }
    await sleep(DELAY)
    return res.json()
  }

  /** 1) 클랜 목록 — 부리그별로 커서를 따라간다 */
  async function collectClans() {
    for (const division of [1, 2]) {
      let cursor = null
      for (;;) {
        const q = `?division=${division}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const r = await get(`/leagues/${LEAGUE_ID}/ranks/clans${q}`)
        const rows = r.data ?? []
        for (const row of rows) {
          const c = row.clan
          if (!c?.slug) continue
          S.clans[c.slug] ??= {
            leagueClanId: null,
            clanId: c.id,
            name: c.name,
            division: row.division ?? division,
            done: false,
            cursor: null,
          }
        }
        save()
        cursor = r.metadata?.cursor?.next ?? null
        if (!cursor || rows.length === 0) break
      }
    }
    console.info(`[s7] 클랜 ${Object.keys(S.clans).length}개`)
  }

  /** 클랜 하나의 leagueClanId 를 알아낸다 (경기 목록 호출에 필요) */
  async function resolveLeagueClanId(slug) {
    const c = S.clans[slug]
    if (c.leagueClanId) return c.leagueClanId
    const r = await get(`/leagues/${LEAGUE_SLUG}/clans/${slug}/show`)
    c.leagueClanId = r.data?.id ?? null
    c.division = r.data?.division ?? c.division
    save()
    return c.leagueClanId
  }

  /** 2) 클랜 하나의 경기 목록 — FLOOR 이전을 만날 때까지 커서를 따라간다 */
  async function collectMatchList(slug) {
    const c = S.clans[slug]
    if (c.done) return 0
    const id = await resolveLeagueClanId(slug)
    if (!id) {
      c.done = true
      save()
      return 0
    }
    let added = 0
    for (;;) {
      const q = c.cursor ? `?cursor=${encodeURIComponent(c.cursor)}` : ''
      const r = await get(`/leagueclans/${id}/matches${q}`)
      const rows = r.data ?? []
      let hitFloor = false
      for (const m of rows) {
        if (String(m.start_at ?? '') < FLOOR) {
          hitFloor = true
          continue
        }
        if (!S.matchList[m.id]) {
          /* 어느 클랜 화면에서 봤는지 남긴다. 같은 경기가 양 클랜에 다 나오므로
             나중에 팀 판정을 대조할 수 있다 (D-150 에서 팀 판정으로 크게 데였다) */
          S.matchList[m.id] = { ...m, _seenFrom: slug }
          added += 1
        }
      }
      save()
      c.cursor = r.metadata?.cursor?.next ?? null
      if (hitFloor || !c.cursor || rows.length === 0) {
        c.done = true
        save()
        break
      }
    }
    return added
  }

  /** 3) 경기 상세 — K/D/A · 딜량 · 헤드샷 · 경기 당시 선수별 래더 */
  async function collectDetail(matchId) {
    if (S.matchDetail[matchId]) return false
    try {
      const r = await get(`/leagues/${LEAGUE_ID}/matches/${matchId}`)
      S.matchDetail[matchId] = r.data ?? r
      return true
    } catch (e) {
      /* 실패를 삼키지 않는다. 무엇이 왜 빠졌는지 남긴다 */
      S.failures.push({ matchId, status: e.status ?? String(e.message), at: new Date().toISOString() })
      save()
      return false
    }
  }

  async function run() {
    console.info('[s7] 시작 — 중단해도 됩니다. 다시 __s7Run() 하면 이어서 합니다')
    if (Object.keys(S.clans).length === 0) await collectClans()

    const slugs = Object.keys(S.clans)
    for (let i = 0; i < slugs.length; i += 1) {
      const slug = slugs[i]
      if (S.clans[slug].done) continue
      const n = await collectMatchList(slug)
      console.info(`[s7] 목록 ${i + 1}/${slugs.length} ${slug} +${n} (누적 ${Object.keys(S.matchList).length})`)
    }

    const ids = Object.keys(S.matchList).filter((id) => !S.matchDetail[id])
    console.info(`[s7] 상세 받을 경기 ${ids.length}건`)
    for (let i = 0; i < ids.length; i += 1) {
      await collectDetail(ids[i])
      if ((i + 1) % 25 === 0) {
        save()
        console.info(`[s7] 상세 ${i + 1}/${ids.length}`)
      }
    }
    save()
    status()
    console.info('[s7] 끝. __s7Export() 로 내려받으세요')
  }

  function status() {
    const clans = Object.values(S.clans)
    const dates = Object.values(S.matchList)
      .map((m) => m.start_at)
      .sort()
    const out = {
      클랜: `${clans.filter((c) => c.done).length}/${clans.length} 완료`,
      경기목록: Object.keys(S.matchList).length,
      경기상세: Object.keys(S.matchDetail).length,
      남은상세: Object.keys(S.matchList).length - Object.keys(S.matchDetail).length,
      실패: S.failures.length,
      기간: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '-',
    }
    console.info(JSON.stringify(out, null, 1))
    return out
  }

  function exportJson() {
    const payload = {
      source: '3rd.supply',
      sourceType: 'public-api',
      note:
        '사람이 자기 브라우저에서 사이트 자신의 공개 API를 같은 속도로 불러 받았다. ' +
        'API 우회·헤더 위조·차단 우회 없음. 커서를 끝까지 따라갔다(예전 스냅샷은 첫 20건뿐이었다).',
      route: `${API}/leagueclans/{leagueClanId}/matches · ${API}/leagues/1/matches/{matchId}`,
      capturedAt: new Date().toISOString().slice(0, 10),
      leagueSlug: LEAGUE_SLUG,
      floor: S.floor,
      paginated: true,
      clanCount: Object.keys(S.clans).length,
      matchCount: Object.keys(S.matchList).length,
      detailCount: Object.keys(S.matchDetail).length,
      failures: S.failures,
      clans: S.clans,
      matches: S.matchList,
      details: S.matchDetail,
    }
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `supply-season7-${payload.capturedAt}.json`
    a.click()
    console.info(`[s7] 내려받기 — 경기 ${payload.matchCount} · 상세 ${payload.detailCount}`)
    return payload.matchCount
  }

  window.__s7Run = run
  window.__s7Status = status
  window.__s7Export = exportJson
  window.__s7Reset = () => {
    localStorage.removeItem(KEY)
    S = blank()
    console.info('[s7] 초기화했습니다')
  }

  console.info(
    '[s7] 준비됐습니다.\n' +
      '  await __s7Run()   수집 (중단해도 이어서 함)\n' +
      '  __s7Status()      진행 상황\n' +
      '  __s7Export()      JSON 내려받기\n' +
      '  __s7Reset()       처음부터',
  )
  status()
})()
