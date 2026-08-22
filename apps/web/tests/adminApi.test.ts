import { describe, expect, it } from 'vitest'

/**
 * 관리자 API 테스트 (Phase 10).
 *
 * 여기서 지키는 것
 *   1. **권한은 서버가 판정한다** — 로그인하지 않은 요청은 전부 403이어야 한다 (정책 22)
 *   2. 클랜·로스터·티어·부리그를 화면(=API)에서 직접 바꿀 수 있다
 *   3. 시즌 종료·시작은 **미리보기만** 돌린다. 실제로 실행하지 않는다 (정책 24 · 27)
 *
 * 실행 조건은 `apiContract.test.ts`와 같다 — 서버가 없으면 조용히 통과시키지 않고 skip한다.
 */

const BASE = process.env.API_TEST_BASE_URL ?? 'http://localhost:3000/api'
const ADMIN = { email: 'user001@naver.com', password: 'sacloud1234' }

async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/infos`, { signal: AbortSignal.timeout(90_000) })
    return response.ok
  } catch {
    return false
  }
}

const up = await serverUp()

/** 로그인해서 세션 쿠키를 얻는다 */
async function adminCookie(): Promise<string> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  })
  expect(response.status, '관리자 계정으로 로그인할 수 있어야 한다').toBe(200)
  const cookies = response.headers.getSetCookie?.() ?? []
  const session = cookies
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie) => cookie?.startsWith('sacloud_'))
    .join('; ')
  expect(session, '세션 쿠키가 내려와야 한다').not.toBe('')
  return session
}

async function asAdmin<T>(
  path: string,
  init?: { method?: string; body?: unknown; cookie?: string },
): Promise<{ status: number; data: T; message: string }> {
  const cookie = init?.cookie ?? (await adminCookie())
  const response = await fetch(`${BASE}/admin${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      cookie,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const payload = (await response.json()) as { message: string; data: T }
  return { status: response.status, data: payload.data, message: payload.message }
}

