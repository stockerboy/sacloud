import PlayerPage from './PlayerProfileScreen'

/**
 * `/player/{playerId}` **껍데기를 굳힌다** (2026-09-03 · O-016).
 *
 * ══ 무엇을 바꾼 것인가 ══
 *
 * 화면 코드는 **한 글자도 안 바뀌었다.** `PlayerProfileScreen.tsx` 가 그대로 그 파일이다.
 * 여기 있는 것은 **얇은 서버 껍데기** 하나뿐이다.
 *
 * ══ 왜 필요했나 ══
 *
 * ```
 * pnpm build (2026-09-03 · O-016 전)
 *   ○ Static 23개    ● ISR ★0개★    ƒ Dynamic 119개
 * ```
 * 화면 6개 중 **홈만 `○` 이고 나머지가 전부 `ƒ`** 였다.
 *
 * `ƒ` 는 **DB 를 때린다는 뜻이 아니다.** 이 화면들은 `'use client'` 라 서버에서 DB 를 안 읽는다.
 * `ƒ` 가 뜻하는 건 **방문 한 번마다 람다가 깨어나 「모두에게 똑같은 빈 껍데기」를 만든다**는 것이다.
 * 천 명이면 람다가 천 번 깬다. `respond.ts` 가 적어 둔 *「함수가 식어 있으면 첫 요청이 10초」*
 * 가 여기서 나온다. 오세라가 운영에서 두 번 연속 `MISS` 로 확인했다.
 *
 * 원인은 하나다 — **`generateStaticParams` 가 저장소에 하나도 없었다.**
 * 동적 세그먼트(`[playerId]`)에 그게 없으면 Next 는 전부 `ƒ` 로 떨어뜨린다.
 *
 * ══ 왜 파일을 둘로 갈랐나 ══
 *
 * `generateStaticParams` 는 **서버에서만** 쓸 수 있다. 그런데 이 화면은 `'use client'` 였고,
 * `'use client'` 파일은 그것을 내보낼 수 없다. 그래서 **얇은 서버 껍데기를 앞에 세우고**
 * 원래 파일을 그대로 아래에 둔다. 흔한 모양이다.
 *
 * ══ 무엇을 안 바꿨나 ══
 *
 * · **데이터는 지금도 클라이언트가 API 로 받아 온다.** 서버에서 DB 를 읽게 만들지 않았다
 * · **로그인 표시는 안 굳는다.** GNB 는 `AppShell` 이 그리고, 그건 클라이언트에서
 *   `GET /me` 를 부른다 (O-018). 껍데기가 굳어도 사람마다 다르게 나온다
 */

/**
 * **빈 배열이다.** 선수가 23,562명이라 미리 다 만들 수 없고, 만들 이유도 없다.
 *
 * 빌드 때는 아무것도 안 만들고, **처음 들어온 사람의 요청으로 껍데기가 만들어져 캐시된다.**
 * 그다음 사람부터는 람다가 안 깬다. `dynamicParams` 가 켜져 있어야 그 「처음 한 번」이 허용된다.
 */
export function generateStaticParams(): { playerId: string }[] {
  return []
}

/** 목록에 없는 선수도 열린다 — 위 주석의 「처음 한 번」이 이것이다 */
export const dynamicParams = true

export default function Page({ params }: { params: Promise<{ playerId: string }> }) {
  return <PlayerPage params={params} />
}
