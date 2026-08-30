/**
 * **개발 전용** 병영수첩 배틀로그 수집 창구 (D-200).
 *
 * ── 왜 이런 게 필요한가
 *   병영수첩은 서버에서 부르면 **403** 이다 (AWS WAF 봇차단 · 실측 확인).
 *   브라우저에서 부르면 200 이 온다 — 그건 우회가 아니라 **브라우저가 하는 정상 요청**이다
 *   (`CLAUDE.md` 3-A 5번 · D-174 와 같은 판단).
 *
 *   그런데 브라우저는 파일을 못 쓴다. 그래서 이 창구가 필요하다:
 *
 *   ```
 *   브라우저 ── GET  /api/dev/barracks-ingest  ─→ "이 경기들을 받아와라" 목록
 *            ── (넥슨에서 fetch) ─→ 원문
 *            ── POST /api/dev/barracks-ingest ─→ 원문을 그대로 저장
 *   ```
 *
 * ── 안전 장치
 *   · **운영에서는 아예 동작하지 않는다.** `NODE_ENV === 'production'` 이면 404 다
 *   · 로컬(127.0.0.1 · localhost) DB 를 볼 때만 연다 — 운영 DB 를 보고 있으면 거부한다
 *   · CORS 는 병영수첩 오리진에만 연다. 아무 사이트나 이 창구를 두드리지 못한다
 *   · **원문을 그대로 저장한다.** 가공은 나중에 한다 (`CLAUDE.md` 3-A 1번)
 *   · 같은 응답을 다시 넣어도 행이 늘지 않는다 (`payloadHash` 유니크 · 멱등)
 */
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { prisma } from '@sacloud/db'

const ORIGIN = 'https://barracks.sa.nexon.com'

/** 이 창구를 열어도 되는 상황인가 */
function refuse(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }
  const url = process.env.DATABASE_URL ?? ''
  const local = url.includes('127.0.0.1') || url.includes('localhost') || url.includes('[::1]')
  if (!local) {
    /* 운영 DB 를 보고 있으면 절대 쓰지 않는다 */
    return NextResponse.json({ message: '로컬 DB 가 아니다' }, { status: 403 })
  }
  return null
}

/**
 * CORS + **Private Network Access**.
 *
 * 크롬은 공개 사이트(`https://barracks…`)가 내부 주소(`127.0.0.1`)로 요청하는 것을
 * 기본으로 막는다. 실측: `TypeError: Failed to fetch` — CORS 오류조차 안 뜨고 그냥 막힌다.
 *
 * 열려면 **사전 요청에 `Access-Control-Allow-Private-Network: true` 로 답해야** 한다.
 * 이건 브라우저가 정한 절차지 우회가 아니다 — 내부 서버가 스스로 "받겠다" 고 밝히는 것이다.
 * 그리고 이 창구는 애초에 개발 전용이고 로컬 DB 를 볼 때만 열린다.
 */
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '600',
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: cors })
}

/**
 * 받아올 목록을 준다 — `{ matchKey, clanNo }` 짝.
 *
 * 아직 안 받은 경기 중에서, **클랜 번호를 아는 클랜**이 뛴 것만 준다.
 * 클랜 번호는 이미 받은 응답의 `teamList` 에서 나오므로, 받을수록 목록이 넓어진다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = refuse()
  if (denied) return denied

  const limit = Math.min(500, Number(new URL(request.url).searchParams.get('limit') ?? 200))

  const done = new Set(
    (
      await prisma.barracksBattleLogRaw.findMany({
        where: { subjectKind: 'clan' },
        select: { matchKey: true },
      })
    ).map((row) => row.matchKey),
  )

  /* clan_no ↔ 우리 LeagueClan — 이미 받은 응답에서 배운 것만 쓴다 */
  const known = await prisma.barracksClanNumber.findMany({
    select: { clanNo: true, clanId: true },
  })
  if (known.length === 0) return NextResponse.json({ pairs: [] }, { headers: cors })

  const clanIds = known.map((row) => row.clanId)
  const leagueClans = await prisma.leagueClan.findMany({
    where: { clanId: { in: clanIds } },
    select: { id: true, clanId: true },
  })
  const clanOfLeagueClan = new Map(leagueClans.map((row) => [row.id, row.clanId]))
  const noOfClan = new Map(known.map((row) => [row.clanId, row.clanNo]))

  const matches = await prisma.match.findMany({
    where: {
      sourceMatchId: { not: null },
      OR: [
        { redLeagueClanId: { in: [...clanOfLeagueClan.keys()] } },
        { blueLeagueClanId: { in: [...clanOfLeagueClan.keys()] } },
      ],
    },
    select: { sourceMatchId: true, redLeagueClanId: true, blueLeagueClanId: true },
    orderBy: { startAt: 'desc' },
    take: limit * 6,
  })

  const pairs: { matchKey: string; clanNo: string }[] = []
  for (const match of matches) {
    const key = match.sourceMatchId
    if (!key || done.has(key)) continue
    const clanId =
      clanOfLeagueClan.get(match.redLeagueClanId) ?? clanOfLeagueClan.get(match.blueLeagueClanId)
    const clanNo = clanId ? noOfClan.get(clanId) : undefined
    if (!clanNo) continue
    pairs.push({ matchKey: key, clanNo })
    if (pairs.length >= limit) break
  }

  return NextResponse.json({ pairs, knownClans: known.length }, { headers: cors })
}

interface IngestBody {
  matchKey?: string
  clanNo?: string
  /** 넥슨이 준 응답 그대로 */
  raw?: unknown
}

/** 원문을 **그대로** 저장하고, 거기서 배운 클랜 번호도 함께 적어 둔다 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = refuse()
  if (denied) return denied

  let body: IngestBody
  try {
    body = (await request.json()) as IngestBody
  } catch {
    return NextResponse.json({ message: '본문을 읽지 못했다' }, { status: 400, headers: cors })
  }

  const { matchKey, clanNo, raw } = body
  if (!matchKey || !clanNo || typeof raw !== 'object' || raw === null) {
    return NextResponse.json({ message: 'matchKey · clanNo · raw 가 필요하다' }, { status: 400, headers: cors })
  }

  const payload = { source: 'nexon_barracks', matchKey, clanNo, raw }
  const payloadHash = createHash('sha256').update(JSON.stringify(raw)).digest('hex')

  await prisma.barracksBattleLogRaw.upsert({
    where: { matchKey_subject_payloadHash: { matchKey, subject: clanNo, payloadHash } },
    update: { fetchCount: { increment: 1 } },
    create: {
      endpoint: `/api/BattleLog/GetBattleLogClan/${matchKey}/${clanNo}`,
      matchKey,
      subject: clanNo,
      subjectKind: 'clan',
      payload,
      payloadHash,
    },
  })

  /* 응답의 `teamList` 가 **상대 클랜 번호**를 알려 준다. 받을수록 목록이 넓어진다 */
  const teamList = (raw as { teamList?: { clan_no?: string }[] }).teamList ?? []
  const learned = teamList.map((row) => row.clan_no).filter((v): v is string => Boolean(v))

  return NextResponse.json({ ok: true, learned }, { headers: cors })
}
