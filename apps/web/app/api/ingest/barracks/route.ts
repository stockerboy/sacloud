/**
 * 병영수첩 **수집 창구 (운영)** — 2026-09-02.
 *
 * ── 왜 만들었나
 *   병영수첩은 **서버에서 부르면 403** 이다 (2026-09-02 재측정: 첫 페이지조차 403).
 *   헤더를 위조해 뚫지 않는다 (`CLAUDE.md` 3-A 5번). 그래서 **진짜 브라우저**가
 *   부르는 수밖에 없고, 그 브라우저가 받은 것을 **어딘가로 보내야** 한다.
 *
 *   기존 `/api/dev/battlelog-ingest` 는 그 자리였지만 **개발 전용**이다 —
 *   `NODE_ENV === 'production'` 이면 404 이고 로컬 DB 가 아니면 403 이다.
 *   그리고 이 컴퓨터는 보안 프로그램이 `listen` 을 막아 **로컬 서버가 아예 안 뜬다**
 *   (`listen EFAULT` · 포트 5개 전부 실패). 브라우저가 보낼 곳이 없다.
 *
 *   결론: **운영에 창구를 둔다.** 그러면 두 가지가 한 번에 풀린다.
 *   ```
 *   지금   사람의 브라우저가 밀린 분을 보낸다
 *   앞으로 상시 켜 둔 서버(VPS)의 크롬이 15분마다 보낸다   ← 같은 창구를 쓴다
 *   ```
 *
 * ── ★인증★
 *   `Authorization: Bearer <BARRACKS_INGEST_TOKEN>` 이 맞아야 한다.
 *   토큰이 **환경변수에 없으면 이 경로는 통째로 404** 다 — 실수로 열려 있는 상태를
 *   만들지 않기 위해서다. 없는 기능은 있는 척하지 않는다.
 *
 *   ⚠ 이건 **쓰기 창구**다. 토큰이 새면 원문 표에 아무나 쓸 수 있다.
 *   그래서 `payload` 를 **가공 없이 그대로** 넣기만 하고, 다른 표는 한 줄도 안 건드린다.
 *   투영(라인업 만들기)은 별도 잡이 사람이 부를 때만 돈다.
 *
 * ── 저장 모양은 **CLI 적재기와 똑같다** (D-174 · D-218)
 *   `payload` = 원문 그대로 · `payloadHash` = `contentHash(원문)`(키 정렬).
 *   한 겹 싸서 넣거나 해시 방식이 다르면 **같은 응답이 두 행**이 되고,
 *   감싼 쪽은 `eventsOf()` 가 `battleLog` 를 못 찾아 집계에서 통째로 빠진다.
 *   그 사고가 실제로 있었다 (`/api/dev/barracks-ingest` 머리말).
 *
 * ── 두 종류를 받는다
 *   ```
 *   kind: 'battlelog'   POST /api/BattleLog/GetBattleLogClan/{matchKey}/{clanNo}
 *                       → BarracksBattleLogRaw   (양 팀 10명의 킬·데스·좌표)
 *   kind: 'matchlist'   POST /api/ClanHome/GetClanMatchList/  body { clan_id: slug }
 *                       → BarracksClanMatchRaw   (무엇을 받아야 하는지의 재료)
 *   ```
 *   매치목록이 운영에 **0행**이라 「무엇이 밀렸는지」를 계산할 수 없었다. 그래서 같이 받는다.
 *
 * ── 멱등
 *   같은 응답을 두 번 보내도 행이 늘지 않는다. 두 번째부터는 `fetchCount` 만 올린다.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@sacloud/db'
import { contentHash } from '@sacloud/nexon'

const SOURCE = 'nexon_barracks'
const ORIGIN = 'https://barracks.sa.nexon.com'
/** 경기 하나가 90KB 안팎. 200건이 넘어도 안 걸린다 */
const MAX_BODY_BYTES = 24 * 1024 * 1024

const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Max-Age': '600',
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: cors })
}

/**
 * 열려 있어도 되는 상황인가.
 *
 * 토큰이 **설정돼 있지 않으면 404** 다 — 「인증이 필요합니다」라고 알려 주지도 않는다.
 * 있는지 없는지를 알려 주는 것부터가 정보다.
 */
function deny(request: Request): NextResponse | null {
  const token = process.env.BARRACKS_INGEST_TOKEN
  if (!token || token.length < 16) {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }
  const given = request.headers.get('authorization') ?? ''
  if (given !== `Bearer ${token}`) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401, headers: cors })
  }
  return null
}

