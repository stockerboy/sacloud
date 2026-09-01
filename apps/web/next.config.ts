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

/**
 * 공개 읽기 응답의 엣지 캐시 (D-240). 값의 근거는 `respond.ts` 의 `PUBLIC_CACHE_SECONDS` 주석에 있다.
 *
 *   `s-maxage=N`                 엣지가 N초 동안 대신 답한다 → 그 N초간 DB 를 한 번만 때린다
 *   `stale-while-revalidate=600` 만료 뒤 10분까지 **옛 값을 즉시** 내주고 뒤에서 새로 받는다
 *   `stale-while-revalidate=86400` **(2026-09-01 재조정)**
 *     600 → 86400(하루). 이유: DB 가 수집에 눌려 답을 못 하는 구간이 실제로 있고,
 *     그때 창이 짧으면 **캐시가 만료되어 사용자가 500 을 본다.** 창이 하루면
 *     한 번이라도 성공한 응답이 있는 한 **사용자는 500 을 보지 않는다** —
 *     조금 낡은 값을 보고, 뒤에서 새 값을 받아 온다.
 *     ⚠ 값이 하루까지 낡을 수 있다는 뜻이 아니다. DB 가 멀쩡하면 `s-maxage` 마다 갱신된다.
 *     하루는 **DB 가 죽어 있는 동안 버티는 길이**다.
 *     ⚠ **등급을 나눠도 이 값은 전 등급 86400 으로 고정한다.** 이게 「DB 가 죽어도
 *       500 을 안 본다」의 근거이고, 등급마다 다르게 하면 그 보장이 등급마다 갈라진다.
 *   `max-age=0`                  **브라우저는 캐시하지 않는다** — 방금 뭘 한 사람이 옛 화면을 보면 안 된다
 */
const STALE_WHILE_REVALIDATE_SECONDS = 86400

/**
 * ── 등급 ① **오래 (1시간)** — 사람이 손대야 바뀌는 것
 *   리그 목록 · 리그 상세 · 맵 · 원격설정 · 시즌 목록.
 *   리그는 셋(DPL · IPL · 열산)뿐이고 새 리그는 관리자가 만들 때만 생긴다.
 *   시즌 목록은 시즌이 열리고 닫힐 때만 바뀐다 — 하루에 한 번도 안 바뀌는 값이다.
 *   1시간 늦게 반영돼도 «틀린 화면» 이 되지 않는 것들만 여기 둔다.
 */
const CACHE_LONG_SECONDS = 3600

/**
 * ── 등급 ② **기록/랭킹 (5분)** — D-240 이 정한 기존 값. 그대로 둔다
 *   경기가 들어오면 바뀌지만, 전적 사이트에서 5분 지연은 견딜 만하다고 이미 판정했다
 *   (`respond.ts` 의 `PUBLIC_CACHE_SECONDS` 주석). 새로 나누면서도 **이 등급은 안 건드린다** —
 *   실측으로 다시 정해야 하는 임시값이라 지금 흔들면 무엇 때문에 달라졌는지 알 수 없다.
 */
const CACHE_RECORD_SECONDS = 300

/**
 * ── 등급 ③ **방금 쓴 것 (30초)** — 사람이 글을 올리고 목록을 다시 보는 것
 *   글을 쓰고 목록으로 돌아왔는데 자기 글이 없으면 «안 올라갔다» 로 읽는다.
 *   그래도 0 은 아니다 — 목록은 Hot 집계 때문에 무거운 질의고, 30초만 막아도
 *   연타(새로고침 · 탭 전환)를 전부 엣지가 받는다.
 *   ⚠ 30초는 **버티는 값이 아니라 참는 값**이다. 더 늘리면 사용자가 눈치챈다.
 */
const CACHE_FRESH_SECONDS = 30

