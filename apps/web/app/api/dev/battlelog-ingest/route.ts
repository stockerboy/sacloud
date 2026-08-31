/**
 * **개발 전용** 배틀로그 전수수집 창구 — 묶음 적재 + 작업목록 배급 (D-218).
 *
 * ── 왜 새로 만들었나 (`/api/dev/barracks-ingest` 가 이미 있는데)
 *   그쪽은 **한 번에 한 건**이고, 저장 모양이 CLI 적재기와 다르다:
 *   ```
 *   barracks-ingest   payload = { source, matchKey, clanNo, raw }   ← 원문을 한 겹 싸서 넣는다
 *                     payloadHash = sha256(JSON.stringify(raw))     ← 키 순서를 안 맞춘다
 *   CLI(D-174)        payload = 원문 그대로
 *                     payloadHash = contentHash(원문)               ← 키를 정렬해서 해시한다
 *   ```
 *   그래서 같은 응답이 두 경로로 들어오면 **행이 두 개** 생기고, 감싸 넣은 쪽은
 *   `eventsOf()` 가 `battleLog` 를 못 찾아 **포지션·라운드 집계에서 통째로 빠진다.**
 *   이 창구는 **CLI 쪽 모양에 맞춘다.** 옛 창구는 지우지 않는다 (`CLAUDE.md` 10-4).
 *
 * ── 왜 파일이 아니라 POST 인가
 *   브라우저 다운로드는 이름을 우리가 못 정한다. 실측: 수집 파일 115개가
 *   `C:\Users\LG\Downloads\<GUID>.tmp` 로 쌓여 어느 것이 무엇인지 알 수 없었다.
 *   배틀로그는 파일이 수백 개다 — 그대로 가면 반드시 샌다. 그래서 브라우저가
 *   **묶음마다 여기로 바로 보낸다.** 중단돼도 보낸 것은 이미 DB 에 있다.
 *
 * ── 안전 장치
 *   · `NODE_ENV === 'production'` 이면 **404**. 운영 빌드에 살아 있으면 인증 없는 쓰기 구멍이다
 *   · 로컬 DB 를 볼 때만 연다. 운영 DB 를 보고 있으면 403
 *   · CORS 는 `https://barracks.sa.nexon.com` **하나만**
 *   · 본문 상한 24MB. 넘으면 400
 *   · 원문을 **그대로** 저장한다. 가공은 나중에 한다 (`CLAUDE.md` 3-A 1번)
 *   · 같은 응답을 다시 넣어도 행이 늘지 않는다 (멱등)
 */
import { NextResponse } from 'next/server'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { contentHash } from '@sacloud/nexon'

const ORIGIN = 'https://barracks.sa.nexon.com'
/** 본문 상한. 경기 하나가 90KB 안팎이라 200건이 넘어도 안 걸린다 */
const MAX_BODY_BYTES = 24 * 1024 * 1024
/** 작업목록이 놓이는 곳 (`apps/worker/src/dev/battlelogWorklist.ts` 가 쓴다) */
const WORKLIST_DIR = join(process.cwd(), '..', '..', 'data', 'barracks', 'battlelog-worklist')

/** 이 창구를 열어도 되는 상황인가 */
function refuse(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }
  const url = process.env.DATABASE_URL ?? ''
  const local = url.includes('127.0.0.1') || url.includes('localhost') || url.includes('[::1]')
  if (!local) {
    return NextResponse.json({ message: '로컬 DB 가 아니다' }, { status: 403, headers: cors })
  }
  return null
}

/**
 * CORS + **Private Network Access**.
 *
 * 크롬은 공개 사이트(`https://barracks…`)가 내부 주소(`127.0.0.1`)로 요청하는 것을
 * 기본으로 막는다 — CORS 오류조차 없이 `TypeError: Failed to fetch` 다.
 * 열려면 사전 요청에 `Access-Control-Allow-Private-Network: true` 로 답해야 한다.
 * 이건 브라우저가 정한 절차지 우회가 아니다.
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

/* ==================================================== 작업목록 배급 === */

