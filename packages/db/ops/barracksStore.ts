/**
 * **병영수첩 원문을 표에 넣는다** — 창구와 CLI 가 **같은 함수**를 쓴다 (O-051 · 2026-09-03).
 *
 * ══ 왜 여기로 옮겼나 ══
 *
 * 이 로직은 `apps/web/app/api/ingest/barracks/route.ts` 안에만 있었다.
 * 그런데 O-051 이 **사람 손 없이 긁는 CLI** 를 요구한다 — 그 CLI 도 같은 모양으로 넣어야 한다.
 *
 * ★복사하면 두 벌이 된다.★ 그리고 저장 모양이 한 끗이라도 갈리면 —
 * ```
 * 한 겹 싸서 넣으면   `eventsOf()` 가 `battleLog` 를 못 찾아 ★집계에서 통째로 빠진다★
 * 해시가 다르면      같은 응답이 ★두 행★ 이 된다
 * ```
 * ★그 사고가 실제로 있었다★ (`/api/dev/barracks-ingest` 머리말 · D-174 · D-218).
 * 그래서 ★옮겼다.★ 창구는 이제 이 함수를 부르기만 한다.
 *
 * ══ 멱등 ══
 *
 * 같은 응답을 두 번 넣어도 ★행이 안 는다.★ 두 번째부터는 `fetchCount` 만 올린다.
 * 유일 키는 `(matchKey, subject, payloadHash)` 다.
 */
import { prisma } from '../src/index'
import { contentHash } from '@sacloud/nexon'

const SOURCE = 'nexon_barracks'

/** 넣을 것 하나 — 넥슨 응답 **그대로** 와 그것이 무엇인지 */
export interface BarracksRow {
  /** `battlelog` (기본) · `matchlist` */
  kind?: 'battlelog' | 'matchlist'
  matchKey?: string
  /** 배틀로그면 클랜번호, 매치목록이면 클랜 slug */
  subject?: string
  endpoint?: string
  /** 넥슨이 준 응답 **그대로**. 한 겹 싸지 않는다 */
  raw?: unknown
}

export interface BarracksStoreResult {
  received: number
  inserted: number
  duplicated: number
  skipped: number
  /** 응답의 `teamList` 에서 배운 클랜번호 — 상대를 이어 받을 때 쓴다 */
  learned: Record<string, string[]>
}

/** 응답이 클랜 단위인가 — ★응답 자신이 가진 `teamList` 로 가른다★ (D-184) */
function isClanResponse(raw: unknown): boolean {
  return (
    raw !== null && typeof raw === 'object' && Array.isArray((raw as { teamList?: unknown }).teamList)
  )
}

/**
 * 원문 행들을 표에 넣는다.
 *
 * ⚠ ★`payload` 를 가공하지 않는다.★ 넥슨이 준 그대로 넣는다 —
 *   투영(라인업 만들기)은 ★다른 잡★ 이 한다. 여기서 하면 원문이 원문이 아니게 된다.
 */
export async function storeBarracksRows(rows: readonly BarracksRow[]): Promise<BarracksStoreResult> {
  let inserted = 0
  let duplicated = 0
  let skipped = 0
  const learned: Record<string, string[]> = {}

  for (const row of rows) {
    const raw = row.raw
    if (raw === null || typeof raw !== 'object') {
      skipped += 1
      continue
    }
    const kind = row.kind ?? 'battlelog'

    if (kind === 'matchlist') {
      /* 매치목록은 ★한 응답에 여러 경기★ 가 들어 있다. 경기마다 한 행으로 편다 —
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
      /* ★주인이나 경기를 모르는 원문은 넣지 않는다.★ 키를 추측해서 만들지 않는다 */
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

  return { received: rows.length, inserted, duplicated, skipped, learned }
}
