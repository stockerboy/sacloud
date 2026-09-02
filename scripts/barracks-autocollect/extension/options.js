/** 옵션 페이지 — 토큰·창구·주기를 `chrome.storage.local` 에 넣고, 마지막 상태를 보여 준다 */
const $ = (id) => document.getElementById(id)

function say(text, ok = true) {
  $('msg').textContent = text
  $('msg').className = ok ? 'hint ok' : 'hint err'
}

async function load() {
  const c = await chrome.storage.local.get(['ingestToken', 'ingestUrl', 'intervalMin', 'lastStatus', 'clans', 'clansUpdatedAt'])
  $('token').value = c.ingestToken ?? ''
  $('ingest').value = c.ingestUrl ?? 'https://3rdcloud.my/api/ingest/barracks'
  $('interval').value = c.intervalMin ?? 15
  $('status').textContent = c.lastStatus ? JSON.stringify(c.lastStatus, null, 2) : '(아직 없음)'
  $('clanInfo').textContent = Array.isArray(c.clans) ? `${c.clans.length}곳 (사이트에서 ${c.clansUpdatedAt ?? '?'} 에 받음)` : '예비 명단(43곳) 사용 중'
}

$('save').addEventListener('click', async () => {
  const intervalMin = Math.max(5, Number($('interval').value) || 15)
  await chrome.storage.local.set({
    ingestToken: $('token').value.trim(),
    ingestUrl: $('ingest').value.trim() || 'https://3rdcloud.my/api/ingest/barracks',
    intervalMin,
  })
  await chrome.runtime.sendMessage({ type: 'reschedule' }).catch(() => {})
  say('저장했다')
})

$('run').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'run-now' }).catch((e) => ({ ok: false, error: String(e) }))
  say(r?.ok ? '수집 탭에 「지금 한 바퀴」를 보냈다 — 잠시 뒤 아래 상태가 바뀐다' : `못 보냈다: ${r?.error ?? ''}`, Boolean(r?.ok))
})

$('open').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'open-tab' }).catch(() => {})
})

$('clans').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'refresh-clans' }).catch((e) => ({ ok: false, error: String(e) }))
  say(r?.ok ? `명단 ${r.count}곳 받았다` : `못 받았다: ${r?.error ?? ''} — 예비 명단으로 돈다`, Boolean(r?.ok))
  load()
})

chrome.storage.onChanged.addListener(() => load())
load()
