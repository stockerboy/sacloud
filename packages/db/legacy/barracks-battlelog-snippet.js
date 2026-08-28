/**
 * 병영수첩 BattleLog **원문 그대로** 받아 오는 브라우저 스니펫.
 *
 * ── 왜 브라우저에서 하나
 *   Node 로 병영수첩을 부르면 403 이다 (봇차단). UA 를 위조해 뚫지 않는다 —
 *   `CLAUDE.md` 3-A 5번(접근 통제를 우회하지 않는다). D-114 에서 정한 방식 그대로,
 *   **수집은 로그인된 정상 브라우저가 하고 워커는 그 결과 파일을 읽는다.**
 *
 * ── 왜 새로 필요한가
 *   기존 수집은 무기 판정에 필요한 것만 남기고 이벤트를 **집계해 버렸다**
 *   (`rifleKills` / `sniperKills` 만 저장). 그래서 지금 우리 DB 에는
 *   `totalEvents: 135` 같은 개수만 있고 이벤트 본문이 없다.
 *
 *   답해야 하는 질문은 이것이다 —
 *   **BattleLog 이벤트에 "어디서" 에 해당하는 값(좌표·구역)이 들어 있는가?**
 *   D-114 가 적어 둔 실측 구조에는 없다:
 *     { event_type: 'kill',  user_nexon_sn, user_nick, weapon: 'riple' }
 *     { event_type: 'death', user_nexon_sn, target_user_nexon_sn, target_weapon: 'sniper' }
 *   다만 그건 **쓴 필드만** 적은 것이라 전부인지는 알 수 없다.
 *   그래서 이 스니펫은 **가공하지 않고 원문을 통째로** 내려받는다 (3-A 1번).
 *
 * ── 쓰는 법
 *   1. 병영수첩에 로그인한 상태로 아무 클랜전 기록 화면을 연다
 *   2. F12 → Console 에 이 파일 내용을 붙여 넣는다
 *   3. 아래 둘 중 하나를 실행한다
 *
 *        await peekBattleLog('260820162642124001', '070716026783')
 *          → 한 건만 받아 **필드 목록을 콘솔에 찍는다.** 먼저 이것부터 한다.
 *            위치 값이 있는지 여기서 바로 보인다.
 *
 *        await dumpBattleLogs([
 *          ['경기번호', '클랜번호'],
 *          ...
 *        ])
 *          → 여러 건을 받아 `barracks-battlelog.json` 파일로 저장한다.
 *
 *   4. 저장된 파일을 넘겨주면 워커가 읽는다. **원문을 버리지 않는다.**
 *
 * ── 원본에 대한 예의
 *   요청 사이에 간격을 둔다. 한 번에 몰아치지 않는다 (3-A 4번 rate limit 준수).
 *   실패하면 그냥 실패로 기록한다 — 재시도로 두들기지 않는다.
 */

/** 요청 간격(ms). 줄이지 마라 */
const DELAY_MS = 400

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 중첩 객체의 키 경로를 전부 모은다 — 어떤 필드가 있는지 눈으로 보려는 것이다 */
function fieldPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    if (value.length > 0) fieldPaths(value[0], `${prefix}[]`, out)
    return out
  }
  if (value === null || typeof value !== 'object') {
    out.add(`${prefix} = ${value === null ? '(null)' : String(value).slice(0, 40)}`)
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    fieldPaths(child, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

async function fetchBattleLog(matchKey, clanNo) {
  const url = `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

/**
 * 한 건만 받아 **필드 목록**을 찍는다.
 *
 * 여기서 좌표·구역처럼 보이는 키가 나오면 포지션 분석이 가능하다는 뜻이고,
 * `event_type` · `weapon` · `user_nexon_sn` 밖에 없으면 **이 경로로는 불가능**하다.
 */
window.peekBattleLog = async function peekBattleLog(matchKey, clanNo) {
  const raw = await fetchBattleLog(matchKey, clanNo)
  console.info('--- 최상위 키 ---')
  console.info(Object.keys(raw))
  console.info('--- 전체 필드 경로 (첫 원소 기준) ---')
  for (const path of [...fieldPaths(raw)].sort()) console.info(path)
  console.info('--- 이벤트 한 건 원문 ---')
  const events = raw.battleLogs ?? raw.logs ?? raw.events ?? raw.data ?? null
  console.info(Array.isArray(events) ? events[0] : '(이벤트 배열을 못 찾았다. 위 키 목록을 보라)')
  return raw
}

/**
 * 여러 건을 받아 파일로 저장한다.
 *
 * `pairs` 는 `[[경기번호, 클랜번호], ...]` 다.
 * 응답을 **가공하지 않고** 그대로 담는다 — 나중에 규칙이 바뀌어도 재요청 없이 다시 계산한다.
 */
window.dumpBattleLogs = async function dumpBattleLogs(pairs) {
  const rows = []
  const failures = []
  for (const [matchKey, clanNo] of pairs) {
    try {
      const raw = await fetchBattleLog(matchKey, clanNo)
      rows.push({
        source: 'nexon_barracks',
        endpoint: `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`,
        matchKey: String(matchKey),
        clanNo: String(clanNo),
        fetched_at: new Date().toISOString(),
        raw,
      })
    } catch (error) {
      failures.push({ matchKey: String(matchKey), clanNo: String(clanNo), error: String(error) })
    }
    console.info(`${rows.length + failures.length} / ${pairs.length}`)
    await sleep(DELAY_MS)
  }

  const payload = { collected_at: new Date().toISOString(), rows, failures }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'barracks-battlelog.json'
  link.click()
  URL.revokeObjectURL(link.href)

  console.info(`성공 ${rows.length} · 실패 ${failures.length} — barracks-battlelog.json 저장됨`)
  return payload
}

console.info('준비됐다. 먼저 peekBattleLog(경기번호, 클랜번호) 를 실행해 필드부터 보라.')
