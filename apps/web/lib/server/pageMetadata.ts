import type { Metadata } from 'next'

/**
 * **화면마다 자기 이름표를 단다** (O-038 ① · 2026-09-03).
 *
 * ══ 왜 필요한가 ══
 *
 * `O-014` 로 경기 한 판에 주소를 줬다. 그런데 강민재가 링크를 실제로 보내 보니
 * **받는 쪽에는 사이트 이름만 뜬다.**
 * ```
 * <title>   3rd cloud - 서든어택 클랜전 전적검색   ← ★모든 화면이 같다★
 * og:url    https://3rdcloud.my                   ← ★전부 홈으로 고정★
 * ```
 * > 강민재 — *"「이 판 봐라」 하고 보내는 게 클랜전 문화인데
 * >  받는 쪽엔 사이트 이름만 뜬다."*
 *
 * **「링크를 보낼 수 있다」의 값이 절반 날아간다.**
 *
 * ══ 규칙 ══
 *
 * · **없는 값을 지어내지 않는다.** 이름을 못 가져오면 **사이트 이름으로 떨어진다** —
 *   빈 제목이나 「알 수 없는 선수」 같은 말을 만들지 않는다
 * · `og:image` 는 **이번에 안 넣는다.** 저장소에 쓸 만한 그림이 없다 (사장님 손 목록)
 * · 루트 `layout.tsx` 의 값이 바탕이다. 여기서는 **덮어쓸 것만** 준다
 *
 * ══ 왜 `●` 가 안 깨지나 ══
 *
 * `generateMetadata` 는 `generateStaticParams` 가 달린 화면에서 **껍데기와 같은 때**
 * 한 번 돌고 같이 캐시된다. 방문마다 도는 것이 아니다 (`O-016`).
 * 그래서 이름을 가져오려고 공개 API 를 한 번 부르는 것은 **첫 사람 한 번**뿐이고,
 * 그 API 는 이미 엣지가 받아 낸다 (`okPublic`).
 */

const SITE = '3rd cloud'
const BASE = 'https://3rdcloud.my'

/**
 * 공개 API 한 곳을 읽는다. **실패하면 `null`** — 부르는 쪽이 사이트 이름으로 떨어진다.
 *
 * ⚠ 실패를 삼키되 **조용히 삼키지는 않는다** (O-028). 이름이 안 붙는 이유가
 *   어디에도 안 남으면 「원래 그런 것」으로 굳는다.
 */
export async function fetchForMetadata<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${BASE}/api${path}`, { next: { revalidate: 300 } })
    if (!response.ok) return null
    const body = (await response.json()) as { data?: T }
    return body.data ?? null
  } catch (error) {
    console.error(`[metadata] ${path}`, error)
    return null
  }
}

/**
 * 제목 · 설명 · 주소를 한 벌로 만든다.
 *
 * @param title 그 화면의 이름. **없으면 사이트 이름만 남는다**
 * @param path  이 화면의 주소 (`/league/supply/match/123`)
 */
export function pageMetadata(input: {
  title: string | null
  description?: string | null
  path: string
}): Metadata {
  const title = input.title ? `${input.title} - ${SITE}` : `${SITE} - 서든어택 클랜전 전적검색`
  const url = `${BASE}${input.path}`
  /* 설명이 없으면 루트의 것이 그대로 남는다 — 빈 문자열을 넣지 않는다 */
  const description = input.description ?? undefined

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: SITE,
      title,
      ...(description ? { description } : {}),
      url,
    },
    twitter: {
      card: 'summary',
      title,
      ...(description ? { description } : {}),
    },
    alternates: { canonical: url },
  }
}
