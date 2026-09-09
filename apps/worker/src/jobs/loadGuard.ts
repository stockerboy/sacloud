/**
 * **사이트를 굶기지 않는다** — 수집이 도는 동안 부하를 보고 물러난다 (O-051 · O-017 조건).
 *
 * ══ 왜 필요한가 ══
 *
 * O-017 은 ★사람이 보는 앞에서★ 단계를 밟는다. ★O-051 은 사람이 없다.★
 * 15분마다 스스로 돌기 때문에 ★물러나는 기준이 유일한 안전장치다.★
 * 없으면 밤새 굶긴다.
 *
 * ══ ★★`checks.db` 만 본다★★ ══
 *
 * ⚠ ★최상위 `status` 를 보면 안 된다.★ 그건 ★지금도 `degraded`★ 다
 *   (넥슨 수집을 세워 둔 상태라 `collector` 가 낡아 있다 — 그게 정상이다).
 *   ★최상위를 보면 수집이 시작하자마자 자기 때문에 물러난다.★
 *
 * ══ 기준 (O-017 그대로) ══
 * ```
 * 기준선          ★0.39초★
 * 1.5초 연속 2회  → ★한 사이클 쉰다★
 * 3초 초과        → ★이 판을 끝낸다★
 * db 가 ok 아님   → 끝낸다
 * 200 이 아님     → 끝낸다
 * ```
 * ⚠ ★연속으로 물러난 횟수를 센다.★ 3회면 체인을 끊고 알린다 —
 *   한 판만 보면 「이번엔 무거웠네」로 넘어가고 ★밤새 그러고 있는 걸 아무도 모른다.★
 *
 * ══ ★★무엇을 재는지 틀렸던 적이 있다★★ ══
 *
 * 처음에는 `spawn()` 부터 `close` 까지를 쟀다. 그랬더니 ★4,340ms★ 가 나와
 * ★수집이 시작조차 못 했다.★ 그런데 같은 순간 `curl` 로 다섯 번 재 보니 —
 * ```
 * 0.61 · 0.61 · 0.64 · 0.32 · 0.34 초   ← ★기준선 0.39초와 맞는다★
 * ```
 * ★사이트가 아니라 「curl 프로세스를 띄우는 시간」을 재고 있었다.★
 * 이 PC 는 보안 드라이버(i-Defense3)가 붙어 있어 프로세스 기동이 특히 무겁다.
 *
 * ★그래서 curl 자신이 잰 `%{time_total}` 을 쓴다.★ 프로세스 기동은 그 안에 안 들어간다.
 * ⚠ ★「무엇 위에서 재는가」를 안 보면 계기가 거짓말을 한다.★
 *
 * ══ ★★그리고 첫 요청은 언제나 느리다 — 콜드스타트다★★ ══
 *
 * 고친 뒤에도 ★3,520ms★ 가 나왔다. 갈라 재 보니 —
 * ```
 * 1회  총 ★3.660s★  (DNS 0.055 · 연결 0.063 · TLS 0.099 · ★첫바이트 3.659★)
 * 2회  총 0.373s    3회 0.348s   4회 0.327s   5회 0.342s
 * ```
 * ★느린 곳이 「첫바이트」다.★ 연결도 TLS 도 아니다 — ★서버가 잠들어 있다가 깨는 시간★ 이다
 * (서버리스 + 풀러). ★사이트가 무거운 게 아니다.★
 *
 * ⚠ ★15분마다 도는 잡은 매번 콜드다.★ 첫 값을 그대로 믿으면
 *   ★영원히 시작조차 못 한다.★ 그래서 ★느리게 나오면 한 번 더 잰다★ —
 *   두 번째가 빠르면 그건 깨우는 시간이었지 부하가 아니다.
 *   ★O-017 의 기준선 0.39초도 「따뜻한 상태」의 값이다★ (위 2~5회와 일치한다).
 */
import { spawn } from 'node:child_process'

