import { NextResponse } from 'next/server'

/**
 * ★★클랜마크를 우리 주소로 감싸서 오래 캐시한다★★
 * (2026-09-09 · 사장님 «사이트가 체감상 확 느려진거같거든 최적화 한번 해야할거같아»)
 *
 * ── ★왜 필요한가★ (2026-09-09 실측)
 *   ```
 *   개인랭킹 한 화면의 마크   ★40개★ (20행 × 배경+전경)
 *   전부 넥슨 서버에서 온다   https://img.sa.nexon.com/...
 *   넥슨 응답의 캐시 헤더     ★없다★ (Cache-Control 도 Expires 도 안 준다)
 *   ```
 *   캐시 헤더가 없으니 ★화면을 옮길 때마다 40개를 다시 받는다.★
 *   폰(LTE)에서는 남의 도메인에 붙는 것 자체가 비싸다 — DNS + TLS 가 매번이다.
 *
 *   여기를 거치면
 *     · ★같은 주소(3rdcloud.my)★ 라 이미 열린 연결을 쓴다
 *     · ★1년 캐시★ 라 두 번째부터는 아예 안 받는다
 *     · Vercel 의 CDN 이 대신 들고 있어 ★넥슨 부하도 준다★
 *
 * ── ★이미지를 복사해 오지 않는다★ (`CLAUDE.md` 3장 4번)
 *   저장하지 않는다. ★그때그때 넥슨에서 받아 그대로 흘려 보낼 뿐★ 이다.
 *   DB 에도 디스크에도 남기지 않는다.
 *
 * ── ★아무 주소나 안 열어 준다★
 *   허용한 호스트(`img.sa.nexon.com`)의 마크 경로 모양만 받는다.
 *   그 밖은 400 이다 — 열린 프록시가 되면 남의 트래픽을 우리가 대신 내게 된다.
 *
 * ```
 * /api/mark?u=https%3A%2F%2Fimg.sa.nexon.com%2Fsa%2Fclan%2Fmark%2F51%2F0_13_072.png
 * ```
 */

/** 받아도 되는 곳 — `next.config.ts` 의 `CLAN_MARK_HOSTS` 와 같은 값이다 */
const ALLOWED_ORIGIN = 'https://img.sa.nexon.com'
/** 마크 경로 모양. 이것 말고는 안 받는다 */
const ALLOWED_PATH = /^\/sa\/clan\/mark\/[0-9]+\/[0-9A-Za-z_.-]+\.(png|jpg|jpeg|gif)$/

/** 넥슨이 느릴 때 우리 함수까지 붙잡혀 있지 않게 한다 */
const TIMEOUT_MS = 6000

/** ★1년★ — 마크 이미지는 주소가 바뀌면 다른 파일이다. 같은 주소는 같은 그림이다 */
const CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable'

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('u')
  if (!raw) return NextResponse.json({ message: 'u 가 필요하다' }, { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ message: '주소가 아니다' }, { status: 400 })
  }
  if (target.origin !== ALLOWED_ORIGIN || !ALLOWED_PATH.test(target.pathname)) {
    /* ★열린 프록시가 되지 않는다★ — 허용한 모양만 지나간다 */
    return NextResponse.json({ message: '허용하지 않는 주소다' }, { status: 400 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      /* 우리도 한 번 캐시한다 — 같은 마크를 여러 화면이 함께 쓴다 */
      cache: 'force-cache',
    })
    if (!upstream.ok || !upstream.body) {
      /* ★없는 것을 있는 척하지 않는다★ — 화면은 마크가 안 오면 공통 구름을 그린다 */
      return NextResponse.json({ message: '원본을 못 받았다' }, { status: 502 })
    }
    const type = upstream.headers.get('content-type') ?? 'image/png'
    if (!type.startsWith('image/')) {
      return NextResponse.json({ message: '이미지가 아니다' }, { status: 502 })
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': CACHE,
        /* 이미지 하나에 쿠키가 오갈 이유가 없다 */
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    })
  } catch {
    return NextResponse.json({ message: '원본이 응답하지 않는다' }, { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}
