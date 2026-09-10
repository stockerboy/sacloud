import 'server-only'
import { QueryClient, dehydrate } from '@tanstack/react-query'
import { getLeague, getLeagueClans } from '@/lib/server/queries/leagues'

/**
 * ★첫 화면을 서버에서 그린다★ (2026-09-10 · `docs/ORDERS.md` 대기 칸 「폰 첫 화면 서버 렌더」).
 *
 * ── ★무엇이 문제였나★
 *   폰으로 들어오면 ★2~4초 동안 빈 화면★ 이었다. 실측 —
 *   ```
 *   운영 /league/nolink/rank/clan  HTML 37,602 바이트  ← 클랜 이름 ★0개★
 *   ```
 *   껍데기만 캐시돼 있고(O-016) ★알맹이는 브라우저가 다시 물어봤다.★
 *   폰에서 그 왕복이 몇 초다. 그동안 사장님이 보시는 건 빈 화면이다.
 *
 * ── ★어떻게 고치나 — 껍데기를 되돌리지 않는다★
 *   O-016 이 껍데기를 굳힌 까닭(«방문마다 람다를 깨우지 않는다»)은 지금도 맞다.
 *   그래서 ★껍데기를 도로 동적으로 만들지 않는다.★ 대신 ISR 로 ★알맹이까지 담아서★ 굳힌다.
 *   ```
 *   전   ● 빈 껍데기 캐시  → 브라우저가 목록을 다시 물어봄 (2~4초 빈 화면)
 *   후   ● 목록까지 담긴 HTML 캐시 (60초) → ★첫 그림에 클랜이 있다★
 *   ```
 *   람다는 리그당 60초에 한 번만 깬다. 방문 수와 무관하다 — O-016 이 지키려던 것 그대로다.
 *
 * ── ★화면 코드는 한 글자도 안 고친다★
 *   `ClanDirectory.tsx` 는 그대로 `useQuery`/`useCursorQuery` 를 쓴다.
 *   여기서 ★같은 열쇠(queryKey)에 같은 모양의 답★ 을 미리 담아 두면
 *   브라우저는 처음부터 「이미 받은 것」으로 보고 곧장 그린다.
 *   ⚠ 그래서 ★열쇠와 답의 모양이 라우트와 한 글자도 달라선 안 된다.★
 *     열쇠  `['league', slug]` · `['league', slug, 'clans', 'directory']`
 *     모양  `{ message, data }` · `{ message, data, metadata: { cursor } }`
 *     (`app/api/leagues/[league]/route.ts` · `.../clans/route.ts` 와 같은 값이다)
 *
 * ── ★못 받아도 화면은 열린다★
 *   DB 가 느리거나 답이 없으면 ★아무것도 안 담고 넘어간다.★ 그러면 예전처럼
 *   브라우저가 물어본다 — 느려질 뿐 ★깨지지 않는다.★ 지어낸 값을 담지 않는다.
 */

/** 라우트의 상한과 같은 값이다 (`.../clans/route.ts` 의 `MAX_SIZE`) */
const DIRECTORY_SIZE = 400

const SUCCESS = 'success'

export async function prefetchClanRank(leagueSlug: string) {
  const client = new QueryClient()

  const [league, page] = await Promise.all([
    getLeague(leagueSlug).catch(() => null),
    getLeagueClans(leagueSlug, null, DIRECTORY_SIZE).catch(() => null),
  ])

  if (league) {
    client.setQueryData(['league', leagueSlug], { message: SUCCESS, data: league })
  }
  if (page) {
    client.setQueryData(['league', leagueSlug, 'clans', 'directory'], {
      pages: [{ message: SUCCESS, data: page.items, metadata: { cursor: page.cursor } }],
      pageParams: [null],
    })
  }

  /*
   * ★리그 구분은 손으로 한 번 더 건네준다★ (2026-09-10 실측에서 찾은 함정).
   *
   * 위에서 `['league', slug]` 도 담아 두지만 ★그 열쇠는 서버에서 안 먹는다.★
   * 리그 레이아웃(`layout.tsx`)이 ★이 화면보다 먼저★ 같은 열쇠로 물어보기 때문이다.
   * react-query 는 ★이미 있는 열쇠★ 를 `useEffect` 로 채우는데 ★서버에는 useEffect 가 없다.★
   * (실측 로그: `category= undefined status= pending` · 클랜 목록은 42건 들어왔다)
   *
   * 레이아웃을 서버로 가르면 리그 화면 ★전부★ 가 DB 를 읽게 된다 — O-016 을 되돌리는 셈이다.
   * 그래서 ★이 화면이 필요한 한 칸만 값으로 건넨다.★ 브라우저가 답을 받으면 그쪽이 이긴다.
   */
  return { state: dehydrate(client), category: league?.category ?? null }
}
