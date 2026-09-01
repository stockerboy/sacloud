import path from 'node:path'
import type { NextConfig } from 'next'

/**
 * 보안 헤더 (D-136).
 *
 * 외부 공개 전에 하나도 없었다. 여기서 붙인다.
 *
 * ── CSP 를 정할 때 실제로 필요한 것만 열었다
 *   `img-src`   클랜마크는 **두 곳**에서 온다. 복사해 오지 않고 그대로 링크한다
 *               (CLAUDE.md 3장 4번). data:/blob: 은 아바타 미리보기용
 *
 *               `img.sa.nexon.com`   넥슨 공식 이미지 CDN. 병영수첩에서 받은 마크가 이 꼴이다
 *               `static.3rd.supply`  같은 이미지의 미러. 경로를 base64 로 감싼 것뿐이다
 *                                    (`NTEvMF8xMl8xNjE` = `51/0_12_161`, 바이트 수도 같다)
 *
 *               ⚠ **2026-08-31 결함 수정** — 넥슨 도메인이 빠져 있어서 IPL 클랜랭킹에서
 *                 마크가 여러 개 안 보였다. DB 에는 URL 이 멀쩡히 있고 그 URL 도 200 인데
 *                 **브라우저가 CSP 로 막고 있었다.** `clan-mark-audit` 은 "URL 이 있는가" 만
 *                 봐서 `마크없음 0` 이라고 답했다 — 그래서 끝난 줄 알고 넘어갔다.
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

/**
 * 클랜마크를 가져오는 호스트 — **여기가 단일 진실 원천이다.**
 *
 * `img-src` 와 `clan-mark-audit` 이 같은 목록을 봐야 한다. 갈라지면
 * "DB 에는 URL 이 있는데 화면에는 안 보이는" 상태가 조용히 생긴다 (2026-08-31 실제 발생).
 */
export const CLAN_MARK_HOSTS = ['https://img.sa.nexon.com'] as const

/**
 * ⚠ **정정 (2026-09-01) — `static.3rd.supply` 를 목록에서 뺐다.**
 *
 * 위 머리말의 «클랜마크는 **두 곳**에서 온다» 는 서술은 **그때는 맞았다.** 지금은 한 곳이다.
 * 서술을 지우지 않고 여기에 정정을 단다 (`CLAUDE.md` 10-4).
 *
 * 뺄 수 있게 된 근거 셋 — **셋이 다 참이라서** 뺐다. 하나만 참이면 뺄 수 없었다.
 *
 *   ① DB 에 원본 주소가 남아 있지 않다
 *      `clan-mark-restore --confirm` 을 운영에 돌렸다 — 402곳 · 804칸을 넥슨 주소로
 *      되돌렸고 **남은 원본 사이트 주소 0곳**. 백업은 `backups/clan-mark-restore-402건.json`
 *   ② 새로 들어오는 것도 원본 주소가 아니다
 *      `supplyPlayerProfilesImport.ts` 는 `supplyMarkUrlToNexon()` 을 거쳐 넣고,
 *      `iplMarkFill.ts` 는 `https://img.sa.nexon.com/...` 을 직접 만든다
 *   ③ 설령 남아 있어도 화면에는 안 나간다
 *      `mappers.ts` 가 내보내기 직전에 `restoreClanMark()` 로 한 번 더 거른다
 *
 *   그리고 운영 실측: `clan-mark-audit` 이 세 리그 모두 **CSP차단 0** 이다.
 *
 * 왜 굳이 빼나 — **원본 사이트 자산에 링크를 걸지 않는다** (`CLAUDE.md` 3장 4번).
 * 열어 두면 «안 쓰는데 열려 있는 문» 이고, 그 문이 열려 있으면 실수로 다시 들어온다.
 */

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob: ${CLAN_MARK_HOSTS.join(' ')}`,
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
  ...(process.env.SACLOUD_DIST_DIR ? { distDir: process.env.SACLOUD_DIST_DIR } : {}),
  reactStrictMode: true,
  // 워크스페이스 내부 패키지는 빌드 산출물 없이 소스를 그대로 참조한다
  transpilePackages: ['@sacloud/contract', '@sacloud/mock', '@sacloud/ui'],
  // 서버 종류(Next 버전·런타임)를 광고하지 않는다
  poweredByHeader: false,
  /**
   * 서버리스 번들에 **Prisma 쿼리 엔진을 같이 넣는다** (D-151).
   *
   * 생성된 Prisma 클라이언트는 `packages/db/generated/client` 에 있고 Next 가 그걸 번들하면
   * 모듈이 원래 위치를 잃는다. 그래서 런타임에 Prisma 는 네이티브 엔진을 **정해진 몇 군데**
   * 에서만 찾는데, 그 첫 번째가 `<번들루트>/apps/web/generated/client` 다.
   *
   * `outputFileTracingIncludes` 는 파일의 **상대 경로를 유지**하므로 `packages/db/...` 를
   * 그대로 넣으면 Prisma 가 보지 않는 곳에 떨어진다 — 실제로 그렇게 실패했다.
   * 그래서 `scripts/copy-prisma-engine.mjs` 가 엔진을 `apps/web/generated/client/` 로
   * 먼저 옮기고, 여기서 그 경로를 번들에 포함시킨다.
   *
   * `outputFileTracingRoot` 는 모노레포 루트로 둔다. 그래야 번들 루트가 저장소 루트가 되고
   * `apps/web/...` 상대 경로가 런타임 검색 경로와 맞는다.
   * `next build` 는 항상 이 패키지 폴더에서 돈다(로컬 · Vercel Root Directory 둘 다 `apps/web`).
   */
  outputFileTracingRoot: path.join(process.cwd(), '..', '..'),
  outputFileTracingIncludes: {
    '/**': ['./generated/client/**'],
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