/** O-017 이 잰 기준선 */
export const BASELINE_MS = 390
/** 이 위로 연속 두 번이면 한 사이클 쉰다 */
export const PAUSE_MS = 1500
/**
 * 이 위면 즉시 끝낸다.
 *
 * ── ★2026-09-10 — 3000 → 6000 으로 올렸다★ (사장님 «명단도 동시에 같이 들어와야해»)
 *
 *   3000 은 ★Vercel 이 깨어나는 시간과 겹쳤다.★ 새벽에 실측한 값이다:
 *   ```
 *   00:30  3475ms   → 「시작 전부터 무겁다」 · 한 바퀴 통째로 건너뜀
 *   00:50  3088ms   → 같음
 *   01:00  3922ms → 1966ms  → 세 번째에 겨우 통과
 *   ```
 *   ★같은 시각 노트북에서 두 번째 요청은 0.31초였다.★ 사이트는 멀쩡했다.
 *   그런데 새벽에는 우리 수집기 말고 아무도 안 들어오니 ★매번 콜드★ 다.
 *   결과: ★1시간 10분 동안 새 경기가 한 건도 안 들어왔다.★
 *
 *   ⚠ ★보호를 없앤 것이 아니다.★ 6초는 여전히 기준선(0.39초)의 15배다.
 *     진짜로 무거우면 6초를 넘긴다 — 실제 장애 때 10,003ms 를 봤다 (같은 날 23:26).
 *   ⚠ 옛 값이 필요하면 `STOP_MS_V1` 이 그대로 있다 (`CLAUDE.md` 1-4).
 */
export const STOP_MS = 6000
/** ★옛 값★ — 2026-09-10 이전. 지우지 않는다 */
export const STOP_MS_V1 = 3000
/** 이만큼 연속으로 물러나면 체인을 끊는다 */
export const RETREAT_STREAK_LIMIT = 3
/** ★느리게 나오면 이만큼 쉬고 한 번 더 잰다★ — 콜드스타트를 부하로 오판하지 않는다 */
export const COLD_RETRY_WAIT_MS = 1200
/**
 * ★health 를 재는 데 주는 시간★ (2026-09-10).
 *
 * ── 왜 10초로는 모자랐나
 *   ★10초는 「못 쟀다」로 떨어졌다.★ `measureOnce` 는 못 재면 ★모르는 것★ 으로 보고
 *   바로 물러난다 — 그 규칙 자체는 맞다. 문제는 ★깨우는 데 10초가 걸릴 때가 있다★ 는 것이다.
 *
 *   운영 실측 (2026-09-10 새벽):
 *   ```
 *   checks.db 10002ms — db=모름   → 「사이트가 무겁다」 · ★목록을 10곳에서 끊었다★
 *   ```
 *   그 바퀴는 클랜 120곳을 물어보려다 ★10곳만★ 물어봤다. 새 경기를 그만큼 못 찾는다.
 *   같은 시각 두 번째 요청은 0.3~0.5초였다 — ★사이트는 멀쩡했다.★
 *
 * ── 20초로 올린 이유
 *   ★깨우는 시간(최대 4초)의 다섯 배★ 다. 진짜로 20초를 넘기면 그건 장애가 맞다.
 *   ⚠ ★판정 기준(`STOP_MS` 6초)은 안 건드렸다.★ 재는 시간만 늘렸다 —
 *     8초가 걸리면 이제 「못 쟀다」가 아니라 ★「8초다」로 재고 그 값으로 물러난다.★
 *     ★모르고 물러나는 것과 알고 물러나는 것은 다르다.★
 */
export const MEASURE_TIMEOUT_S = 20

export type Verdict = 'go' | 'pause' | 'stop'

export interface GuardState {
  /** 연속으로 `PAUSE_MS` 를 넘긴 횟수 */
  slowStreak: number
  /** 연속으로 물러난 횟수 (판 단위) */
  retreatStreak: number
  /** 마지막으로 잰 `checks.db` 응답시간(ms) */
  lastMs: number | null
  /** 마지막으로 본 `checks.db.status` */
  lastDbStatus: string | null
  /** ★첫 번째가 느렸는데 두 번째가 빨랐을 때 그 첫 값★ — 콜드스타트였다는 증거 */
  coldFirstMs?: number
}

export function newGuardState(): GuardState {
  return { slowStreak: 0, retreatStreak: 0, lastMs: null, lastDbStatus: null }
}

interface HealthShape {
  checks?: { db?: { status?: string; detail?: string } }
}

/**
 * `/api/health` 를 한 번 재고 판정한다.
 *
 * ⚠ ★`curl` 로 잰다★ — 우리 사이트라 Node 로도 되지만,
 *   ★수집이 쓰는 것과 같은 도구로 재야★ 「수집은 되는데 재기만 실패」가 안 생긴다.
 */
