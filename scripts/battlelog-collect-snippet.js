/**
 * 배틀로그 **전수수집** — 브라우저에서 돌리는 스니펫 (D-218).
 *
 * ── 쓰는 법 (세 줄)
 *   1. 병영수첩(`https://barracks.sa.nexon.com`)을 열고 **로그인한 채로** 둔다
 *   2. F12 → Console 에 이 파일 전체를 붙여 넣는다
 *   3. 아래 한 줄을 실행한다
 *
 *        await collectBattleLogs()
 *
 *      · 특정 우선순위만:      await collectBattleLogs({ priority: 1 })
 *      · 특정 조각만:          await collectBattleLogs({ part: 'p1-001' })
 *      · 파일로 받고 싶으면:   await collectBattleLogs({ mode: 'download' })
 *
 *   ⚠ **`await` 없이 띄워 두고** `__blStatus()` 로 지켜봐도 된다. 오래 돈다.
 *
 * ── 왜 브라우저인가
 *   Node 에서 병영수첩을 부르면 **403** 이다(AWS WAF). 브라우저에서 부르면 200 이다.
 *   그건 우회가 아니라 **브라우저가 평소 보내는 그대로의 요청**이다.
 *   그래서 이 스니펫은 **헤더를 하나도 만들지 않는다** — `credentials: 'include'` 뿐이다.
 *   UA·Referer·쿠키를 손으로 짜 넣지 않는다 (`CLAUDE.md` 3-A 5번).
 *
 * ── 왜 파일이 아니라 POST 인가 (2026-08-31 방식 변경)
 *   브라우저 다운로드는 이름을 우리가 못 정한다. 실측: 수집 파일 115개가
 *   `Downloads\<GUID>.tmp` 로 쌓여 어느 것이 무엇인지 알 수 없었다.
 *   배틀로그는 파일이 수백 개다. 그래서 **묶음마다 우리 dev 서버로 바로 보낸다.**
 *
 *   `mode: 'download'` 로 **옛 방식도 그대로 남아 있다** (`CLAUDE.md` 10-4).
 *   POST 가 막히면(dev 서버가 꺼져 있으면) **자동으로 download 로 떨어지고 로그에 남긴다.**
 *
 * ── 한 경기에 **한 번만** 부른다 (2026-08-31 정정 · D-218)
 *   예전에는 "응답에 부른 클랜 한 쪽분만 온다" 고 보고 경기마다 두 번 불렀다. **틀렸다.**
 *   같은 경기를 양쪽 클랜번호로 각각 불러 보니 사망사건 82개가 완전히 일치했고
 *   등장 인물도 10명 전원이었다. `event_type=kill` 이 상대 팀 사망을, `death` 가 우리 팀
 *   사망을 담기 때문이다. **어느 쪽으로 불러도 양 팀이 다 온다.**
 *
 *   그래서 작업목록의 `discover` 는 이제 늘 `0` 이고, 아래 이어받기 길은 **타지 않는다.**
 *   길 자체는 남겨 둔다 (`CLAUDE.md` 10-4) — `battlelogWorklist.ts --both-sides` 로 만든
 *   옛 목록에는 `discover=1` 이 있고, 그때는 응답의 `teamList` 로 상대를 찾아 이어 받는다.
 *
 * ── 원본에 대한 예의
 *   순차 호출 · 요청 사이 200ms · 실패하면 지수 백오프(1.2s → 2.4s → 4.8s)로 **세 번까지만**.
 *   그 뒤엔 실패로 적고 넘어간다. 두들기지 않는다. 간격을 150ms 밑으로 내리지 마라.
 *
 * ── 중단되면
 *   진행 위치를 `localStorage` 에 남긴다. 창을 닫았다 다시 열고 같은 명령을 실행하면
 *   **이미 받은 것은 건너뛴다.** POST 로 보낸 것은 DB 에 있으니 그쪽도 안전하다.
 *     __blStatus()   현재 진행
 *     __blStop()     멈춘다 (받던 것 하나는 마저 받는다)
 *     __blExport()   아직 안 보낸 것을 파일로 내린다
 *     __blReset()    진행 표시를 전부 지운다 (처음부터)
 */

/* --------------------------------------------------------------- 설정 --- */

