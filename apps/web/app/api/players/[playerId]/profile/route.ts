import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getPlayer, getPlayerLeagues } from '@/lib/server/queries/players'

/**
 * `GET /api/players/{playerId}/profile` — **기본정보 + 참여중인 리그를 한 번에** (O-034).
 *
 * ══ 왜 생겼나 ══
 *
 * 선수 화면이 열릴 때마다 요청을 **둘** 쏘고 있었다 (`/players/{id}` + `/players/{id}/leagues`).
 * 둘 다 같은 사람 것이고 **항상 같이** 쓰인다.
 *
 * 공개일에 천 명이 각자 자기 닉과 친구 닉을 친다. 서로 다른 캐시 키가 수천 개고
 * **전부 첫 방문이라 전부 DB 로 간다.** 캐시가 고장난 게 아니다 — 두 번째부터는
 * `HIT` 이 뜬다(오세라 실측). **문제는 「첫 번째」의 개수다.**
 *
 * ```
 * 전   요청 2 · 람다 2 · 캐시 키 2 · DB 접속 2    ← 접속 자리는 5개다
 * 후   요청 1 · 람다 1 · 캐시 키 1 · DB 접속 1
 * ```
 *
 * ⚠ **DB 질의 수는 안 준다.** 같은 질의를 한 요청 안에서 할 뿐이다
 *   (`getPlayer` 1회 + `getPlayerLeagues` 1+N회 — 그대로다).
 *   줄어드는 것은 **접속 자리를 잡는 횟수**이고, 자리가 5개뿐이라 그게 병목이다.
 *
 * ══ 안 바꾼 것 ══
 *
 * · **옛 경로 둘은 그대로 산다** (`CLAUDE.md` 10-4). 이건 더한 것이지 바꾼 것이 아니다
 * · **값이 하나도 안 줄었다.** 두 응답을 그대로 담는다 — 합치는 것이지 빼는 것이 아니다
 * · 캐시 등급도 그 둘과 같은 기록 등급(300초)이다. 새 캐시 층을 만들지 않았다
 *
 * ⚠ 없는 선수는 **404** 다. `/leagues` 쪽은 없는 선수에게도 빈 배열을 주지만,
 *   여기서는 화면이 「없는 사람」을 알아야 하므로 기본정보 쪽 판정을 따른다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const playerId = await routeParam(context, 'playerId')

    /* 둘을 **나란히** 쏜다. 순서대로 하면 왕복이 두 번 겹쳐 느려진다 */
    const [player, leagues] = await Promise.all([getPlayer(playerId), getPlayerLeagues(playerId)])

    if (!player) return notFound('플레이어를 찾을 수 없습니다')

    /* 기록 등급(기본 300초) — 로그인과 무관한 공개 프로필이다 (D-240) */
    return okPublic({ player, leagues })
  })
}
