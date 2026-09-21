import { prisma } from '@sacloud/db'

import { log } from '../lib/log.js'

/**
 * ★★경기가 끝난 시각을 채운다★★ (2026-09-22 · 사장님 지시)
 *
 * > 「우리사이트에 찍힌 시간은 ★경기 시작시간★ 이야 ★경기 종료시간으로 맞춰★
 * >  병영수첩에 1시39분에 끝났다고 돼있잖아 저 시간으로 맞춰서 1시39분이라고 쓰고
 * >  지금 1시 57분이니까 ★18분전★ 으로 표시해야해」
 *
 * ── 우리가 쓰던 시각은 ★시작★ 이었다 (실측 2026-09-22)
 *
 *   ```
 *   경기 열쇠  260922012052124002   →  26-09-22 01:20:52   ← 우리가 쓰던 값(★시작★)
 *   병영 화면  2026.09.22 (01:39)                          ← 사장님이 보신 값(★끝★)
 *   ```
 *
 * ── 끝난 시각은 어디에 있나
 *
 *   경기 원문에 ★`match_time` 이 「31분 전」 처럼 상대시간★ 으로 들어 있다.
 *   그리고 그 상대시간의 기준은 ★끝난 시각★ 이다 — 실측으로 맞춰 봤다:
 *   ```
 *   주운 때 02:11:46  ·  match_time 「31분 전」
 *     → 끝 01:40:46      병영 화면 01:39   ★맞는다★
 *   ```
 *   `match_time_date` 는 ★0001-01-01 로 비어 온다★ — 쓸 수 없다.
 *
 * ── ⚠ ★분 단위로 말해 줄 때만 쓴다★
 *
 *   ```
 *   「방금 전」 「N분 전」   → ★쓴다★ (분 단위라 ±1분)
 *   「N시간 전」 「N일 전」  → ★안 쓴다★ — 한 시간 오차로 시각을 적을 수 없다
 *   ```
 *   못 쓰면 ★비워 둔다.★ 화면은 그때 시작 시각으로 되돌아간다 (D-106).
 *
 * ── 지키는 것
 *
 *   ⚠ ★이미 적힌 끝 시각은 안 덮는다★ — 더 정확한 값이 먼저 들어왔을 수 있다
 *   ⚠ ★시작보다 이른 끝은 안 적는다★ — 말이 안 되는 값은 버린다
 *   ⚠ ★너무 긴 경기는 안 적는다★ — 세 시간짜리 클랜전은 없다. 상대시간을 잘못 읽은 것이다
 *
 * ```
 * pnpm --filter @sacloud/worker nexon match-end-fill             # 미리보기
 * pnpm --filter @sacloud/worker nexon match-end-fill --confirm
 * ```
 */

/** 경기 하나가 이보다 길면 잘못 읽은 것이다 */
const MAX_MINUTES = 180

/** 시작보다 이 정도는 뒤여야 한다 — 0분짜리 경기는 없다 */
const MIN_MINUTES = 1

export interface MatchEndFillResult {
  /** 끝 시각이 빈 경기 */
  missing: number
  /** 분 단위로 읽어 낼 수 있던 경기 */
  readable: number
  /** 실제로 적은 경기 */
  filled: number
  /** 상대시간이 너무 성겨서(시간·일) 못 적은 경기 */
  tooCoarse: number
  /** 말이 안 되는 값이라 버린 경기 */
  rejected: number
  confirmed: boolean
  samples: string[]
}

/**
 * 「31분 전」 → 31. 「방금 전」 → 0.
 *
 * ★분 단위가 아니면 `null`★ — 시간·일은 시각을 적기에 너무 성기다.
 * 모르는 말도 `null` 이다. 지어내지 않는다.
 */
export function minutesAgoOf(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  const s = text.trim()
  if (s === '') return null
  if (s.startsWith('방금')) return 0
  const m = /^(\d+)\s*분/.exec(s)
  if (m === null) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

interface Row {
  id: string
  startat: Date
  fetchedat: Date
  match_time: string | null
}

export async function runMatchEndFill(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<MatchEndFillResult> {
  const confirm = options.confirm ?? false
  const limit = options.limit ?? 5000

  const result: MatchEndFillResult = {
    missing: 0,
    readable: 0,
    filled: 0,
    tooCoarse: 0,
    rejected: 0,
    confirmed: confirm,
    samples: [],
  }

  /*
   * 끝 시각이 빈 경기마다 ★가장 먼저 주운 원문★ 을 붙인다.
   * 먼저 주운 것일수록 상대시간이 촘촘하다 (「3분 전」 이 「2시간 전」 보다 낫다).
   *
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   */
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT m."id",
           m."startAt"   AS startat,
           r."fetchedAt" AS fetchedat,
           r."payload"->>'match_time' AS match_time
      FROM "Match" m
      JOIN LATERAL (
        SELECT r2."fetchedAt", r2."payload"
          FROM "BarracksClanMatchRaw" r2
         WHERE r2."matchKey" = m."sourceMatchId"
         ORDER BY r2."fetchedAt" ASC
         LIMIT 1
      ) r ON TRUE
     WHERE m."supersededAt" IS NULL
       AND m."endAt" IS NULL
       AND m."startAt" > NOW() - INTERVAL '60 days'
     LIMIT ${limit}
  `
  result.missing = rows.length

  const updates: { id: string; endAt: Date }[] = []
  for (const row of rows) {
    const ago = minutesAgoOf(row.match_time)
    if (ago === null) {
      result.tooCoarse += 1
      continue
    }
    result.readable += 1
    const end = new Date(row.fetchedat.getTime() - ago * 60_000)
    const lenMin = (end.getTime() - row.startat.getTime()) / 60_000
    if (lenMin < MIN_MINUTES || lenMin > MAX_MINUTES) {
      /* ★말이 안 되는 값은 버린다★ — 비워 두는 편이 낫다 (D-106) */
      result.rejected += 1
      continue
    }
    updates.push({ id: row.id, endAt: end })
    if (result.samples.length < 10) {
      result.samples.push(
        `${row.startat.toISOString().slice(11, 16)} 시작 → ${end
          .toISOString()
          .slice(11, 16)} 끝 (${Math.round(lenMin)}분)`,
      )
    }
  }

  if (confirm) {
    /* 한 번에 다 쓰면 잠금을 오래 쥔다 — 200개씩 끊는다 */
    for (let i = 0; i < updates.length; i += 200) {
      const part = updates.slice(i, i + 200)
      await prisma.$transaction(
        part.map((u) =>
          prisma.match.update({ where: { id: u.id }, data: { endAt: u.endAt } }),
        ),
      )
      result.filled += part.length
    }
  }

  log(
    `경기 끝 시각 — 빈 경기 ${result.missing} · 읽어냄 ${result.readable} · ` +
      `적음 ${result.filled} · 너무성김 ${result.tooCoarse} · 버림 ${result.rejected}` +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
