/**
 * 다리 — 확장(ISOLATED world) ↔ 페이지(MAIN world).
 *
 * 페이지 쪽(autocollect.js)은 `chrome.storage` 를 못 본다. 여기서 설정(토큰·창구·명단)을 읽어
 * `window.postMessage` 로 넘기고, 페이지가 올리는 상태를 서비스워커로 전달한다.
 *
 * 토큰은 **첫 실행 때 한 번 물어** `chrome.storage.local` 에 둔다. 파일에 박지 않는다.
 * (옵션 페이지에서 언제든 바꿀 수 있다)
 *
 * ⚠ 토큰은 결국 페이지 컨텍스트로 간다 — 요청을 보내는 쪽이 페이지이기 때문이다.
 *    같은 페이지의 다른 스크립트가 읽을 수 있다는 뜻이다. 창구 토큰은 그 위험을 안고 쓰는 값이고,
 *    새면 Vercel 환경변수에서 바꾸면 된다 (`apps/web/app/api/ingest/barracks/route.ts` 머리말).
 */

const MARK = '#sacloud-autocollect'
const DEFAULT_INGEST = 'https://3rdcloud.my/api/ingest/barracks'
const SRC = 'sacloud-ac'

if (location.hash === MARK) {
  const post = (type, payload) => window.postMessage({ source: SRC, type, ...payload }, location.origin)

  async function loadConfig() {
    const c = await chrome.storage.local.get(['ingestToken', 'ingestUrl', 'intervalMin', 'clans', 'clansUpdatedAt'])
    let token = (c.ingestToken ?? '').trim()
    if (!token) {
      // 첫 실행. 한 번만 묻는다. 취소하면 토큰 없이 대기 상태로 둔다 (옵션 페이지에서 넣으면 된다)
      const typed = window.prompt('SACLOUD 병영수첩 수집 토큰을 붙여 넣으세요 (총괄이 준 값)')
      token = (typed ?? '').trim()
      if (token) await chrome.storage.local.set({ ingestToken: token })
    }
    return {
      token,
      ingestUrl: (c.ingestUrl ?? '').trim() || DEFAULT_INGEST,
      intervalMin: Number(c.intervalMin) || 15,
      clans: Array.isArray(c.clans) && c.clans.length > 0 ? c.clans : null,
      clansUpdatedAt: c.clansUpdatedAt ?? null,
    }
  }

  async function sendConfig() {
    try {
      post('config', { config: await loadConfig() })
    } catch (error) {
      console.warn('[bridge] 설정을 못 읽었다:', error)
    }
  }

  // 페이지 → 확장
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== SRC) return
    if (event.data.type === 'ready') sendConfig()
    else if (event.data.type === 'status') {
      chrome.storage.local.set({ lastStatus: event.data.status }).catch(() => {})
      try {
        chrome.runtime.sendMessage({ type: 'status', status: event.data.status }).catch(() => {})
      } catch {
        /* 워커가 자는 중이면 다음에 */
      }
    }
  })

  // 서비스워커 → 페이지
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'tick') {
      post('tick', { reason: msg.reason ?? 'alarm' })
      reply({ ok: true })
    } else if (msg?.type === 'config') {
      sendConfig()
      reply({ ok: true })
    }
    return false
  })

  // 옵션 페이지에서 토큰·창구·명단이 바뀌면 바로 넘긴다
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes.ingestToken || changes.ingestUrl || changes.intervalMin || changes.clans) sendConfig()
  })

  sendConfig()
}
