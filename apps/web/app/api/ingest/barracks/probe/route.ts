/**
 * **서울에서 병영수첩이 열리는가** — Vercel(icn1)에서 재는 탐침 (O-051 · 2026-09-03).
 *
 * ── 왜 이 자리인가
 *   ```
 *   집 IP (KR · 가정망)      ★200★
 *   GitHub 실행기            ★403★  (D-269)
 *   ★한국 데이터센터★         ★? — 아무도 안 재봤다★
 *   ```
 *   「막는 게 데이터센터냐 해외냐」가 안 갈렸다. 사장님이 오라클에 가입하려다
 *   **홈 리전에 한국이 없어서** 막혔다.
 *
 *   ★그런데 우리는 이미 서울에서 돌고 있다★ —
 *   `vercel.json` 의 `regions: ["icn1"]` (서울) · Supabase `ap-northeast-2` (서울).
 *   **가입도 카드도 필요 없다.** 여기서 재면 그 질문이 오늘 닫힌다.
 *
 * ── 무엇을 하나
 *   병영수첩에 **요청 두 건**을 보내고 **HTTP 상태와 크기만** 돌려준다.
 *   ★받은 내용을 저장하지 않는다.★ DB 를 한 줄도 안 건드린다.
 *
 * ── ⚠ 지키는 것
 *   · ★UA·쿠키·Referer 를 위조하지 않는다★ (`CLAUDE.md` 3-A 5번)
 *   · ★403 이면 그게 답이다.★ 다시 시도하지 않고 우회를 만들지 않는다
 *   · ★본문 `{}` 를 반드시 보낸다★ — 없으면 405 이고 그건 「막혔다」가 아니다 (D-268)
 *   · ★토큰이 없으면 404★ — 창구와 같은 규칙이다. 아무나 우리 서버로 남을 두드리게 두지 않는다
 *
 * ── ⚠ Node 런타임이라 403 일 수 있다
 *   D-268 실측 — ★같은 IP·같은 순간에 curl 200 / Node fetch 403★ 이었다.
 *   ★그래서 여기서 403 이 나오면 「서울이 막혔다」가 아니라 「Node 라서 막혔다」일 수 있다.★
 *   ★그 둘을 가르려고 두 건을 보낸다★ — 첫 페이지와 배틀로그. 둘의 답이 같으면 클라이언트 쪽이다.
 *   ★확정은 못 한다. 그 한계를 응답에 적어 돌려준다.★
 */
import { NextResponse } from 'next/server'

const ORIGIN = 'https://barracks.sa.nexon.com'

/** 토큰이 없으면 이 경로는 통째로 404 다 — 창구와 같은 규칙 */
function deny(request: Request): NextResponse | null {
  const token = process.env.BARRACKS_INGEST_TOKEN
  if (!token || token.length < 16) {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }
  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  }
  return null
}

interface Hit {
  id: string
  status: number | null
  bytes: number | null
  ms: number
  head: string | null
  error?: string
}

async function hit(id: string, path: string, body: string | null): Promise<Hit> {
  const started = Date.now()
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      method: body === null ? 'GET' : 'POST',
      /* ★헤더를 만들지 않는다★ — 본문의 모양을 알리는 것 하나뿐이다 */
      headers: body === null ? {} : { 'Content-Type': 'application/json' },
      body: body ?? undefined,
      cache: 'no-store',
    })
    const text = await res.text()
    return {
      id,
      status: res.status,
      bytes: text.length,
      ms: Date.now() - started,
      /* ★저장하지 않는다★ — 판단에 필요한 앞부분만 돌려준다 */
      head: text.slice(0, 120).replace(/\s+/g, ' '),
    }
  } catch (e) {
    return {
      id,
      status: null,
      bytes: null,
      ms: Date.now() - started,
      head: null,
      error: (e as Error).message,
    }
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const denied = deny(request)
  if (denied) return denied

  const home = await hit('home', '/', null)
  /* 원본에 숨 돌릴 틈을 준다 (D-266) */
  await new Promise((r) => setTimeout(r, 1500))
  const battlelog = await hit(
    'battlelog',
    '/api/BattleLog/GetBattleLogClan/260805205259124001/170430000194',
    '{}',
  )

  const ok = home.status === 200 && battlelog.status === 200
  return NextResponse.json(
    {
      where: 'vercel',
      region: process.env.VERCEL_REGION ?? null,
      requests: [home, battlelog],
      verdict: ok
        ? '★200 — 서울에서 열린다. 여기서 수집을 돌릴 수 있다★'
        : home.status === 403 || battlelog.status === 403
          ? '★403 — 막혔다. 다만 Node 런타임이라 「서울이 막혔다」가 아니라 「Node 라서」일 수 있다 (D-268)★'
          : '★200 도 403 도 아니다 — 아래 상태를 그대로 읽어라★',
      limits:
        'Node fetch 로 재는 것이라 curl 과 결과가 갈릴 수 있다 (D-268: 같은 IP·같은 순간에 curl 200 / Node 403). ' +
        '403 이면 이 탐침만으로는 IP 문제인지 클라이언트 문제인지 확정할 수 없다.',
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
