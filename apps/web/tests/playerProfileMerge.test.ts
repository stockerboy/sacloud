/**
 * **합친 경로가 옛 두 경로와 한 글자도 다르지 않은가** (O-034 · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 ══
 *
 * 선수 화면이 요청을 **둘** 쏘고 있었다 — `playerShow` + `playerLeagues`.
 * 공개일에 천 명이 각자 다른 닉을 치면 서로 다른 캐시 키가 수천 개이고
 * **전부 첫 방문이라 전부 DB 로 간다.** 그때 요청이 둘이면 **접속 자리를 두 번 잡는다.**
 * 자리는 5개다. 그래서 하나로 합쳤다.
 *
 * ⚠ **이 판에서 제일 위험한 곳은 「값이 줄어드는 것」이다.**
 *   합치는 것이지 빼는 것이 아니다. 그래서 여기서 **두 응답을 그대로 대조**한다.
 *   다음에 누가 한쪽만 고치면 **여기서 먼저 깨진다.**
 *
 * ⚠ 옛 두 경로는 **그대로 산다** (`CLAUDE.md` 10-4). 그것도 여기서 지킨다 —
 *   둘 중 하나가 사라지면 이 테스트가 못 돈다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { buildPath, endpoints, type EndpointKey } from '@sacloud/contract'

/* 다른 서버 의존 테스트와 **같은 변수**를 쓴다 (`apiContract.test.ts` 23행).
   `lib/api` 의 `apiGet` 은 쓸 수 없다 — 브라우저용이라 base 가 `/api` 상대경로다 */
const BASE = process.env.API_TEST_BASE_URL ?? 'http://127.0.0.1:3000/api'

/** 계약으로 검사하고 `data` 를 돌려준다 */
async function get<K extends EndpointKey>(key: K, params: Record<string, string> = {}) {
  const endpoint = endpoints[key]
  const response = await fetch(`${BASE}${buildPath(endpoint.path, params)}`)
  expect(response.status, `${key} 가 200이 아니다`).toBe(200)
  const parsed = endpoint.response.safeParse(await response.json())
  expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
  return (parsed as { data: { data: unknown } }).data.data
}

/**
 * 로컬 개발 서버가 없으면 이 파일은 통째로 건너뛴다 (다른 서버 의존 테스트와 같은 방식).
 *
 * ⚠ 2026-09-03 — **건너뛰지 못하고 빨간 줄이 났다.** 서버가 없을 때
 *   `fetch` 가 **바로 실패하지 않고 매달려서** `beforeAll` 이 시간 초과로 터졌다.
 *   `catch` 는 멀쩡했는데 `catch` 까지 못 간 것이다.
 *   → **2초를 넘기면 스스로 끊는다.** 그래야 `catch` 가 제 일을 한다.
 */
const REACH_TIMEOUT_MS = 2_000
let alive = false
let playerId = ''

beforeAll(async () => {
  try {
    const health = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(REACH_TIMEOUT_MS),
    })
    alive = health.ok
    if (!alive) return
    /* 어느 선수든 상관없다 — **랭킹 1위**를 쓰면 언제나 존재한다 */
    const rank = await fetch(`${BASE}/leagues/supply/ranks/players?weapon=all`, {
      signal: AbortSignal.timeout(REACH_TIMEOUT_MS),
    })
    const body = (await rank.json()) as { data?: { player?: { id?: string } }[] }
    playerId = body.data?.[0]?.player?.id ?? ''
    if (!playerId) alive = false
  } catch {
    alive = false
  }
})

describe('선수 프로필 — 합친 경로 (O-034)', () => {
  it('★기본정보가 옛 경로와 완전히 같다★', async () => {
    if (!alive) return
    const [old, merged] = await Promise.all([
      get('playerShow', { playerId }),
      get('playerProfile', { playerId }),
    ])
    expect((merged as { player: unknown }).player).toEqual(old)
  })

  it('★참여중인 리그가 옛 경로와 완전히 같다★', async () => {
    if (!alive) return
    const [old, merged] = await Promise.all([
      get('playerLeagues', { playerId }),
      get('playerProfile', { playerId }),
    ])
    const leagues = (merged as { leagues: unknown[] }).leagues
    expect(leagues).toEqual(old)
    /* 개수까지 따로 못 박는다 — `toEqual` 이 이미 보지만, 깨졌을 때 이 줄이 먼저 말해 준다 */
    expect(leagues.length).toBe((old as unknown[]).length)
  })

  it('없는 선수는 404 다 (기본정보 쪽 판정을 따른다)', async () => {
    if (!alive) return
    const response = await fetch(`${BASE}/players/NO-SUCH-PLAYER-o034/profile`)
    expect(response.status).toBe(404)
  })
})