async function measureOnce(healthUrl: string, state: GuardState): Promise<Verdict> {
  /* `status` · `body` · `ms` 는 아래 `try` 가 성공해야 생긴다 —
     ★미리 0 · '' 로 채워 두면 「못 쟀는데 0ms 였다」로 읽힌다★ */
  let measured: { status: number; body: string; ms: number }
  try {
    measured = await new Promise<{ status: number; body: string; ms: number }>((resolve, reject) => {
      const child = spawn(
        'curl',
        [
          '-sS',
          '--max-time',
          String(MEASURE_TIMEOUT_S),
          '-w',
          '\\n__M__%{http_code} %{time_total}',
          healthUrl,
        ],
        { windowsHide: true },
      )
      let out = ''
      child.stdout.on('data', (c: Buffer) => {
        out += c.toString('utf8')
      })
      child.on('error', reject)
      child.on('close', () => {
        const at = out.lastIndexOf('\n__M__')
        if (at < 0) {
          reject(new Error('상태를 못 읽었다'))
          return
        }
        const [code, secs] = out.slice(at + 6).trim().split(/\s+/)
        resolve({
          status: Number(code),
          body: out.slice(0, at),
          ms: Math.round(Number(secs) * 1000),
        })
      })
    })
  } catch {
    /* 못 재면 ★모르는 것★ 이다. 모르면서 계속 두드리지 않는다 */
    state.retreatStreak += 1
    state.lastMs = null
    state.lastDbStatus = null
    return 'stop'
  }

  /** ★curl 자신이 잰 시간(ms)★ — 프로세스 기동 시간이 안 섞인다 */
  const { status, body, ms } = measured
  state.lastMs = ms

  if (status !== 200) {
    state.retreatStreak += 1
    state.lastDbStatus = null
    return 'stop'
  }

  const dbStatus = ((): string | null => {
    try {
      return (JSON.parse(body) as HealthShape).checks?.db?.status ?? null
    } catch {
      /* ★JSON 이 아니면 「모른다」다★ — 「나쁘다」가 아니다. 부르는 쪽이 한 번 더 잰다 */
      return null
    }
  })()
  state.lastDbStatus = dbStatus

  /* ★`checks.db` 만 본다★ — 최상위 status 는 지금도 degraded 다 */
  if (dbStatus !== 'ok') {
    state.retreatStreak += 1
    return 'stop'
  }

  if (ms > STOP_MS) {
    state.retreatStreak += 1
    state.slowStreak = 0
    return 'stop'
  }
  if (ms > PAUSE_MS) {
    state.slowStreak += 1
    if (state.slowStreak >= 2) {
      state.slowStreak = 0
      return 'pause'
    }
    return 'go'
  }

  /* 멀쩡하면 연속 횟수를 푼다 */
  state.slowStreak = 0
  state.retreatStreak = 0
  return 'go'
}

/**
 * 부하를 보고 판정한다.
 *
 * ⚠ ★느리다고 바로 물러나지 않는다.★ 첫 요청은 ★깨우는 시간★ 일 수 있다 (위 설명).
 *   한 번 쉬고 다시 재서 ★두 번째 값으로 판정한다.★
 *   `db` 가 ok 가 아니거나 200 이 아니면 ★그건 다시 재도 같으니 바로 물러난다.★
 */
