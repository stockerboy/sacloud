/**
 * 병영수첩 **배틀로그 요청을 잡아내는** 브라우저 스니펫.
 *
 * ── 왜 이렇게 하나
 *   배틀로그 탭이 맵 위에 킬 지점을 찍는다. 그러니 응답에 좌표가 **있다.**
 *   그런데 그 값을 주는 경로를 우리가 모른다 — 예전에 알던
 *   `/api/BattleLog/GetBattleLogClan/...` 은 클랜 화면 것이고,
 *   지금 보는 선수 화면(`/{PLAYER}/match`)은 다른 것을 부를 수 있다.
 *
 *   경로를 **추측하지 않는다.** 브라우저가 실제로 보내는 요청을 가로채 그대로 기록한다
 *   (CLAUDE.md 3장 7번 — 확인되지 않은 것을 그럴듯하게 메우지 않는다).
 *
 * ── 쓰는 법
 *   1. 병영수첩에서 클랜매치 하나를 펼치고 **`배틀로그` 탭이 보이는 상태**로 둔다
 *   2. F12 → Console 에 **이 파일 내용을 통째로 붙여 넣는다** (엔터)
 *      → `잡을 준비가 됐다` 가 찍힌다
 *   3. 화면에서 **`배틀로그` 탭을 다시 눌러** 요청이 새로 나가게 한다
 *      (다른 경기를 열어 배틀로그를 눌러도 된다)
 *   4. 콘솔에 잡힌 요청의 **주소와 응답 필드**가 찍힌다
 *   5. `dumpSniffed()` 를 실행하면 원문이 `barracks-sniff.json` 으로 저장된다
 *
 *   찍힌 내용을 그대로 넘겨주면 된다. **응답을 가공하지 않는다** (3-A 1번).
 *
 * ── 안전
 *   읽기만 한다. 요청을 새로 만들지 않는다 — 화면이 이미 보내는 것을 **엿보기만** 한다.
 *   그래서 원본에 추가 부하가 0이다. 로그인 정보를 어디로도 보내지 않는다.
 */

;(function installSniffer() {
  /** 잡은 것 — `dumpSniffed()` 가 이걸 저장한다 */
  const captured = (window.__sniffed = window.__sniffed || [])

  /** 배틀로그처럼 보이는 주소인가. 넓게 잡고 나중에 눈으로 고른다 */
  const LOOKS_RELEVANT = /battle|log|match|replay|round|kill/i

  /** 중첩 객체의 키 경로를 모은다 — 좌표가 있는지 눈으로 보려는 것이다 */
  function fieldPaths(value, prefix = '', out = new Set(), depth = 0) {
    if (depth > 6) return out
    if (Array.isArray(value)) {
      if (value.length > 0) fieldPaths(value[0], `${prefix}[]`, out, depth + 1)
      return out
    }
    if (value === null || typeof value !== 'object') {
      out.add(`${prefix} = ${value === null ? '(null)' : String(value).slice(0, 40)}`)
      return out
    }
    for (const [key, child] of Object.entries(value)) {
      fieldPaths(child, prefix ? `${prefix}.${key}` : key, out, depth + 1)
    }
    return out
  }

  function report(url, method, body) {
    let parsed = body
    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body)
      } catch {
        return // JSON 이 아니면 우리가 찾는 것이 아니다
      }
    }
    if (parsed === null || typeof parsed !== 'object') return

    captured.push({ url, method, captured_at: new Date().toISOString(), raw: parsed })

    console.info('%c잡았다 →', 'color:#0a0;font-weight:bold', method, url)
    const paths = [...fieldPaths(parsed)].sort()
    console.info(`   필드 ${paths.length}개:`)
    for (const path of paths) console.info('   ', path)

    /* 좌표처럼 생긴 키를 따로 짚어 준다 */
    const hits = paths.filter((p) => /\b(x|y|z|pos|position|coord|loc|area|zone|spot|map)\b/i.test(p))
    if (hits.length > 0) {
      console.info('%c   ↑ 위치로 보이는 키:', 'color:#c00;font-weight:bold')
      for (const hit of hits) console.info('     ', hit)
    } else {
      console.info('   (위치로 보이는 키는 못 찾았다)')
    }
  }

  /* --- fetch 가로채기 --- */
  const originalFetch = window.fetch
  window.fetch = async function sniffFetch(...args) {
    const response = await originalFetch.apply(this, args)
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''
      if (LOOKS_RELEVANT.test(url)) {
        /* 원본 응답을 소비하면 화면이 깨진다. 복제본에서 읽는다 */
        response
          .clone()
          .text()
          .then((text) => report(url, (args[1] && args[1].method) || 'GET', text))
          .catch(() => {})
      }
    } catch {
      /* 엿보기가 실패해도 화면 동작을 막지 않는다 */
    }
    return response
  }

  /* --- XMLHttpRequest 가로채기 (옛 코드가 이걸 쓸 수 있다) --- */
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function sniffOpen(method, url, ...rest) {
    this.__sniffUrl = url
    this.__sniffMethod = method
    return originalOpen.call(this, method, url, ...rest)
  }
  XMLHttpRequest.prototype.send = function sniffSend(...args) {
    this.addEventListener('load', () => {
      try {
        if (LOOKS_RELEVANT.test(this.__sniffUrl || '')) {
          report(this.__sniffUrl, this.__sniffMethod || 'GET', this.responseText)
        }
      } catch {
        /* 무시 */
      }
    })
    return originalSend.apply(this, args)
  }

  /** 잡은 것을 파일로 저장한다 */
  window.dumpSniffed = function dumpSniffed() {
    const blob = new Blob([JSON.stringify({ captured_at: new Date().toISOString(), captured })], {
      type: 'application/json',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'barracks-sniff.json'
    link.click()
    URL.revokeObjectURL(link.href)
    console.info(`${captured.length}건 저장했다 — barracks-sniff.json`)
  }

  console.info(
    '%c잡을 준비가 됐다. 이제 화면에서 `배틀로그` 탭을 눌러라.',
    'color:#00a;font-weight:bold',
  )
  console.info('끝나면 dumpSniffed() 를 실행하면 파일로 저장된다.')
})()
