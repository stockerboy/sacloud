import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { endpoints, type EndpointDef } from '../endpoints'
import * as schemas from '../index'

/** `packages/contract/src/__tests__` → 저장소 뿌리까지 네 단계 */
const REPO = join(__dirname, '..', '..', '..', '..')

/**
 * `endpoints` 는 리터럴이라 **`request` 가 없는 항목에는 그 속성 자체가 없다.**
 * 타입 위에서는 그게 맞지만, 여기서는 **「달려 있나」를 묻는 것**이라 한 겹 넓혀 본다.
 */
const defOf = (key: keyof typeof endpoints): EndpointDef => endpoints[key] as EndpointDef

/**
 * **엔드포인트가 「받는 몸통」을 알고 있는가** (O-037 · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 — 같은 사고를 세 번 냈다 ══
 *
 * `EndpointDef` 에는 **응답만** 있었다. 「이 엔드포인트가 무슨 몸통을 받는가」를
 * **기계가 알 방법이 없었다.** 서버는 `XxxInput.safeParse()` 로 검사하지만
 * 그 스키마가 엔드포인트와 연결돼 있지 않았다.
 * ```
 * 가입       D-252 로 계약이 바뀌었는데 화면이 안 따라옴  → 100% 실패  (O-027)
 * 로그인     같은 병                                    → 100% 실패  (O-029)
 * 리그만들기  agreements 를 배열로 보냄                    → 100% 실패  (O-030)
 * ```
 * **세 번 다 「테스트는 초록인데 화면은 100% 실패」였다.**
 *
 * ══ 여기서 무엇을 지키나 ══
 *
 * **화면이 실제로 보내는 몸통**을 그 엔드포인트의 `request` 에 그대로 통과시킨다.
 * 계약이 바뀌었는데 화면이 안 따라오면 **여기서 먼저 깨진다.**
 *
 * ⚠ 몸통은 **손으로 적는다.** 화면 파일에서 긁어오지 않는다 —
 *   긁어오면 화면이 틀렸을 때 테스트도 같이 틀린다. **틀린 둘이 서로 맞다고 한다.**
 *
 * ⚠ 처음에는 **셋만** 달았다 (O-037 ④). 먼저 그 셋으로 **테스트가 실제로 잡는지**
 *   확인한 뒤 나머지를 달기로 했고, **2026-09-03 에 스무 개로 늘렸다.**
 *
 * ══ 무엇이 아직 안 달렸나 ══
 *
 * ```
 * ★몸통을 안 받는다★     authLogout · uploadsCreate · playerRenew · clanRenew
 *                       leagueClanDelete
 *                       → 라우트에 `safeParse` 가 아예 없다. 달면 거짓말이 된다
 * ★서버에 스키마가 없다★  게시판 4 · 댓글 4
 *                       → 라우트가 몸통을 **검사하지 않는다.** 스키마를 여기서
 *                         지어내면 「계약은 있는데 서버는 안 지키는」 더 나쁜 상태가 된다.
 *                         게시판·댓글은 지금 문이 닫혀 있다 (`featureDoors.ts`).
 *                         ★여는 판에서 서버에 먼저 스키마를 만들고 그때 단다★
 * ```
 */

/** 화면이 실제로 보내는 몸통 — 각 `page.tsx` 를 **읽고 손으로 옮긴 것** */
const SCREEN_BODIES: ReadonlyArray<{
  key: keyof typeof endpoints
  screen: string
  body: Record<string, unknown>
}> = [
  {
    key: 'authLogin',
    screen: 'apps/web/app/auth/login/page.tsx',
    body: { username: 'o029second', password: 'o029local!pw' },
  },
  {
    key: 'authSignup',
    screen: 'apps/web/app/auth/signup/page.tsx',
    body: {
      username: 'tester01',
      password: 'password1234',
      nickname: '테스터',
      captcha_token: 'mock',
    },
  },
  {
    key: 'leagueCreate',
    screen: 'apps/web/app/leagues/create/page.tsx',
    body: {
      name: '테스트',
      slug: 'testleague',
      division_count: 1,
      map_ids: ['cmt61pdo10000vltgeoimihql'],
      player_limits: [5],
      agreements: {
        no_paid_invitation: true,
        responsible_operation: true,
        accept_deletion_policy: true,
      },
      captcha_token: 'mock',
    },
  },
]

