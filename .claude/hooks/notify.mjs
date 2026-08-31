#!/usr/bin/env node
/**
 * 폰 알림 훅 — 작업이 끝나거나 · 사용자 판단이 필요하거나 · 세션이 멈췄을 때 폰을 울린다.
 *
 * 2026-08-31 사용자 요청: *"작업이 끝나거나 내 판단이 필요하거나 세션이 멈췄을때
 * 폰에서 알림이 울리는 hook 만들어줘"*
 *
 * ── 어떻게 울리나
 *   `ntfy.sh` 로 보낸다. 계정도 키도 필요 없고, 폰에 ntfy 앱을 깔아 **토픽 이름만 구독**하면
 *   그 순간부터 알림이 온다. 토픽은 `notify.config.json` 에 있고 저장소에 올리지 않는다.
 *
 * ── 어떤 순간에 울리나 (`.claude/settings.json` 이 어느 훅에 물리는지 정한다)
 * ```
 *   Stop           한 턴이 끝났다 = 시킨 일이 끝났다
 *                  ⚠ 짧은 턴은 안 울린다. 대화 중에 매번 울리면 알림이 쓰레기가 된다
 *                     기본 120초 이상 걸린 턴만 (minTurnSeconds)
 *   Notification   Claude 가 사용자를 기다린다 — 권한을 묻거나, 입력 없이 멈춰 있거나
 *                  ⚠ 이건 **항상** 울린다. 이게 "판단이 필요하다" 와 "멈췄다" 둘 다다
 *   SessionEnd     세션이 닫혔다
 * ```
 *
 * ── 무엇을 보내나
 *   제목 한 줄 + 마지막 응답 앞부분(기본 160자).
 *   ⚠ **ntfy.sh 토픽은 이름만 알면 누구나 구독할 수 있다.** 토픽을 16자 난수로 만든 이유가
 *   그것이다. 그래도 내용이 밖으로 나가는 것이 걸리면 `includePreview: false` 로 끄면
 *   제목만 간다 (`notify.config.json`).
 *
 * ── 훅은 조용히 죽어야 한다
 *   알림이 실패해도 작업을 막으면 안 된다. 모든 오류를 삼키고 **항상 exit 0** 이다.
 *   무엇이 실패했는지는 `.claude/hooks/notify.log` 에만 남는다.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(HERE, 'notify.config.json')
const STATE_PATH = join(HERE, '.notify-state.json')
const LOG_PATH = join(HERE, 'notify.log')

/** 실패는 로그에만 남긴다. 화면에 찍으면 대화 흐름을 더럽힌다 */
function log(line) {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()}  ${line}\n`)
  } catch {
    /* 로그조차 못 써도 그냥 넘어간다 */
  }
}

function readJson(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
  } catch {
    return fallback
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * 마지막 어시스턴트 발언 앞부분을 뽑는다.
 *
 * 전사(transcript)는 JSONL 이고 **뒤에서부터** 읽는 것이 맞다 — 파일이 수십 MB 라
 * 통째로 파싱하면 훅이 느려진다. 그래서 끝의 일부만 읽는다.
 */
function lastAssistantText(transcriptPath, limit) {
  try {
    if (!transcriptPath || !existsSync(transcriptPath)) return ''
    const raw = readFileSync(transcriptPath, 'utf8')
    const tail = raw.length > 400_000 ? raw.slice(-400_000) : raw
    const lines = tail.split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let row
      try {
        row = JSON.parse(lines[i])
      } catch {
        continue /* 앞부분을 잘라 읽었으니 첫 줄이 깨져 있을 수 있다 */
      }
      if (row?.type !== 'assistant') continue
      const content = row?.message?.content
      if (!Array.isArray(content)) continue
      const text = content
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
      if (text) return text.slice(0, limit)
    }
  } catch (error) {
    log(`전사 읽기 실패: ${String(error).slice(0, 200)}`)
  }
  return ''
}

async function main() {
  const config = readJson(CONFIG_PATH, null)
  if (!config?.topic) {
    log('notify.config.json 에 topic 이 없다 — 알림을 보내지 않는다')
    return
  }
  if (config.enabled === false) return

  let hook = {}
  try {
    hook = JSON.parse((await readStdin()) || '{}')
  } catch (error) {
    log(`훅 입력 파싱 실패: ${String(error).slice(0, 200)}`)
  }

  const event = hook.hook_event_name ?? 'Unknown'
  const state = readJson(STATE_PATH, {})
  const now = Date.now()

  /* ── 언제 울릴지 결정한다 ─────────────────────────────────────────────── */

  const minTurnSeconds = Number(config.minTurnSeconds ?? 120)
  const minGapSeconds = Number(config.minGapSeconds ?? 30)

  /* 아래 분기는 전부 셋을 채우거나 return 한다 — 초기값을 두면 그 값이 죽은 대입이 된다 */
  let title
  let priority
  let tags

  if (event === 'Notification') {
    /* 권한을 묻거나, 입력 없이 멈춰 있다. **이건 항상 울린다** — 사용자가 기다려야 하는 순간이다 */
    title = 'Claude 가 기다리는 중'
    priority = '4'
    tags = 'warning'
  } else if (event === 'Stop') {
    /* 턴이 짧으면 대화 중이라는 뜻이다. 그때 울리면 알림이 쓰레기가 된다 */
    const startedAt = Number(state.turnStartedAt ?? 0)
    const elapsed = startedAt ? (now - startedAt) / 1000 : Number.POSITIVE_INFINITY
    if (elapsed < minTurnSeconds) {
      writeFileSync(STATE_PATH, JSON.stringify({ ...state, turnStartedAt: now }))
      return
    }
    title = `작업 끝 (${Math.round(elapsed / 60)}분)`
    priority = '3'
    tags = 'white_check_mark'
  } else if (event === 'SessionEnd') {
    title = '세션이 닫혔다'
    priority = '3'
    tags = 'octagonal_sign'
  } else if (event === 'UserPromptSubmit') {
    /* 턴 시작 시각만 기록하고 조용히 끝낸다 — 위 `Stop` 이 이 값을 쓴다 */
    writeFileSync(STATE_PATH, JSON.stringify({ ...state, turnStartedAt: now }))
    return
  } else {
    return
  }

  /* 같은 알림이 연달아 쏟아지지 않게 한다 */
  const lastAt = Number(state.lastNotifyAt ?? 0)
  if (event !== 'Notification' && now - lastAt < minGapSeconds * 1000) return

  /* ── 내용 ─────────────────────────────────────────────────────────────── */

  const limit = Number(config.previewChars ?? 160)
  let body = ''
  if (config.includePreview !== false) {
    body = event === 'Notification' ? String(hook.message ?? '') : lastAssistantText(hook.transcript_path, limit)
  }
  if (!body) body = event === 'Notification' ? '입력을 기다린다' : '끝났다'

  /* ── 보낸다 ───────────────────────────────────────────────────────────── */

  /*
    ⚠ **본문+헤더 방식으로 보내지 마라.** HTTP 헤더는 ASCII 라 `Title:` 에 한글을 넣으면
    깨진다. base64 로 넣어도 ntfy 는 그대로 **base64 문자열을 제목으로 보여 준다**
    (2026-08-31 실측 — 제목이 `Q2xhdWRlIOqwgCDquLDri6TrpqzripQg7KSR` 로 떴다).
    JSON 한 덩어리로 보내면 제목도 본문도 UTF-8 그대로 간다.
  */
  const server = config.server ?? 'https://ntfy.sh'
  const json = JSON.stringify({
    topic: config.topic,
    title,
    message: body.slice(0, 1200),
    priority: Number(priority),
    tags: tags ? [tags] : undefined,
  })

  let sent = await sendWithFetch(server, json)
  if (!sent) {
    /*
      ⚠ **이 기계에서 Node 의 `fetch` 는 간헐적으로 죽는다** — 세 번 중 한 번꼴로
      `TypeError: fetch failed` 다 (2026-08-31 실측). 같은 순간 `curl` 은 멀쩡히 간다.
      D-187 에 적힌 이 PC 의 Winsock 문제와 같은 뿌리로 보인다.
      알림은 실패하면 안 되는 것이라 **후퇴 경로를 둔다.**
    */
    sent = sendWithCurl(server, json)
    if (sent) log('fetch 실패 → curl 로 보냈다')
  }

  if (sent) writeFileSync(STATE_PATH, JSON.stringify({ ...state, lastNotifyAt: now, turnStartedAt: now }))
}

async function sendWithFetch(server, json) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      signal: controller.signal,
    })
    if (!res.ok) {
      log(`ntfy 응답 ${res.status}`)
      return false
    }
    return true
  } catch (error) {
    log(`fetch 실패: ${String(error).slice(0, 160)}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}

function sendWithCurl(server, json) {
  try {
    const out = spawnSync(
      'curl',
      ['-s', '--max-time', '10', '-o', devNull(), '-w', '%{http_code}', '-X', 'POST', server, '-H', 'Content-Type: application/json', '--data-binary', '@-'],
      { input: json, encoding: 'utf8' },
    )
    const code = String(out.stdout ?? '').trim()
    if (code === '200') return true
    log(`curl 도 실패 (code=${code || 'none'} status=${out.status})`)
    return false
  } catch (error) {
    log(`curl 실행 실패: ${String(error).slice(0, 160)}`)
    return false
  }
}

/** Windows 에서는 `/dev/null` 이 없다 */
function devNull() {
  return process.platform === 'win32' ? 'NUL' : '/dev/null'
}

/* 훅은 무슨 일이 있어도 작업을 막지 않는다. 항상 exit 0 */
main()
  .catch((error) => log(`예상 못 한 오류: ${String(error).slice(0, 300)}`))
  .finally(() => process.exit(0))