describe.skipIf(!up)('관리자 권한', () => {
  it('로그인하지 않으면 모든 관리자 API가 막힌다', async () => {
    const paths = [
      '/summary',
      '/clans',
      '/matches',
      '/seasons/officialmain',
      '/settings',
    ]
    for (const path of paths) {
      const response = await fetch(`${BASE}/admin${path}`)
      expect(response.status, `${path} 가 막히지 않았다`).toBe(403)
    }
  })

  it('변경 요청도 막힌다 (버튼을 감추는 것으로 막지 않는다)', async () => {
    const attempts: [string, string, unknown][] = [
      ['/clans', 'POST', { slug: 'hacked', name: '침입' }],
      ['/roster', 'POST', { leagueSlug: 'supply', clanSlug: 'x', playerId: 'y' }],
      ['/seasons/officialmain/close', 'POST', { confirm: true }],
      ['/seasons/officialmain/start', 'POST', { confirm: true }],
    ]
    for (const [path, method, body] of attempts) {
      const response = await fetch(`${BASE}/admin${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(response.status, `${path} 가 막히지 않았다`).toBe(403)
    }
  })

  it('관리자는 대시보드를 볼 수 있다', async () => {
    const result = await asAdmin<{
      summary: {
        activeSeasons: { league: string; number: number; mock: boolean }[]
        clans: { total: number }
        matches: { official: number; reference: number }
      }
    }>('/summary')
    expect(result.status).toBe(200)
    expect(result.data.summary.clans.total).toBeGreaterThan(0)
    // mock 리그와 실운영 리그를 구분해서 보여 준다 (정책 25)
    expect(Array.isArray(result.data.summary.activeSeasons)).toBe(true)
  })
})

describe.skipIf(!up)('클랜 관리', () => {
  const slug = 'admin-test-clan'

  it('클랜을 등록하고 이름·구분·티어·활성을 바꾼다', async () => {
    const cookie = await adminCookie()

    // 이전 실행에서 남았으면 비활성 상태일 수 있다. 등록은 한 번만 성공하면 된다
    await asAdmin('/clans', {
      method: 'POST',
      cookie,
      body: { slug, name: '테스트클랜', category: 'official' },
    })

    const renamed = await asAdmin<{ name: string }>(`/clans/${slug}`, {
      method: 'PATCH',
      cookie,
      body: { name: '테스트클랜2' },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.data.name).toBe('테스트클랜2')

    const tiered = await asAdmin<{ category: string; tier: number | null }>(`/clans/${slug}`, {
      method: 'PATCH',
      cookie,
      body: { category: 'independent', tier: 3 },
    })
    expect(tiered.data.category).toBe('independent')
    expect(tiered.data.tier).toBe(3)

    // 무소속 티어는 자동으로 바뀌지 않는다. 운영자가 정한 값 그대로다
    const retiered = await asAdmin<{ tier: number | null }>(`/clans/${slug}`, {
      method: 'PATCH',
      cookie,
      body: { tier: 2 },
    })
    expect(retiered.data.tier).toBe(2)

    const deactivated = await asAdmin<{ active: boolean }>(`/clans/${slug}`, {
      method: 'PATCH',
      cookie,
      body: { active: false },
    })
    expect(deactivated.data.active, '삭제 대신 비활성으로 처리한다').toBe(false)
  })

  it('티어 범위를 벗어나면 거부한다', async () => {
    const result = await asAdmin(`/clans/${slug}`, { method: 'PATCH', body: { tier: 9 } })
    expect(result.status).toBe(400)
  })

  /**
   * 부리그 변경은 **실운영 리그(`supply`)** 에서 확인한다.
   *
   * mock 리그(`officialmain`)에 테스트 클랜을 넣으면 `pnpm compare`의 mock↔live 대조가 깨진다.
   * 테스트가 시드 데이터를 오염시키면 안 된다.
   */
  it('부리그를 바꿀 수 있다 (래더 공식과 무관한 시즌 상태다)', async () => {
    const cookie = await adminCookie()
    const seasons = await asAdmin<{ leagueSlug: string }>('/seasons/supply', { cookie })
    if (seasons.status !== 200) return // 실운영 리그가 아직 없는 환경이면 건너뛴다

    await asAdmin('/clans', {
      method: 'POST',
      cookie,
      body: { slug: `${slug}-div`, name: '부리그테스트' },
    })
    const result = await asAdmin<{ division: number }>(`/clans/${slug}-div/division`, {
      method: 'PUT',
      cookie,
      body: { leagueSlug: 'supply', division: 2 },
    })
    expect(result.status).toBe(200)
    expect(result.data.division).toBe(2)
  })
})

describe.skipIf(!up)('로스터 관리', () => {
  it('선수를 추가하고 확인 상태를 바꾸고 종료할 수 있다', async () => {
    const cookie = await adminCookie()

    const clans = await asAdmin<{ slug: string; leagues: { league: string }[] }[]>(
      '/clans?query=UlsaN',
      { cookie },
    )
    const target = clans.data.find((clan) => clan.leagues.some((entry) => entry.league === 'supply'))
    if (!target) return // 실데이터 E2E를 아직 돌리지 않은 환경이면 건너뛴다

    const detail = await asAdmin<{
      leagueClans: { rosterMemberships: { id: string; verified: boolean }[] }[]
    }>(`/clans/${target.slug}`, { cookie })
    const membership = detail.data.leagueClans[0]?.rosterMemberships[0]
    expect(membership, '실데이터 E2E 로스터가 있어야 한다').toBeDefined()
    if (!membership) return

    const toggled = await asAdmin<{ verified: boolean }>('/roster', {
      method: 'PATCH',
      cookie,
      body: { membershipId: membership.id, verified: !membership.verified },
    })
    expect(toggled.status).toBe(200)
    expect(toggled.data.verified).toBe(!membership.verified)

    // 원래대로 돌려 둔다
    await asAdmin('/roster', {
      method: 'PATCH',
      cookie,
      body: { membershipId: membership.id, verified: membership.verified },
    })
  })
})

describe.skipIf(!up)('시즌 관리 — 미리보기만 한다', () => {
  it('시즌 현황을 볼 수 있다', async () => {
    const result = await asAdmin<{
      activeSeason: { number: number } | null
      seasons: { number: number; status: string }[]
    }>('/seasons/supply')
    expect(result.status).toBe(200)
    // 실운영 리그는 Season 7이 활성이어야 한다 (정책 7)
    expect(result.data.activeSeason?.number).toBe(7)
  })

  it('종료 미리보기는 실제로 닫지 않는다', async () => {
    const cookie = await adminCookie()
    const preview = await asAdmin<{ preview: { season: number }; executed: boolean }>(
      '/seasons/supply/close',
      { method: 'POST', cookie, body: { confirm: false } },
    )
    expect(preview.status).toBe(200)
    expect(preview.data.executed, '확인 없이 실행되면 안 된다').toBe(false)

    const after = await asAdmin<{ activeSeason: { number: number } | null }>('/seasons/supply', {
      cookie,
    })
    expect(after.data.activeSeason?.number, '미리보기 후에도 시즌이 열려 있어야 한다').toBe(7)
  })

  it('시작 미리보기는 활성 시즌이 있으면 거부한다 (종료 → 시작 순서를 강제한다)', async () => {
    const result = await asAdmin('/seasons/supply/start', {
      method: 'POST',
      body: { confirm: false },
    })
    expect(result.status).toBe(400)
    expect(result.message).toContain('열려 있습니다')
  })
})

describe.skipIf(!up)('경기 관리', () => {
  it('공식/참고 기록을 나눠서 조회할 수 있다', async () => {
    const cookie = await adminCookie()
    const reference = await asAdmin<{ official: boolean; origin: string }[]>(
      '/matches?official=false',
      { cookie },
    )
    expect(reference.status).toBe(200)
    expect(reference.data.every((row) => row.official === false)).toBe(true)

    const official = await asAdmin<{ official: boolean }[]>('/matches?official=true', { cookie })
    expect(official.data.every((row) => row.official === true)).toBe(true)
  })

  it('mock 경기는 origin으로 구분된다 (운영 데이터로 착각하지 않게)', async () => {
    const result = await asAdmin<{ origin: string }[]>('/matches', {})
    const origins = new Set(result.data.map((row) => row.origin))
    for (const origin of origins) {
      expect(['mock', 'nexon', 'sacloud', '3rd.supply']).toContain(origin)
    }
  })

  it('참고 기록을 공식으로 올리려면 근거가 필요하다', async () => {
    const cookie = await adminCookie()
    const reference = await asAdmin<{ id: string }[]>('/matches?official=false', { cookie })
    const target = reference.data[0]
    if (!target) return

    const denied = await asAdmin(`/matches/${target.id}`, {
      method: 'PATCH',
      cookie,
      body: { official: true },
    })
    expect(denied.status, '근거 없이 공식으로 바꿀 수 없다').toBe(400)
  })
})

describe.skipIf(up)('개발 서버가 없어 관리자 API 테스트를 건너뛴다', () => {
  it('서버를 띄우고 다시 실행하면 검증된다', () => {
    expect(up).toBe(false)
  })
})