export async function checkLoad(healthUrl: string, state: GuardState): Promise<Verdict> {
  const first = await measureOnce(healthUrl, state)
  if (first === 'go') return first

  /*
   * ⚠ ★★2026-09-04 · 밤샘 한 판을 이것 때문에 날렸다★★
   *
   * 190건을 받고 있던 중에 이 한 줄이 나왔다 —
   * ```
   * checks.db ★14ms★ — 기준선 390ms 의 ★0.04배★ · db=★모름★  → 판 종료 → 밤 전체 종료
   * ```
   * ★14ms 는 사이트가 무거운 게 아니다.★ 서울에서 왕복 390ms 걸리는 곳이
   * 14ms 에 답할 리가 없다 — ★요청이 나가지도 못하고 이 PC 안에서 끊긴 것★ 이다
   * (i-Defense3 가 소켓을 깬다 · `kingsnet-tdi-breaks-sockets`).
   * 바로 앞뒤 요청은 288ms · 287ms 로 멀쩡했다. ★한 번 튄 것이었다.★
   *
   * 옛 코드는 ★「db 가 ok 가 아니면 다시 재도 같다」★ 고 보고 즉시 물러났다.
   * ★그 전제가 틀렸다★ — 끊김은 다시 재면 낫는다. ★그래서 무엇 때문이든 한 번 더 잰다.★
   * ★두 번 연속으로 나빠야 진짜다.★ (옛 방식은 아래 `checkLoadSlowOnly` 로 남긴다 · 1-4)
   */
  const cold = state.lastMs
  await new Promise((r) => setTimeout(r, COLD_RETRY_WAIT_MS))
  const second = await measureOnce(healthUrl, state)
  if (second === 'go' && cold !== null && state.lastMs !== null) {
    /* ★깨우는 시간이었다는 것을 남긴다★ — 「그냥 괜찮았다」로 넘기지 않는다 */
    state.coldFirstMs = cold
    return second
  }

  /*
   * ★한 번 더 재 본다★ (2026-09-10 · 새벽에 수집이 통째로 안 돌아서 찾았다).
   *
   * Vercel 함수는 사람이 안 들어오면 잠든다. 새벽에는 ★두 번 연속으로 깨우는 시간이
   * 나올 수 있다★ — 기다리는 1.2초 사이에 다시 잠들기도 한다.
   *
   * 실측 (2026-09-10 00:30 · 운영 VPS):
   * ```
   * 첫 번째 3475ms · 두 번째도 느림  →  「시작 전부터 무겁다」로 ★한 바퀴를 통째로 건너뜀★
   * 같은 시각 노트북에서: 첫 번째 3.5초 → 두 번째 ★0.31초★  →  사이트는 멀쩡했다
   * ```
   * ★깨우는 시간은 부하가 아니다.★ 그래서 세 번째까지 본다.
   *
   * ⚠ ★무한히 다시 재지 않는다.★ 세 번이면 끝이다 — 그래도 느리면 진짜로 무거운 것이다.
   * ⚠ `db` 가 ok 가 아니거나 200 이 아니면 위에서 이미 돌아갔다 —
   *   여기까지 오는 것은 ★느린 것뿐★ 이다.
   * ⚠ 옛 방식(두 번만 재기)은 `checkLoadSlowOnly` 에 그대로 있다 (`CLAUDE.md` 1-4).
   */
  if (state.lastDbStatus !== 'ok') return second
  const secondMs = state.lastMs
  await new Promise((r) => setTimeout(r, COLD_RETRY_WAIT_MS))
  const third = await measureOnce(healthUrl, state)
  if (third === 'go' && state.lastMs !== null) {
    state.coldFirstMs = cold ?? secondMs ?? undefined
  }
  return third
}

/**
 * ★옛 방식★ — 느릴 때만 다시 쟀다 (2026-09-04 이전). ★지우지 않고 남긴다★ (CLAUDE.md 1-4).
 *
 * ⚠ ★이걸 쓰면 순간 끊김 한 번에 판이 끝난다.★ 실제로 밤샘 한 판을 이걸로 날렸다.
 */
export async function checkLoadSlowOnly(healthUrl: string, state: GuardState): Promise<Verdict> {
  const first = await measureOnce(healthUrl, state)
  if (first === 'go') return first
  if (state.lastDbStatus !== 'ok') return first
  const cold = state.lastMs
  await new Promise((r) => setTimeout(r, COLD_RETRY_WAIT_MS))
  const second = await measureOnce(healthUrl, state)
  if (second === 'go' && cold !== null && state.lastMs !== null) state.coldFirstMs = cold
  return second
}

/** 사람에게 보일 한 줄 — ★「괜찮았다」가 아니라 숫자를 적는다★ */
export function guardLine(state: GuardState): string {
  const ms = state.lastMs
  if (ms === null) return '★health 를 못 쟀다★ (재려다 실패한 것이다 — 안 잰 것과 다르다)'
  const ratio = (ms / BASELINE_MS).toFixed(2)
  const mark = ms > STOP_MS ? '★★' : ms > PAUSE_MS ? '★' : ''
  /*
   * ★빠른데 못 읽은 것★ 과 ★느린 것★ 은 원인이 정반대다.
   *   느리다 = 사이트가 무겁다 → ★물러나는 게 맞다★
   *   빠른데 답이 없다 = ★요청이 나가지도 못했다★ (이 PC 쪽 끊김) → ★사이트 탓이 아니다★
   * 이 둘을 한 줄로 뭉뚱그렸더니 밤샘을 「사이트가 무겁다」로 끝냈다 (2026-09-04)
   */
  const localBlip = state.lastDbStatus !== 'ok' && ms < BASELINE_MS
  return (
    `${mark}checks.db ${ms}ms — 기준선 ${BASELINE_MS}ms 의 ${ratio}배${mark}` +
    ` · db=${state.lastDbStatus ?? '모름'}` +
    (localBlip
      ? ' · ★기준선보다 빠른데 답을 못 읽었다 = 이 PC 쪽 끊김이지 사이트 부하가 아니다★'
      : '') +
    (state.coldFirstMs !== undefined
      ? ` · ★첫 요청은 ${state.coldFirstMs}ms 였다 — 깨우는 시간이지 부하가 아니다★`
      : '') +
    (state.retreatStreak > 0 ? ` · ★연속 물러남 ${state.retreatStreak}회★` : '')
  )
}