/* ============================================================== 현황 === */

/** 얼마나 받았나. 브라우저가 「무엇이 밀렸는지」를 물어보는 자리이기도 하다 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = deny(request)
  if (denied) return denied

  const [battlelogRows, matchListRows] = await Promise.all([
    prisma.barracksBattleLogRaw.count({ where: { subjectKind: 'clan' } }),
    prisma.barracksClanMatchRaw.count(),
  ])
  return NextResponse.json({ battlelogRows, matchListRows }, { headers: cors })
}

/* ============================================================== 적재 === */

interface IngestRow {
  /** `battlelog` (기본) · `matchlist` */
  kind?: 'battlelog' | 'matchlist'
  matchKey?: string
  /** 배틀로그면 클랜번호, 매치목록이면 클랜 slug */
  subject?: string
  endpoint?: string
  /** 넥슨이 준 응답 **그대로** */
  raw?: unknown
}

/** 응답이 클랜 단위인가 — 응답 자신이 가진 `teamList` 로 가른다 (D-184) */
function isClanResponse(raw: unknown): boolean {
  return raw !== null && typeof raw === 'object' && Array.isArray((raw as { teamList?: unknown }).teamList)
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = deny(request)
  if (denied) return denied

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { message: `본문이 너무 크다 (${text.length} > ${MAX_BODY_BYTES})` },
      { status: 400, headers: cors },
    )
  }

  let rows: IngestRow[]
  try {
    const parsed = JSON.parse(text) as { rows?: IngestRow[] } | IngestRow[]
    rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? [])
  } catch {
    return NextResponse.json({ message: '본문을 읽지 못했다' }, { status: 400, headers: cors })
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ message: 'rows 가 배열이 아니다' }, { status: 400, headers: cors })
  }

  let inserted = 0
  let duplicated = 0
  let skipped = 0
  /** 응답의 `teamList` 에서 배운 클랜번호 — 상대를 이어 받을 때 쓴다 */
  const learned: Record<string, string[]> = {}

  for (const row of rows) {
    const raw = row.raw
    if (raw === null || typeof raw !== 'object') {
      skipped += 1
      continue
    }
    const kind = row.kind ?? 'battlelog'

    if (kind === 'matchlist') {
      /* 매치목록은 **한 응답에 여러 경기**가 들어 있다. 경기마다 한 행으로 편다 —
         `BarracksClanMatchRaw` 가 경기 단위 표이기 때문이다 */
      const result = (raw as { result?: unknown }).result
      if (!Array.isArray(result)) {
        skipped += 1
        continue
      }
      for (const item of result) {
        const key = (item as { match_key?: string })?.match_key
        if (!key) {
          skipped += 1
          continue
        }
        const payloadHash = contentHash(item as object)
        const unique = { matchKey: String(key), subject: String(row.subject ?? ''), payloadHash }
        const existing = await prisma.barracksClanMatchRaw.findUnique({
          where: { matchKey_subject_payloadHash: unique },
          select: { id: true },
        })
        if (existing) {
          await prisma.barracksClanMatchRaw.update({
            where: { id: existing.id },
            data: { fetchCount: { increment: 1 } },
          })
          duplicated += 1
          continue
        }
        await prisma.barracksClanMatchRaw.create({
          data: {
            source: SOURCE,
            endpoint: row.endpoint ?? '/api/ClanHome/GetClanMatchList/',
            ...unique,
            payload: item as object,
            status: 'ok',
          },
        })
        inserted += 1
      }
      continue
    }

    /* ── 배틀로그 */
    const matchKey = row.matchKey
    const subject = row.subject
    if (!matchKey || !subject) {
      /* 주인이나 경기를 모르는 원문은 넣지 않는다. 키를 추측해서 만들지 않는다 */
      skipped += 1
      continue
    }
    const teamList = (raw as { teamList?: { clan_no?: string }[] }).teamList ?? []
    const nos = teamList.map((t) => t?.clan_no).filter((v): v is string => Boolean(v))
    if (nos.length > 0) learned[String(matchKey)] = nos

    const payloadHash = contentHash(raw)
    const unique = { matchKey: String(matchKey), subject: String(subject), payloadHash }
    const existing = await prisma.barracksBattleLogRaw.findUnique({
      where: { matchKey_subject_payloadHash: unique },
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
        source: SOURCE,
        endpoint:
          row.endpoint ?? `/api/BattleLog/GetBattleLogClan/${String(matchKey)}/${String(subject)}`,
        ...unique,
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