describe('엔드포인트의 `request` — 화면이 보내는 몸통이 통과하는가 (O-037)', () => {
  for (const { key, screen, body } of SCREEN_BODIES) {
    it(`★${key} — ${screen} 이 보내는 몸통이 계약을 만족한다★`, () => {
      const request = defOf(key).request
      expect(request, `${key} 에 request 가 안 달려 있다`).toBeDefined()
      const parsed = request!.safeParse(body)
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
    })
  }

  it('★몸통이 어긋나면 잡는다★', () => {
    /* 가입에서 `username` 을 빼면(= O-027 이 났던 그 상태) 반드시 깨져야 한다 */
    const { username: _drop, ...broken } = SCREEN_BODIES[1]!.body
    expect(defOf('authSignup').request!.safeParse(broken).success).toBe(false)

    /* 리그 만들기에서 `agreements` 를 배열로(= O-030 이 났던 그 상태) */
    expect(
      defOf('leagueCreate').request!.safeParse({
        ...SCREEN_BODIES[2]!.body,
        agreements: [true, true, true],
      }).success,
    ).toBe(false)
  })

  /**
   * ★계약에 달린 것이 **서버가 실제로 쓰는 그것**인가★
   *
   * ══ 왜 이 검사가 따로 필요한가 — 위 검사들이 가짜였다 ══
   *
   * 처음에는 위 두 검사만 두고 「이 테스트가 진짜인지 스스로 확인한다」고 적었다.
   * **그래서 일부러 어긋나게 해 봤다** — `authSignup` 에 `LoginInput` 을 달았다.
   * ```
   * 결과   ★5건 전부 통과★
   * 이유   `LoginInput` 은 `{username?, email?, password}` 라 가입 몸통도 만족한다.
   *        Zod 는 여분 키를 그냥 통과시킨다.
   * ```
   * **몸통만 던져 보는 검사로는 「엉뚱한 스키마가 달린 것」을 못 잡는다.**
   *
   * ══ 그래서 무엇을 보나 ══
   *
   * 서버 라우트가 `safeParse` 에 쓰는 스키마 이름을 **파일에서 읽어**,
   * 계약에 달린 `request` 가 **바로 그 객체인지**(`===`) 본다.
   * 이름이 같은 다른 스키마도, 이름이 다른 같은 모양도 통과 못 한다.
   *
   * > A — *「서버가 `safeParse` 에 쓰는 것을 **연결만** 한다.
   * >  둘이 갈라지면 **그게 다음 사고다**.」*
   */
  describe('★계약에 달린 것이 서버가 쓰는 그것인가★', () => {
    /** 엔드포인트 → 그 몸통을 검사하는 서버 라우트 */
    const ROUTES: ReadonlyArray<{ key: keyof typeof endpoints; route: string }> = [
      { key: 'authLogin', route: 'apps/web/app/api/auth/login/route.ts' },
      { key: 'authSignup', route: 'apps/web/app/api/auth/signup/route.ts' },
      { key: 'leagueCreate', route: 'apps/web/app/api/leagues/route.ts' },
      /* ── 2026-09-03 에 더 단 열일곱 (O-037) */
      { key: 'authToken', route: 'apps/web/app/api/auth/token/route.ts' },
      { key: 'authPasswordForget', route: 'apps/web/app/api/auth/password/forget/route.ts' },
      { key: 'authPasswordReset', route: 'apps/web/app/api/auth/password/reset/route.ts' },
      { key: 'authEmailVerify', route: 'apps/web/app/api/auth/email/verify/route.ts' },
      { key: 'meSettingUpdate', route: 'apps/web/app/api/me/setting/route.ts' },
      { key: 'mePasswordUpdate', route: 'apps/web/app/api/me/password/route.ts' },
      { key: 'meLinkUpdate', route: 'apps/web/app/api/me/link/route.ts' },
      {
        key: 'meTitleVerificationCheck',
        route: 'apps/web/app/api/me/title-verification/route.ts',
      },
      { key: 'playerSettingUpdate', route: 'apps/web/app/api/players/[playerId]/setting/route.ts' },
      { key: 'clanSettingUpdate', route: 'apps/web/app/api/clans/[clanSlug]/setting/route.ts' },
      {
        key: 'clanMasterClaimCreate',
        route: 'apps/web/app/api/clans/[clanSlug]/master-claim/route.ts',
      },
      { key: 'leagueClanLookup', route: 'apps/web/app/api/leagues/[league]/clan_lookup/route.ts' },
      { key: 'leagueInvite', route: 'apps/web/app/api/leagues/[league]/invitations/route.ts' },
      { key: 'leagueClanRegister', route: 'apps/web/app/api/leagues/[league]/clans/route.ts' },
      {
        key: 'leagueClanDivisionUpdate',
        route: 'apps/web/app/api/leagues/[league]/clans/[clan]/division/route.ts',
      },
      {
        key: 'leagueClanSuccession',
        route: 'apps/web/app/api/leagues/[league]/clans/[clan]/succession/route.ts',
      },
      { key: 'leagueClanExpel', route: 'apps/web/app/api/leagues/[league]/clans/[clan]/expel/route.ts' },
      { key: 'leagueContentUpdate', route: 'apps/web/app/api/leagues/[league]/content/route.ts' },
    ]

    for (const { key, route } of ROUTES) {
      it(`${key} — ${route} 가 쓰는 스키마와 같다`, () => {
        const src = readFileSync(join(REPO, route), 'utf8')
        const found = /([A-Z][A-Za-z0-9]*Input)\.safeParse/.exec(src)
        expect(found, `${route} 에서 safeParse 를 못 찾았다`).not.toBeNull()

        const name = found![1]!
        const fromContract = (schemas as Record<string, unknown>)[name]
        expect(fromContract, `계약에 ${name} 이 없다`).toBeDefined()
        /* ★객체 동일성★ — 모양이 비슷한 다른 스키마가 달려 있으면 여기서 걸린다 */
        expect(defOf(key).request).toBe(fromContract)
      })
    }
  })

  it('몸통을 안 받는 엔드포인트에는 `request` 가 없다', () => {
    /* GET 은 몸통이 없다. 달아 두면 「받는다」는 거짓말이 된다 */
    expect(defOf('playerProfile').request).toBeUndefined()
    expect(defOf('leagueMatches').request).toBeUndefined()

    /* 쓰기인데도 몸통을 안 받는 것들 — 라우트에 `safeParse` 가 없다 */
    for (const key of ['authLogout', 'uploadsCreate', 'playerRenew', 'clanRenew'] as const) {
      expect(defOf(key).request, `${key} 는 몸통을 안 받는다`).toBeUndefined()
    }
  })

  /**
   * ★게시판·댓글에는 아직 못 단다 — 그 사실을 여기에 못박는다★
   *
   * 서버 라우트가 몸통을 **검사하지 않는다.** 계약에만 스키마를 지어 붙이면
   * 「계약은 있는데 서버는 안 지킨다」가 되어 **지금보다 나쁘다.**
   * 이 검사는 **문을 열 때 빨간 줄로 알려 주려고** 있다 —
   * 서버에 스키마가 생기면 이 검사가 깨지고, 그때 `request` 를 단다.
   */
  it('게시판·댓글 라우트에는 아직 서버 스키마가 없다', () => {
    const routes = ['apps/web/app/api/boards/route.ts', 'apps/web/app/api/comments/route.ts']
    for (const route of routes) {
      const src = readFileSync(join(REPO, route), 'utf8')
      expect(
        /([A-Z][A-Za-z0-9]*Input)\.safeParse/.test(src),
        `${route} 에 스키마가 생겼다 — 이제 계약의 request 를 달 때다`,
      ).toBe(false)
    }
  })
})