/* ⚠ 위에서부터 `var` 를 쓴다 — 콘솔에 **두 번 붙여 넣어도** 터지지 않게 하려는 것이다.
   `const` 로 두면 재실행이 `Identifier has already been declared` 로 죽는다 */

/** 우리 dev 서버 창구. 켜져 있어야 `post` 모드가 산다 */
var BL_INGEST = 'http://127.0.0.1:3000/api/dev/battlelog-ingest'
/** 요청 간격(ms). **150 밑으로 내리지 마라** — 원본에 대한 예의다 */
var BL_DELAY_MS = 200
/** 첫 재시도 대기(ms). 실패마다 두 배로 늘린다 */
var BL_BACKOFF_MS = 1200
/** 한 번에 몇 건씩 보낼까. 경기 하나가 90KB 안팎이라 40건이면 3~4MB 다 */
var BL_BATCH = 40
/** "이건 이미 받았다" 표시만 담는다. **원문은 절대 담지 않는다** (5~10MB 한도) */
var BL_STORE_KEY = 'sacloud_battlelog_sweep_v1'

var blSleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* --------------------------------------------------------------- 상태 --- */

/** 아직 안 보낸 것 — **메모리에만** 있다 */
var blBuffer = { rows: [], failures: [], part: 0 }

var blState = {
  running: false,
  stop: false,
  mode: 'post',
  list: null,
  listIndex: 0,
  listTotal: 0,
  pairIndex: 0,
  pairTotal: 0,
  fetched: 0,
  sent: 0,
  inserted: 0,
  duplicated: 0,
  empty: 0,
  failed: 0,
  fellBackToDownload: false,
  startedAt: null,
  finishedAt: null,
}

function blLoadDone() {
  try {
    const raw = JSON.parse(localStorage.getItem(BL_STORE_KEY) ?? '')
    return new Set(Array.isArray(raw?.done) ? raw.done : [])
  } catch {
    return new Set()
  }
}

/**
 * 완료 표시를 남긴다. **보낸 뒤에만 부른다** — 받자마자 표시하면,
 * 보내기 전에 창이 죽었을 때 그 조각을 영영 다시 안 받는다.
 */
function blSaveDone(done) {
  try {
    localStorage.setItem(BL_STORE_KEY, JSON.stringify({ done: [...done] }))
  } catch (error) {
    console.warn('[수집] 완료 표시를 저장하지 못했다 — 다시 돌리면 겹쳐 받는다:', error)
  }
}

/* --------------------------------------------------------------- 전송 --- */

function blDownload(name, payload) {
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

/**
 * 모아 둔 것을 내보낸다. 성공하면 `true`.
 *
 * `post` 모드에서 창구가 안 열리면 **한 번만 알리고 `download` 로 떨어진다.**
 * 조용히 파일로 떨어뜨리면 "보낸 줄 알았는데 없더라" 가 된다.
 */
async function blFlush(done, pending) {
  if (blBuffer.rows.length === 0 && blBuffer.failures.length === 0) return false

  if (blState.mode === 'post') {
    try {
      const response = await fetch(BL_INGEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: blBuffer.rows, failures: blBuffer.failures }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json()
      blState.sent += json.received ?? 0
      blState.inserted += json.inserted ?? 0
      blState.duplicated += json.duplicated ?? 0
      console.info(
        `[수집] 보냄 ${json.received}건 — 새로 ${json.inserted} · 이미있음 ${json.duplicated} · 건너뜀 ${json.skipped}`,
      )
      blBuffer.rows = []
      blBuffer.failures = []
      for (const key of pending) done.add(key)
      pending.clear()
      blSaveDone(done)
      return true
    } catch (error) {
      blState.mode = 'download'
      blState.fellBackToDownload = true
      console.warn(
        `[수집] ⚠ dev 서버로 보내지 못했다 (${error}) — **파일 방식으로 바꾼다.** ` +
          `pnpm dev 를 켠 뒤 __blMode("post") 로 되돌릴 수 있다`,
      )
      /* 아래로 흘러가 download 로 처리한다 */
    }
  }

  blBuffer.part += 1
  const name = `battlelog-sweep-${String(blBuffer.part).padStart(3, '0')}.json`
  blDownload(name, {
    collected_at: new Date().toISOString(),
    part: blBuffer.part,
    note: '클랜 단위 배틀로그 원문 (D-218). nexon battlelog-import --file <이 파일 또는 폴더>',
    rows: blBuffer.rows,
    failures: blBuffer.failures,
  })
  console.info(`[수집] ${name} 내림 — ${blBuffer.rows.length}건`)
  blState.sent += blBuffer.rows.length
  blBuffer.rows = []
  blBuffer.failures = []
  for (const key of pending) done.add(key)
  pending.clear()
  blSaveDone(done)
  return true
}

/* --------------------------------------------------------------- 요청 --- */

/**
 * 병영수첩 배틀로그 한 번.
 *
 * **헤더를 만들지 않는다.** 브라우저가 평소 보내는 그대로 간다.
 * 실패하면 지수 백오프로 세 번까지만 — 그 뒤엔 포기한다.
 */
async function blFetchClan(matchKey, clanNo) {
  let wait = BL_BACKOFF_MS
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      if (attempt === 2) throw error
      await blSleep(wait)
      wait *= 2
    }
  }
  return null
}

