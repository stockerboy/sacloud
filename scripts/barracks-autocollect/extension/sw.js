/**
 * 서비스워커 — **시계와 탭 관리만** 한다. 병영수첩에는 한 번도 손대지 않는다.
 *
 * ── 누가 요청을 보내나 (분명히 해 둔다)
 *   병영수첩 세션 쿠키를 들고 요청하는 것은 **고정된 병영수첩 탭 안의 페이지**(autocollect.js · MAIN world)다.
 *   여기(서비스워커)는 15분마다 그 탭에 「지금 한 바퀴 돌아라」 메시지를 보내고, 탭이 없으면 다시 연다.
 *   `chrome.alarms` 는 서비스워커를 깨우는 시계이지 fetch 주체가 아니다.
 *
 * ── 왜 알람인가 (백그라운드 타이머 제한)
 *   크롬은 숨은 탭의 `setTimeout/setInterval` 을 늦춘다 (5분 뒤부터 1분에 한 번 수준).
 *   그런데 **확장 메시지(`tabs.sendMessage`)는 그 제한을 받지 않는다** — 받자마자 처리된다.
 *   그래서 페이지의 `setInterval` 은 예비이고, 진짜 시계는 이 알람이다.
 *   (그래도 페이지 안의 1초 간격 `sleep` 은 늦춰질 수 있어서, 크롬을
 *    `--disable-background-timer-throttling` 으로 띄운다 — autostart.ps1. 회피 플래그가 아니라 크롬 자체 옵션이다)
 *
 * ── 클랜 명단
 *   사이트(`/api/leagues/nolink/clans`)에서 6시간마다 받아 저장한다. 못 받으면 `clans.js` 의 예비 명단을 쓴다.
 */

const TAB_URL = 'https://barracks.sa.nexon.com/#sacloud-autocollect'
const ALARM_TICK = 'sacloud-tick'
const ALARM_CLANS = 'sacloud-clans'
const SITE = 'https://3rdcloud.my'
const DEFAULT_INTERVAL_MIN = 15

async function getConfig() {
  const c = await chrome.storage.local.get(['intervalMin', 'clans', 'clansUpdatedAt'])
  return { intervalMin: Number(c.intervalMin) || DEFAULT_INTERVAL_MIN, clans: c.clans ?? null, clansUpdatedAt: c.clansUpdatedAt ?? null }
}

async function schedule() {
  const { intervalMin } = await getConfig()
  await chrome.alarms.create(ALARM_TICK, { delayInMinutes: 1, periodInMinutes: Math.max(5, intervalMin) })
  await chrome.alarms.create(ALARM_CLANS, { delayInMinutes: 0.2, periodInMinutes: 360 })
}

/** 수집 탭을 찾는다. 없으면 **고정 탭**으로 연다 (활성화하지 않는다 — 사장님 화면을 뺏지 않는다) */
async function ensureTab() {
  const tabs = await chrome.tabs.query({ url: 'https://barracks.sa.nexon.com/*' })
  const mine = tabs.find((t) => (t.url ?? '').includes('#sacloud-autocollect'))
  if (mine) return { tab: mine, created: false }
  const tab = await chrome.tabs.create({ url: TAB_URL, pinned: true, active: false })
  return { tab, created: true }
}

async function tick(reason) {
  const { tab, created } = await ensureTab()
  if (created) {
    // 새로 연 탭은 로드되면서 스스로 첫 바퀴를 돈다 (autocollect.js). 지금 메시지를 보내면 아직 못 받는다
    await setBadge('…', '#888')
    return
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'tick', reason })
  } catch {
    // 콘텐츠 스크립트가 없다(탭이 버려졌거나 아주 오래된 로드) → 다시 로드하면 스스로 돈다
    await chrome.tabs.reload(tab.id)
  }
}

/** 사이트에서 IPL 클랜 slug 명단을 받는다. 커서 페이지를 끝까지 넘긴다 (최대 10쪽) */
async function refreshClans() {
  const slugs = []
  let cursor = null
  for (let page = 0; page < 10; page += 1) {
    const url = `${SITE}/api/leagues/nolink/clans${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    // 응답 모양: { message, data: [...], metadata: { cursor: { next, prev } } } (apps/web/lib/server/respond.ts okPage)
    const items = Array.isArray(json.data) ? json.data : (json.items ?? json.data?.items ?? [])
    for (const it of items) {
      const slug = it?.clan?.slug
      if (slug && !slugs.includes(slug)) slugs.push(slug)
    }
    const c = json.metadata?.cursor ?? json.cursor ?? null
    const next = c?.next ?? c?.next_cursor ?? null
    if (!next || items.length === 0) break
    cursor = next
  }
  if (slugs.length === 0) throw new Error('명단이 비었다')
  await chrome.storage.local.set({ clans: slugs, clansUpdatedAt: new Date().toISOString() })
  return slugs
}

async function setBadge(text, color) {
  try {
    await chrome.action.setBadgeText({ text })
    await chrome.action.setBadgeBackgroundColor({ color })
  } catch {
    /* 배지는 덤이다 */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  schedule()
})
chrome.runtime.onStartup.addListener(() => {
  schedule()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_TICK) {
    await tick('alarm')
  } else if (alarm.name === ALARM_CLANS) {
    try {
      const slugs = await refreshClans()
      console.info(`[sw] 클랜 명단 ${slugs.length}곳 갱신`)
    } catch (error) {
      console.warn(`[sw] 클랜 명단을 못 받았다 — 저장된/예비 명단을 쓴다: ${error?.message ?? error}`)
    }
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  ;(async () => {
    if (msg?.type === 'status') {
      const s = msg.status ?? {}
      await chrome.storage.local.set({ lastStatus: s })
      if (s.phase === 'running') await setBadge('…', '#888')
      else if (s.error) await setBadge('ERR', '#d92b2b')
      else await setBadge(s.newMatches > 0 ? String(Math.min(999, s.newMatches)) : 'OK', '#2e7d32')
      reply({ ok: true })
    } else if (msg?.type === 'run-now') {
      await tick('manual')
      reply({ ok: true })
    } else if (msg?.type === 'open-tab') {
      const { tab } = await ensureTab()
      await chrome.tabs.update(tab.id, { active: true })
      reply({ ok: true, tabId: tab.id })
    } else if (msg?.type === 'reschedule') {
      await schedule()
      reply({ ok: true })
    } else if (msg?.type === 'refresh-clans') {
      try {
        const slugs = await refreshClans()
        reply({ ok: true, count: slugs.length })
      } catch (error) {
        reply({ ok: false, error: String(error?.message ?? error) })
      }
    } else {
      reply({ ok: false })
    }
  })()
  return true
})

// 워커가 다시 깨어날 때마다 알람이 살아 있는지 확인한다 (알람은 원래 남지만, 확실히 해 둔다)
chrome.alarms.get(ALARM_TICK).then((a) => {
  if (!a) schedule()
})
