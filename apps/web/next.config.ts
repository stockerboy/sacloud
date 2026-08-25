import type { NextConfig } from 'next'

/**
 * 보안 헤더 (D-136).
 *
 * 외부 공개 전에 하나도 없었다. 여기서 붙인다.
 *
 * ── CSP 를 정할 때 실제로 필요한 것만 열었다
 *   `img-src`   클랜마크가 `static.3rd.supply` 에서 온다. 원본 자산을 그대로 링크한다
 *               (복사해 오지 않는다 — CLAUDE.md 3장 4번). data:/blob: 은 아바타 미리보기용
 *   `script-src` Next 는 하이드레이션에 인라인 부트스트랩 스크립트를 쓴다.
 *               nonce 방식으로 바꾸려면 미들웨어가 필요해서 이번 범위 밖이다.
 *               `'unsafe-inline'` 을 남긴 것은 **의도된 타협**이고 아래 숙제로 적어 둔다.
 *
 *               **개발 모드에서만 `'unsafe-eval'` 을 연다.** Next 의 react-refresh 가
 *               문자열을 eval 하기 때문에, 막으면 클라이언트가 하이드레이션 자체를 못 한다 —
 *               화면이 스켈레톤에서 멈춘다. 실제로 그렇게 막혀 있었다.
 *               **운영 빌드에는 들어가지 않는다.**
 *   `style-src`  Tailwind 런타임 스타일과 인라인 스타일 속성
 *   `connect-src` 같은 오리진만. 외부로 나가는 fetch 가 없다
 *   `frame-ancestors 'none'` 클릭재킹 차단. X-Frame-Options 와 함께 둔다
 *
 * ── HSTS
 *   HTTPS 로 서비스할 때만 의미가 있다. HTTP 로 접근하면 브라우저가 무시한다.
 *   `preload` 는 넣지 않았다 — 도메인이 확정되고 HTTPS 가 안정된 뒤에 사람이 정한다.
 */
const isDev = process.env.NODE_ENV === 'development'

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://static.3rd.supply",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 워크스페이스 내부 패키지는 빌드 산출물 없이 소스를 그대로 참조한다
  transpilePackages: ['@sacloud/contract', '@sacloud/mock', '@sacloud/ui'],
  // 서버 종류(Next 버전·런타임)를 광고하지 않는다
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