/** 작업목록 한 조각을 dev 서버에서 받아 온다 */
async function blLoadList(name) {
  const response = await fetch(`${BL_INGEST}?list=${encodeURIComponent(name)}`)
  if (!response.ok) throw new Error(`작업목록 ${name} 을 못 받았다 (HTTP ${response.status})`)
  return await response.json()
}

/* --------------------------------------------------------------- 본체 --- */

/**
 * @param options `{ priority, part, mode, delay, worklist }`
 *   · `priority` 1~4. 그 우선순위 조각만 돈다. 없으면 1 → 4 순서로 전부
 *   · `part`     `'p1-001'` 처럼 조각 하나만
 *   · `mode`     `'post'`(기본) 또는 `'download'`
 *   · `delay`    요청 간격(ms). 150 밑으로는 안 내려간다
 *   · `worklist` 작업목록 객체를 직접 넘긴다 (dev 서버 없이 손으로 붙여 넣을 때)
 */
window.collectBattleLogs = async function collectBattleLogs(options = {}) {
  const delay = Math.max(150, options.delay ?? BL_DELAY_MS)
  blState.mode = options.mode === 'download' ? 'download' : 'post'
  blState.running = true
  blState.stop = false
  blState.startedAt = new Date().toISOString()
  blState.finishedAt = null

  /* 어떤 조각들을 돌 것인가 */
  let names = []
  let inline = null
  if (options.worklist) {
    inline = options.worklist
  } else if (options.part) {
    names = [options.part]
  } else {
    let index
    try {
      index = await blLoadList('index')
    } catch (error) {
      blState.running = false
      console.error(
        `[수집] 작업목록을 못 받았다 (${error}).\n` +
          '  · pnpm dev 가 127.0.0.1:3000 에 떠 있는지\n' +
          '  · battlelogWorklist.ts 를 돌렸는지 확인해라.\n' +
          '  손으로 넘기려면: collectBattleLogs({ worklist: <붙여넣은 JSON> })',
      )
      return null
    }
    names = (index.parts ?? [])
      .filter((p) => !options.priority || p.priority === options.priority)
      .map((p) => p.file.replace(/\.json$/, ''))
    console.info(
      `[수집] 조각 ${names.length}개 · 짝 ${(index.parts ?? [])
        .filter((p) => !options.priority || p.priority === options.priority)
        .reduce((s, p) => s + p.pairs, 0)}개`,
    )
  }

  const done = blLoadDone()
  /** 받았지만 아직 못 보낸 것 — 보낸 뒤에 `done` 으로 옮긴다 */
  const pending = new Set()
  blState.listTotal = inline ? 1 : names.length
  blState.listIndex = 0

  const lists = inline ? [inline] : names

  for (const entry of lists) {
    if (blState.stop) break
    let list
    if (inline) {
      list = entry
    } else {
      blState.list = entry
      try {
        list = await blLoadList(entry)
      } catch (error) {
        console.warn(`[수집] 조각 ${entry} 을 못 받았다: ${error}`)
        continue
      }
    }
    const clans = list.clans ?? []
    const pairs = list.pairs ?? []
    blState.pairTotal = pairs.length
    blState.pairIndex = 0
    console.info(`[수집] ${blState.list ?? '직접넘김'} — ${list.label ?? ''} 짝 ${pairs.length}개`)

    for (const [matchKey, clanIdx, discover] of pairs) {
      if (blState.stop) break
      blState.pairIndex += 1

      /* 씨앗 한 쪽 + (discover 면) 상대 한 쪽. 상대는 응답이 알려 준다 */
      const queue = [String(clans[clanIdx])]
      const seen = new Set(queue)

      while (queue.length > 0) {
        if (blState.stop) break
        const clanNo = queue.shift()
        const key = `${matchKey}:${clanNo}`
        if (done.has(key) || pending.has(key)) continue

        try {
          const json = await blFetchClan(matchKey, clanNo)
          const events = Array.isArray(json?.battleLog) ? json.battleLog : []
          if (events.length === 0) {
            /* 지워졌거나 애초에 없는 경기다. **실패가 아니다** — 표시만 하고 넘어간다 */
            blState.empty += 1
            blBuffer.failures.push({ matchKey, clanNo, stage: 'battleLog', error: '이벤트 0건' })
            pending.add(key)
          } else {
            blBuffer.rows.push({
              source: 'nexon_barracks',
              endpoint: `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`,
              matchKey,
              clanNo,
              subject: clanNo,
              /* **원문을 그대로 담는다.** `teamList` 를 버리면 team_no 가 어느 클랜인지
                 알 수 없게 되고, 그러면 진영 판정이 통째로 불가능해진다 */
              raw: json,
            })
            blState.fetched += 1
            pending.add(key)

            /* 상대 클랜번호는 응답이 알려 준다 (`teamList`) */
            if (discover === 1) {
              for (const t of json?.teamList ?? []) {
                const other = t?.clan_no ? String(t.clan_no) : null
                if (other && !seen.has(other)) {
                  seen.add(other)
                  queue.push(other)
                }
              }
            }
          }
        } catch (error) {
          blState.failed += 1
          blBuffer.failures.push({ matchKey, clanNo, stage: 'battleLog', error: String(error) })
        }

        if (blBuffer.rows.length >= BL_BATCH) await blFlush(done, pending)
        await blSleep(delay)
      }
    }
    await blFlush(done, pending)
    blState.listIndex += 1
    console.info(`[수집] ${blState.list ?? ''} 끝 — 누적 받음 ${blState.fetched}건`)
  }

  await blFlush(done, pending)
  blState.running = false
  blState.finishedAt = new Date().toISOString()
  console.info(`[수집] 전부 끝 — 받음 ${blState.fetched} · 빈응답 ${blState.empty} · 실패 ${blState.failed}`)
  return window.__blStatus()
}