const cacheHeaders = (seconds: number) => [
  {
    key: 'Cache-Control',
    value: `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
  },
]

/** 옛 이름을 남겨 둔다 (`CLAUDE.md` 10-4) — 등급을 나누기 전에는 이것 하나뿐이었다 */
const PUBLIC_CACHE_HEADERS = cacheHeaders(CACHE_RECORD_SECONDS)

/**
 * 캐시를 거는 경로. **로그인과 무관하고 같은 주소면 누구에게나 같은 값**인 것만 넣는다.
 * 하나 넣을 때마다 «이 응답이 사람마다 다른가» 를 먼저 확인한다 —
 * 라우트 파일만 보지 말고 **그 밑의 쿼리 함수까지** 따라 들어가서 본다.
 *
 * ⚠ **한 요청이 두 줄에 걸리지 않게 한다.** Next 는 매칭되는 규칙의 머리말을 **전부 붙인다** —
 *   등급이 다른 두 줄에 걸리면 `Cache-Control` 이 두 개 나간다.
 *
 * ── 여기 **넣지 않은** 것과 그 이유 (2026-09-01 검토)
 *   `/api/boards/:boardId`   **세션에 따라 답이 다르다.** `getBoard()` 가 `currentUserId` 와
 *                            `voterKey` 를 읽어 `me`(내 글인가) · `like_type`(내가 추천했는가)를
 *                            담는다. 게다가 조회수를 올린다 — 캐시되면 조회수가 멈춘다
 *   `/api/comments`          **세션에 따라 답이 다르다.** `listComments()` 가 같은 두 값을 읽고
 *                            `me` · `like_type` · 익명 라벨을 사람마다 다르게 만든다
 *   `/api/leagues/slug/:slug/availability`
 *                            리그 만들기 폼의 중복 확인이다. 캐시하면 **남이 방금 가져간 이름을
 *                            «비어 있다» 로 답한다.** 호출량도 미미해 얻을 게 없다
 *   `/api/health`            상태를 보는 것이 목적인데 캐시하면 **옛 상태**를 본다
 *   `/api/infos` · `/api/me/*` · `/api/admin/*` · `/api/auth/*` · `/api/eggs/broken`
 *                            기존 판단 그대로 (머리말 주석 참조)
 *
 * ── 이미 덮여 있어 **따로 넣지 않은** 것
 *   `/api/leagues/:league/ranks/form` · `/ranks/independent` 는 둘 다 세션과 무관함을 확인했다
 *   (쿼리 함수가 `Request` 를 아예 받지 않는다). 다만 `/ranks/:kind*` 가 이미 덮고 있고
 *   등급도 같으므로 **줄을 늘리지 않는다** — 늘리면 위의 «두 줄에 걸림» 이 된다
 */
const CACHE_SOURCES_LONG = [
  '/api/remote_configs',
  '/api/maps',
  '/api/leagues',
  '/api/leagues/:league',
  /* 검색창이 반복해서 때리는데 리그는 셋뿐이라 결과가 사실상 고정이다 */
  '/api/leagues/name/:name',
  '/api/leagues/search/:q',
  '/api/leagueclans/:leagueClanId/seasons',
  '/api/leagueplayers/:leaguePlayerId/seasons',
]

const CACHE_SOURCES_RECORD = [
  '/api/home/top',
  '/api/leagues/:league/clans',
  '/api/leagues/:league/clans/:clan/show',
  '/api/leagues/:league/clans/:clan/players',
  '/api/leagues/:league/players/:playerId',
  '/api/leagues/:league/players/:playerId/matches',
  '/api/leagues/:league/matches/:matchId',
  '/api/leagues/:league/ranks/:kind*',
  '/api/leagueclans/:leagueClanId/matches',
  '/api/clans/:clanSlug',
  '/api/clans/:clanSlug/leagues',
  '/api/clans/:clanSlug/players',
  '/api/players/:playerId',
  '/api/players/:playerId/leagues',
  /*
   * 통합검색 · 자동완성. 넣는 근거는 **세션이 아니라 적중률**이었다.
   *   ① 세션과 무관하다 — `queries/search.ts` 의 함수들은 `Request` 를 받지 않는다.
   *      로그인해도 안 해도 같은 값이다
   *   ② 검색어가 제각각이라 적중률이 낮아 보이지만, 실제로 몰리는 검색어는
   *      **자기 닉네임 · 유명 클랜 이름** 몇 개다. 그리고 자동완성은 **타자 한 번마다**
   *      호출된다 — 같은 사람이 `ㅅ`→`서`→`서플` 을 지웠다 다시 치는 것만으로도 재방문한다
   *   ③ 적중하지 않아도 **손해가 없다.** 캐시 미스는 지금과 똑같이 DB 로 간다
   */
  '/api/clans/name/:name',
  '/api/clans/search/:q',
  '/api/players/name/:name',
  '/api/players/search/:q',
]

const CACHE_SOURCES_FRESH = [
  /*
   * 글 목록. `listBoards()` 를 따라 들어가 확인했다 — `Request` 를 받지 않고,
   * `toBoardListItem()` 에는 `me` 도 `like_type` 도 없다 (그 둘은 **상세**에만 있다).
   * 즉 로그인 상태가 섞일 칸이 응답에 아예 없다.
   */
  '/api/boards',
]

/**
 * 등급을 나누기 전에는 목록(`PUBLIC_CACHE_SOURCES`)과 머리말이 각각 하나였다.
 * 머리말 쪽 이름(`PUBLIC_CACHE_HEADERS`)은 위에 그대로 살아 있고, 목록은 세 갈래로 나뉘었다
 * (`CLAUDE.md` 10-4 — 서술을 지우지 않고 여기 남긴다).
 */
const CACHE_RULES = [
  { sources: CACHE_SOURCES_LONG, headers: cacheHeaders(CACHE_LONG_SECONDS) },
  { sources: CACHE_SOURCES_RECORD, headers: PUBLIC_CACHE_HEADERS },
  { sources: CACHE_SOURCES_FRESH, headers: cacheHeaders(CACHE_FRESH_SECONDS) },
]

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
  /*
   * ⚠ **2026-09-01 (D-240) — 엣지 캐시가 한 번도 걸린 적이 없었다.**
   *
   * `apps/web/lib/server/respond.ts` 의 `okPublic` 이 `s-maxage` 를 붙이는데,
   * **운영 응답에는 그게 없다.** 실측(캐시 우회 없이 GET):
   *
   * ```
   * Cache-Control: public, max-age=0, must-revalidate     ← Next 의 기본값
   * X-Vercel-Cache: MISS                                   ← 언제나 MISS
   * ```
   *
   * 캐시를 안 붙인 `/api/eggs/broken` 까지 **똑같은 머리말**이 나온다. 즉 우리 머리말이
   * 나가는 게 아니라 **Next 가 동적 라우트 핸들러 응답을 자기 기본값으로 덮어쓰고 있다.**
   * 그래서 D-223 이후로 «엣지가 받아 준다» 고 믿었던 것이 **전부 DB 까지 갔다.**
   *
   * ── 그래서 설정 쪽에서 건다
   *   `headers()` 는 빌드 산출물의 라우팅 표에 박혀 **엣지가 직접 적용한다.**
   *   런타임 핸들러가 무엇을 덮어쓰든 이쪽이 남는다.
   *   `respond.ts` 의 `okPublic` 도 **지우지 않는다** — 로컬·다른 배포판에서는 그게 답이고,
   *   두 곳이 같은 값을 말하면 어긋날 일이 없다 (값은 아래 상수 하나에서 온다).
   *
   * ── 여기 넣으면 안 되는 것
   *   로그인 상태에 따라 답이 달라지는 것과 방금 한 행동이 즉시 보여야 하는 것.
   *   `/api/infos` · `/api/me/*` · `/api/admin/*` · `/api/auth/*` · **`/api/eggs/broken`**
   *   (마지막 것은 D-222 ⑤ — 방금 깬 알이 안 보이면 «안 깨졌다» 로 읽힌다)
   *   전체 목록과 하나하나의 근거는 `CACHE_SOURCES_*` 위 주석에 있다.
   */
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      ...CACHE_RULES.flatMap(({ sources, headers }) => sources.map((source) => ({ source, headers }))),
    ]
  },
}

export default nextConfig