/**
 * `GET ?list=index`            어떤 파일이 몇 건인지
 * `GET ?list=p1-001`           그 조각의 짝 목록
 * `GET ?list=next`             아직 안 끝난 것 중 가장 앞선 조각 (우선순위 순)
 *
 * 파일을 브라우저에 손으로 붙여 넣지 않아도 되게 하려고 둔 것이다.
 * 파일이 없으면 404 를 준다 — 지어내지 않는다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = refuse()
  if (denied) return denied

  const params = new URL(request.url).searchParams
  const list = params.get('list')

  if (!list) {
    /* 진행 현황만 준다 */
    const rows = await prisma.barracksBattleLogRaw.count({ where: { subjectKind: 'clan' } })
    const matches = await prisma.barracksBattleLogRaw.findMany({
      where: { subjectKind: 'clan' },
      select: { matchKey: true },
      distinct: ['matchKey'],
    })
    return NextResponse.json({ clanRows: rows, matches: matches.length }, { headers: cors })
  }

  if (!existsSync(WORKLIST_DIR)) {
    return NextResponse.json(
      { message: '작업목록이 없다. battlelogWorklist.ts 를 먼저 돌려라' },
      { status: 404, headers: cors },
    )
  }

  if (list === 'index') {
    const file = join(WORKLIST_DIR, 'index.json')
    if (!existsSync(file)) {
      return NextResponse.json({ message: 'index.json 이 없다' }, { status: 404, headers: cors })
    }
    return new NextResponse(readFileSync(file, 'utf8'), {
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  /* `next` 는 파일 이름을 사전순으로 골라 준다 (p1-001 → p1-002 → … → p4-xxx).
     "어디까지 했나" 는 브라우저가 안다 — 서버는 파일만 준다 */
  const name =
    list === 'next'
      ? (readdirSync(WORKLIST_DIR)
          .filter((f) => /^p\d-\d{3}\.json$/.test(f))
          .sort()[0] ?? null)
      : /^p\d-\d{3}$/.test(list)
        ? `${list}.json`
        : null
  if (!name) {
    return NextResponse.json({ message: '조각 이름이 이상하다' }, { status: 400, headers: cors })
  }
  const file = join(WORKLIST_DIR, name)
  if (!existsSync(file)) {
    return NextResponse.json({ message: `${name} 이 없다` }, { status: 404, headers: cors })
  }
  return new NextResponse(readFileSync(file, 'utf8'), {
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

/* ========================================================== 묶음 적재 === */

interface IngestRow {
  matchKey?: string
  match_key?: string
  /** 클랜번호. 이 창구는 **클랜 단위 응답만** 받는다 */
  clanNo?: string
  subject?: string
  endpoint?: string
  /** 넥슨이 준 응답 그대로 */
  raw?: unknown
}

interface IngestBody {
  rows?: IngestRow[]
  failures?: unknown[]
}

/** 응답이 클랜 단위인가 — 응답 자신이 가진 `teamList` 로 가른다 (D-184) */
function isClanResponse(raw: unknown): boolean {
  return (
    raw !== null && typeof raw === 'object' && Array.isArray((raw as { teamList?: unknown }).teamList)
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = refuse()
  if (denied) return denied

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { message: `본문이 너무 크다 (${text.length} > ${MAX_BODY_BYTES})` },
      { status: 400, headers: cors },
    )
  }

  let parsed: IngestBody | IngestRow[]
  try {
    parsed = JSON.parse(text) as IngestBody | IngestRow[]
  } catch {
    return NextResponse.json({ message: '본문을 읽지 못했다' }, { status: 400, headers: cors })
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? [])
  if (!Array.isArray(rows)) {
    return NextResponse.json({ message: 'rows 가 배열이 아니다' }, { status: 400, headers: cors })
  }

  let inserted = 0
  let duplicated = 0
  let skipped = 0
  /** 응답의 `teamList` 에서 배운 클랜번호. 스니펫이 이걸로 상대를 이어 받는다 */
  const learned: Record<string, string[]> = {}

  for (const row of rows) {
    const matchKey = row.matchKey ?? row.match_key
    const subject = row.clanNo ?? row.subject
    const raw = row.raw
    if (!matchKey || !subject || raw === null || typeof raw !== 'object') {
      /* 주인이나 경기를 모르는 원문은 넣지 않는다. 키를 추측해서 만들지 않는다 */
      skipped += 1
      continue
    }

    const teamList = (raw as { teamList?: { clan_no?: string }[] }).teamList ?? []
    const nos = teamList.map((t) => t?.clan_no).filter((v): v is string => Boolean(v))
    if (nos.length > 0) learned[String(matchKey)] = nos

    /* **CLI 적재기와 같은 해시·같은 모양.** 안 그러면 같은 응답이 두 행이 된다 */
    const payloadHash = contentHash(raw)
    const key = {
      matchKey: String(matchKey),
      subject: String(subject),
      payloadHash,
    }
    const existing = await prisma.barracksBattleLogRaw.findUnique({
      where: { matchKey_subject_payloadHash: key },
      select: { id: true },
    })
    if (existing) {
      await prisma.barracksBattleLogRaw.update({
        where: { id: existing.id },
        data: { fetchCount: { increment: 1 } },
      })
      duplicated += 1
      continue
    }
    await prisma.barracksBattleLogRaw.create({
      data: {
        source: 'nexon_barracks',
        endpoint:
          row.endpoint ?? `/api/BattleLog/GetBattleLogClan/${String(matchKey)}/${String(subject)}`,
        ...key,
        subjectKind: isClanResponse(raw) ? 'clan' : 'user',
        payload: raw as object,
        status: 'ok',
      },
    })
    inserted += 1
  }

  return NextResponse.json(
    { received: rows.length, inserted, duplicated, skipped, learned },
    { headers: cors },
  )
}