/* --------------------------------------------------------------- 도구 --- */

/**
 * 지금 진행 상황. **숫자만 돌려준다** — 원문을 돌려주면 콘솔이 잠긴다.
 * 오래 도는 수집은 `await` 하지 말고 띄워 둔 뒤 이걸로 본다.
 */
window.__blStatus = function __blStatus() {
  return { ...blState, buffered: blBuffer.rows.length, files: blBuffer.part }
}

/** 전송 방식을 바꾼다. `post` 로 되돌릴 때 쓴다 */
window.__blMode = function __blMode(mode) {
  blState.mode = mode === 'download' ? 'download' : 'post'
  console.info(`[수집] 전송 방식 = ${blState.mode}`)
  return blState.mode
}

/** 아직 안 보낸 것을 지금 내보낸다 */
window.__blExport = async function __blExport() {
  const done = blLoadDone()
  const pending = new Set()
  if (!(await blFlush(done, pending))) console.info('내보낼 것이 없다')
  return window.__blStatus()
}

/** 돌던 수집을 멈춘다. 받던 것 하나는 마저 받는다 */
window.__blStop = function __blStop() {
  blState.stop = true
  console.info('멈추라고 표시했다')
}

/** 진행 표시를 전부 지운다. 다음 실행은 처음부터다 */
window.__blReset = function __blReset() {
  localStorage.removeItem(BL_STORE_KEY)
  blBuffer.rows = []
  blBuffer.failures = []
  blBuffer.part = 0
  console.info('지웠다. 다음 실행은 처음부터다')
}

console.info(
  '준비됐다.\n' +
    '  await collectBattleLogs({ priority: 1 })   1티어부터\n' +
    '  await collectBattleLogs()                  1 → 4 순서로 전부\n' +
    '  __blStatus() / __blStop() / __blExport()',
)
