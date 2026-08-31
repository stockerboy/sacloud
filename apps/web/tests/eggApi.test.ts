import { describe, expect, it } from 'vitest'
import { EggBrokenList, endpoints } from '@sacloud/contract'

/**
 * 「알」 API 테스트 (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * 여기서 지키는 것
 *   1. **공개 목록은 식별자만 준다** — 사유(`reason`)·시각(`brokenAt`)이 새면 안 된다.
 *      관리자 강제로 깬 것인지 본인 인증으로 깬 것인지는 공개 정보가 아니다
 *   2. **관리자 API 는 로그인 없이 못 연다** — 목록도, 깨는 것도 (정책 22)
 *   3. **깨기 → 공개 목록에 뜬다 → 되잠금 → 사라진다** 가 실제로 돈다
 *   4. **되돌릴 수 있다** — 시험 삼아 깨 보고 원래대로 돌릴 수 있어야 한다
 *
 * 실행 조건은 `adminApi.test.ts` 와 같다. 서버가 없으면 조용히 통과시키지 않고 skip 한다.
 */

const BASE = process.env.API_TEST_BASE_URL ?? 'http://127.0.0.1:3000/api'

const ADMIN = {
  email: process.env.SACLOUD_TEST_ADMIN_EMAIL ?? '',
  password: process.env.SACLOUD_TEST_ADMIN_PASSWORD ?? '',
}
const hasAdmin = ADMIN.email !== '' && ADMIN.password !== ''

async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/infos`, { signal: AbortSignal.timeout(90_000) })
    return response.ok
  } catch {
    return false
  }
}

const up = await serverUp()

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

interface AdminEggRow {
  kind: 'clan' | 'player'
  id: string
  name: string
  broken: boolean
  reason: string | null
}

describe('알 계약', () => {
  it('공개 엔드포인트가 레지스트리에 있다', () => {
    /* 레지스트리에 없으면 MSW 핸들러가 생기지 않고 Mock 모드에서 실제 DB 를 부른다 */
    expect(endpoints.eggsBroken.path).toBe('/eggs/broken')
    expect(endpoints.eggsBroken.method).toBe('GET')
  })

  it('공개 스키마는 식별자만 담는다 — 사유는 담지 않는다', () => {
    const parsed = EggBrokenList.parse({ players: ['p1'], clans: ['c1'] })
    expect(parsed).toEqual({ players: ['p1'], clans: ['c1'] })
    expect(Object.keys(parsed).sort()).toEqual(['clans', 'players'])
  })
})

describe.skipIf(!up)('알 공개 조회', () => {
  it('로그인 없이 열리고, 계약 스키마대로 내려온다', async () => {
    const response = await fetch(`${BASE}/eggs/broken`)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: unknown }
    /* 파싱이 곧 검사다 — 형태가 어긋나면 여기서 던진다 */
    const data = EggBrokenList.parse(payload.data)
    expect(Array.isArray(data.players)).toBe(true)
    expect(Array.isArray(data.clans)).toBe(true)
  })

  it('사유·시각을 흘리지 않는다', async () => {
    const response = await fetch(`${BASE}/eggs/broken`)
    const text = await response.text()
    /* 「누가 왜 언제 깼는지」 는 관리자 것이다. 문자열로도 새면 안 된다 */
    expect(text).not.toContain('reason')
    expect(text).not.toContain('brokenAt')
    expect(text).not.toContain('brokenByUserId')
  })
})

describe.skipIf(!up)('알 관리자 API 권한', () => {
  it('로그인하지 않으면 목록이 막힌다', async () => {
    const response = await fetch(`${BASE}/admin/eggs?kind=clan`)
    expect(response.status).toBe(403)
  })

  it('로그인하지 않으면 깨지도 되잠그지도 못한다', async () => {
    for (const method of ['POST', 'DELETE']) {
      const response = await fetch(`${BASE}/admin/eggs/clan/anything`, { method })
      expect(response.status, `${method} 가 막히지 않았다`).toBe(403)
    }
  })
})

describe.skipIf(!up || !hasAdmin)('알 깨기 / 되돌리기', () => {
  it('깨면 공개 목록에 뜨고, 되잠그면 사라진다', async () => {
    const cookie = await adminCookie()

    const listResponse = await fetch(`${BASE}/admin/eggs?kind=clan`, { headers: { cookie } })
    expect(listResponse.status).toBe(200)
    const rows = ((await listResponse.json()) as { data: AdminEggRow[] }).data
    if (rows.length === 0) return /* 등록된 클랜이 없는 DB 면 검사할 것이 없다 */

    /* **원래 잠겨 있던 것**만 건드린다 — 인증으로 깨진 것을 시험 때문에 되잠그면 안 된다 */
    const target = rows.find((row) => !row.broken)
    if (!target) return

    const broke = await fetch(`${BASE}/admin/eggs/clan/${encodeURIComponent(target.id)}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ note: '테스트' }),
    })
    expect(broke.status).toBe(200)

    try {
      const after = EggBrokenList.parse(
        ((await (await fetch(`${BASE}/eggs/broken`)).json()) as { data: unknown }).data,
      )
      expect(after.clans, '깬 클랜이 공개 목록에 없다').toContain(target.id)

      const adminAfter = ((await (
        await fetch(`${BASE}/admin/eggs?kind=clan`, { headers: { cookie } })
      ).json()) as { data: AdminEggRow[] }).data
      const row = adminAfter.find((entry) => entry.id === target.id)
      expect(row?.broken).toBe(true)
      /* 관리자 강제는 «진짜 근거» 와 구분돼 남아야 한다 */
      expect(row?.reason).toBe('admin')
    } finally {
      /* 시험이 DB 를 더럽힌 채 끝나지 않게 한다 */
      const sealed = await fetch(`${BASE}/admin/eggs/clan/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: { cookie },
      })
      expect(sealed.status).toBe(200)
    }

    const restored = EggBrokenList.parse(
      ((await (await fetch(`${BASE}/eggs/broken`)).json()) as { data: unknown }).data,
    )
    expect(restored.clans, '되잠갔는데 공개 목록에 남아 있다').not.toContain(target.id)
  })

  it('없는 대상은 깰 수 없다 — 조용한 쓰레기를 만들지 않는다', async () => {
    const cookie = await adminCookie()
    const response = await fetch(`${BASE}/admin/eggs/clan/__그런클랜없다__`, {
      method: 'POST',
      headers: { cookie },
    })
    expect(response.status).toBe(400)
  })
})
