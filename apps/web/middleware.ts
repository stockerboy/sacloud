import { NextResponse, type NextRequest } from 'next/server'

/**
 * ★사이트 비공개 문★ (2026-09-13 사장님: «사이트 비공개로 돌려줘 일단»).
 *
 * ── 무엇을 하나
 *   로그인하지 않은 사람에게는 ★「준비 중」 한 장★ 만 보여 준다 (503).
 *   로그인한 사람에게는 지금까지와 ★똑같은 사이트★ 가 보인다.
 *
 * ── ★지금은 열려 있다★ (2026-09-13 사장님: «사이트 다시 공개로 돌려봐»)
 *
 *   ⚠ ★스위치를 뒤집었다.★ 처음에는 «`SACLOUD_PUBLIC=1` 이 있어야 열린다» 였는데,
 *     그러면 여는 데 Vercel 대시보드가 필요하다. 지금은 반대다 —
 *     ★`SACLOUD_PRIVATE=1` 이 있을 때만 잠긴다.★
 *     ★파일을 지우지 않았다★ (`CLAUDE.md` 1-4). 문은 그대로 있고 스위치만 꺼져 있다.
 *
 *   다시 잠그려면 — Vercel 환경변수에 `SACLOUD_PRIVATE=1` 을 넣는다.
 *   잠긴 동안에도 `https://3rdcloud.my/auth/login` 으로 로그인하면 전부 보인다.
 *
 * ── ⚠ 이 문의 ★한계를 분명히★ 적어 둔다
 *   여기서는 세션 쿠키가 ★있는지만★ 본다. 서명을 검사하지 않는다 —
 *   미들웨어는 Edge 에서 돌고 `AUTH_SECRET` 이 없으면 검사 자체가 터지는데,
 *   그때 ★사장님까지 못 들어오는★ 것이 더 나쁘기 때문이다.
 *   그러니 이 문은 «검색엔진과 지나가는 사람을 막는 가림막» 이지
 *   ★작정한 사람을 막는 자물쇠가 아니다.★ 진짜 자물쇠가 필요하면
 *   Vercel 의 Deployment Protection(암호)을 켜는 쪽이 맞다.
 *   ★진짜 권한 검사는 그대로다★ — 관리자 API 는 여전히 `requireAdmin` 이 지킨다.
 *
 * ── 열어 두는 길 (없으면 로그인조차 못 한다)
 *   `/auth/*` · `/api/auth/*` · `/api/health` · 정적 파일(`/_next` · `/assets` …).
 */

const SESSION_COOKIE = 'sacloud_session'

/**
 * ★사이트를 잠그나★ (2026-09-21 사장님: 「공개로 돌려」).
 *
 * `false` 면 ★누구나 들어온다.★ `true` 면 로그인한 사람만 들어온다.
 * 환경변수 `SACLOUD_PRIVATE=1` 로도 잠글 수 있다 — 둘 중 하나만 켜도 잠긴다.
 */
/*
 * ⚠ ★2026-09-21 저녁 — 다시 잠갔다★ (사장님: 「★비공개로 돌려★ 사람들이 보겠다
 *   이런 부끄러운 꼴」). 닉네임·명단이 낡은 채로 열려 있었다.
 *   다 고친 뒤 이 줄을 `false` 로 되돌리면 다시 열린다.
 */
const SITE_PRIVATE = true as boolean

/** 문 밖에서도 열리는 길 */
const OPEN_PREFIX = [
  '/auth', // 로그인 · 회원가입 · 비밀번호
  '/api/auth', // 그 화면들이 부르는 API
  '/api/health', // 감시용 — 밖에서 살아 있는지 봐야 한다
  '/_next', // 화면을 그리는 파일들
  '/assets',
  '/uploads',
  '/favicon',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
  '/robots.txt',
  '/sitemap.xml',
]

function isOpenPath(pathname: string): boolean {
  return OPEN_PREFIX.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p))
}

/** 「준비 중」 한 장. 밖에 나가는 유일한 화면이라 ★스스로 완결★ 이어야 한다 (CSS 를 못 받아 온다) */
function noticePage(): string {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>SA CLOUD — 준비 중</title>
<style>
  :root { color-scheme: dark }
  html,body { margin:0; height:100%; }
  body {
    display:grid; place-items:center; padding:24px;
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
    color:#e9eefc;
    background:
      radial-gradient(1200px 700px at 50% -8%, #142238 0%, #0c1526 42%, #070d1c 100%);
  }
  .box {
    width:100%; max-width:420px; padding:34px 28px; border-radius:16px; text-align:center;
    border:1px solid #3a4870;
    background:
      radial-gradient(120% 90% at 0% 0%, rgba(122,162,255,.10), transparent 58%),
      radial-gradient(95% 75% at 100% 0%, rgba(196,132,252,.075), transparent 52%),
      linear-gradient(160deg, rgba(46,65,107,.58), rgba(32,48,82,.58));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.09), 0 12px 30px rgba(0,0,0,.42);
  }
  h1 { margin:0 0 10px; font-size:19px; letter-spacing:-.01em }
  p  { margin:0 0 6px; font-size:14px; line-height:1.7; color:#a9b6d6 }
  a  { display:inline-block; margin-top:18px; padding:10px 20px; border-radius:10px;
       font-size:13px; font-weight:700; text-decoration:none; color:#dbe8ff;
       border:1px solid rgba(127,169,255,.7); background:rgba(91,141,255,.12) }
</style>
</head><body>
  <div class="box">
    <h1>SA CLOUD 는 지금 비공개입니다</h1>
    <p>단장하는 중입니다. 곧 다시 엽니다.</p>
    <a href="/auth/login">로그인</a>
  </div>
</body></html>`
}

export function middleware(request: NextRequest) {
  /**
   * ⚠ ★2026-09-14 — 다시 잠갔다★ (사장님: «일단 사이트 비공개로 돌려»).
   *
   *   ★코드 기본값을 「잠금」 으로 둔다.★ 환경변수를 안 건드려도 잠긴다 —
   *   Vercel 대시보드를 열지 않고 배포만으로 잠글 수 있어야 해서다.
   *
   *   ⚠ 하루에 세 번 뒤집힌 자리다. 이력을 남긴다 —
   *     ① 2026-09-13 «비공개로 돌려»     → `SACLOUD_PUBLIC=1` 이 있어야 열림
   *     ② 2026-09-13 «다시 공개로»       → `SACLOUD_PRIVATE=1` 이 있어야 잠김
   *     ③ ★지금★  «일단 비공개로 돌려»  → 기본이 잠김
   *
   *   다시 열려면 — Vercel 환경변수에 `SACLOUD_PUBLIC=1` 을 넣거나,
   *   이 줄을 `process.env.SACLOUD_PRIVATE !== '1'` 로 되돌린다.
   *   잠긴 동안에도 로그인하면 사이트 전체가 그대로 보인다.
   */
  /*
   * ⚠ ★2026-09-21 — 다시 열었다★ (사장님: 「★공개로 돌려★ 빨리 돌려」).
   *
   *   ④ ★지금★ «공개로 돌려» → ★기본이 열림★. 환경변수가 없어도 열린다.
   *
   *   ★Vercel 대시보드 없이 배포만으로 열 수 있어야 한다★ — 그것이 ②에서
   *   스위치를 뒤집은 이유였고, ③에서 기본값을 잠금으로 되돌리면서 그 장점을
   *   잃었다. 이제 ★문을 코드에서 끈다.★
   *
   * ⚠ ★문 자체는 한 줄도 안 지웠다★ (`CLAUDE.md` 1-4) —
   *   아래 `SITE_PRIVATE` 를 `true` 로 두면 즉시 잠기고,
   *   `SACLOUD_PRIVATE=1` 환경변수로도 잠근다. 잠긴 동안에도 로그인하면 다 보인다.
   */
  if (!SITE_PRIVATE && process.env.SACLOUD_PRIVATE !== '1') {
    return NextResponse.next()
  }
  if (process.env.SACLOUD_PUBLIC === '1') {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  if (isOpenPath(pathname)) return NextResponse.next()

  /* 로그인한 사람은 그대로 통과 */
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next()

  /* 검색엔진에게는 «지금 담기지 마라» 라고 분명히 말한다 (503 + noindex) */
  return new NextResponse(noticePage(), {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'retry-after': '3600',
    },
  })
}

export const config = {
  /*
   * 정적 파일은 미들웨어를 아예 안 거치게 한다 — 「준비 중」 한 장도 못 그리면 안 된다.
   * (그래도 `isOpenPath` 에 같은 길을 남겨 둔다. 두 곳이 어긋나도 화면이 깨지지 않게)
   */
  /*
   * ⚠ ★`api/` 를 뺐다★ (2026-09-13 · 사장님: «사이트가 좀 느려진거같아»).
   *   문이 열려 있어도 미들웨어가 걸린 길은 ★Edge 를 한 번 더 거친다.★
   *   화면 하나가 API 를 여러 번 부르니 그 몫이 제일 크다.
   *   API 는 어차피 제 손으로 권한을 본다 (`requireAdmin` · `currentUserId`) —
   *   가림막이 없어도 ★남의 데이터가 새지 않는다.★ 가리는 것은 ★화면★ 이면 된다.
   */
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|assets/|uploads/).*)'],
}
