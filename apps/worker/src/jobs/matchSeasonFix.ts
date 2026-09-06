/**
 * ★★Match.seasonId 를 경기 시각 기준으로 바로잡는다★★ (2026-09-06 · Part 5 · 사장님 지시).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon match-season-fix                    # 미리보기
 * pnpm --filter @sacloud/worker nexon match-season-fix --backup out.jsonl # 되돌리기 자료만
 * pnpm --filter @sacloud/worker nexon match-season-fix --backup out.jsonl --confirm
 * ```
 *
 * ── 무엇을 고치나
 *   > «leagueId · sourceMatchId · 경기 내용 · 선수 기록 · 경기 시각은 그대로 두고
 *   >  ★그 경기가 어느 시즌에 속하는지만★ 바로잡는 작업이다» — 사장님
 *
 *   실측(2026-09-06)에서 두 가지가 어긋나 있었다.
 *   ```
 *   기준시각 이전인데 Cloud 0 이 붙은 경기   35,796건
 *   기준시각 이후인데 seasonId 가 빈 경기       655건
 *   ```
 *
 * ── ★규칙은 하나뿐이다★ (사장님 지시)
 *   `seasonWindowAt(startAt)` — `packages/contract/src/seasonWindow.ts` 의 그 함수다.
 *   ★화면이 쓰는 창과 같은 값★ 이라 DB 와 화면이 서로 다른 기준을 가질 수 없다.
 *
 * ── 안전
 *   · `--confirm` 없이는 ★한 줄도 쓰지 않는다★
 *   · `--confirm` 은 ★`--backup` 없이는 거부한다★ — 되돌릴 수 없는 변경을 막는다
 *   · `Match` 의 ★다른 칸은 손대지 않는다★ (`seasonId` 하나만 쓴다)
 *   · 어느 창에도 안 들거나 그 리그에 그 시즌 행이 없으면 ★건드리지 않고 센다★
 */
import { appendFileSync, writeFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import { seasonWindowAt } from '@sacloud/contract'
import { log, warn } from '../lib/log.js'

/** 한 번에 읽는 경기 수. 39만 건을 한꺼번에 들면 메모리가 터진다 */
const PAGE = 20_000

export interface MatchSeasonFixResult {
  /** 훑은 경기 */
  scanned: number
  /** 이미 맞아서 그대로 둔 경기 */
  kept: number
  /** 고칠(고친) 경기 */
  changed: number
  /** ★자동으로 못 고치는 경기★ — 창 밖이거나 그 리그에 시즌 행이 없다 */
  stuck: number
  /** 「리그 · 지금 → 바뀔」 별 개수 */
  byMove: Record<string, number>
  /** 못 고치는 사유별 개수 */
  byStuck: Record<string, number>
  /** 되돌리기 자료를 적은 파일 */
  backupPath: string | null
  backupRows: number
  written: boolean
}

/** 되돌리기 한 줄 — ★이 줄만 있으면 원래대로 되돌릴 수 있어야 한다★ */
export interface MatchSeasonBackupRow {
  matchId: string
  leagueSlug: string
  startAt: string
  /** 고치기 ★전★ seasonId */
  from: string | null
  /** 고친 ★뒤★ seasonId */
  to: string
  fromNumber: number | null
  toNumber: number
}

export async function runMatchSeasonFix(
  options: { confirm?: boolean; backup?: string | null; limit?: number } = {},
): Promise<MatchSeasonFixResult> {
  if (options.confirm && !options.backup) {
    throw new Error('★--backup 없이는 --confirm 을 받지 않는다★ — 되돌릴 자료부터 만든다')
  }

  /* 리그 → (시즌번호 → Season.id) · Season.id → 시즌번호 */
  const seasonOf = new Map<string, Map<number, string>>()
  const numberOf = new Map<string, number>()
  for (const s of await prisma.season.findMany({
    select: { id: true, leagueId: true, number: true },
  })) {
    if (!seasonOf.has(s.leagueId)) seasonOf.set(s.leagueId, new Map())
    seasonOf.get(s.leagueId)?.set(s.number, s.id)
    numberOf.set(s.id, s.number)
  }
  const slugOf = new Map(
    (await prisma.league.findMany({ select: { id: true, slug: true } })).map((l) => [l.id, l.slug]),
  )

  const result: MatchSeasonFixResult = {
    scanned: 0,
    kept: 0,
    changed: 0,
    stuck: 0,
    byMove: {},
    byStuck: {},
    backupPath: options.backup ?? null,
    backupRows: 0,
    written: options.confirm === true,
  }

  if (options.backup) writeFileSync(options.backup, '', 'utf8')

  const bump = (bag: Record<string, number>, key: string) => {
    bag[key] = (bag[key] ?? 0) + 1
  }

  let cursor: string | null = null
  for (;;) {
    const page: Array<{
      id: string
      leagueId: string
      startAt: Date
      seasonId: string | null
    }> = await prisma.match.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      select: { id: true, leagueId: true, startAt: true, seasonId: true },
      orderBy: { id: 'asc' },
      take: PAGE,
    })
    if (page.length === 0) break
    cursor = page[page.length - 1]?.id ?? null

    /** 이번 쪽에서 실제로 바꿀 것 */
    const todo: MatchSeasonBackupRow[] = []

    for (const m of page) {
      result.scanned += 1
      const slug = slugOf.get(m.leagueId) ?? '(모름)'
      const want = seasonWindowAt(m.startAt)
      if (want === null) {
        result.stuck += 1
        bump(result.byStuck, `${slug} · 어느 창에도 안 든다`)
        continue
      }
      const targetId = seasonOf.get(m.leagueId)?.get(want.number)
      if (!targetId) {
        result.stuck += 1
        bump(result.byStuck, `${slug} · 시즌 행이 없다(번호 ${want.number})`)
        continue
      }
      if (targetId === m.seasonId) {
        result.kept += 1
        continue
      }
      const fromNumber = m.seasonId ? (numberOf.get(m.seasonId) ?? null) : null
      result.changed += 1
      bump(result.byMove, `${slug} · ${fromNumber === null ? '없음' : fromNumber} → ${want.number}`)
      todo.push({
        matchId: m.id,
        leagueSlug: slug,
        startAt: m.startAt.toISOString(),
        from: m.seasonId,
        to: targetId,
        fromNumber,
        toNumber: want.number,
      })
    }

    /* ── 되돌리기 자료를 ★쓰기 전에★ 적는다 ─────────────────────────── */
    if (options.backup && todo.length > 0) {
      appendFileSync(
        options.backup,
        todo.map((r) => JSON.stringify(r)).join('\n') + '\n',
        'utf8',
      )
      result.backupRows += todo.length
    }

    if (options.confirm && todo.length > 0) {
      /*
       * 같은 (지금 → 바뀔) 짝끼리 묶어 `updateMany` 로 한 번에 쓴다.
       * 한 줄씩 쓰면 36,451번 왕복이다.
       * ★`seasonId` 한 칸만 쓴다★ — 다른 칸은 건드리지 않는다.
       */
      const groups = new Map<string, string[]>()
      for (const r of todo) {
        if (!groups.has(r.to)) groups.set(r.to, [])
        groups.get(r.to)?.push(r.matchId)
      }
      for (const [to, ids] of groups) {
        await prisma.match.updateMany({ where: { id: { in: ids } }, data: { seasonId: to } })
      }
    }

    if (options.limit && result.scanned >= options.limit) break
  }

  log(
    `Match 시즌 ${options.confirm ? '수정' : '미리보기'} — 훑음 ${result.scanned.toLocaleString()} · ` +
      `그대로 ${result.kept.toLocaleString()} · ★고침 ${result.changed.toLocaleString()}★ · ` +
      `못 고침 ${result.stuck.toLocaleString()}`,
  )
  for (const [k, n] of Object.entries(result.byMove).sort()) log(`   ${k.padEnd(30)} ${n.toLocaleString()}건`)
  if (result.stuck > 0) {
    for (const [k, n] of Object.entries(result.byStuck).sort()) warn(`   ${k} ${n}건`)
  }
  if (options.backup) {
    log(`되돌리기 자료 ${result.backupRows.toLocaleString()}줄 → ${options.backup}`)
  }
  if (!options.confirm) log('--confirm 없이는 한 줄도 쓰지 않았다')
  return result
}

/**
 * ★되돌린다★ — `--backup` 으로 만든 파일을 그대로 되감는다.
 *
 * 한 줄에 `from`(원래 값)이 있으므로 그 값으로 되돌려 놓는다.
 * `from` 이 `null` 이면 ★원래 비어 있었다는 뜻★ 이므로 다시 비운다.
 */
export async function runMatchSeasonRestore(
  rows: readonly MatchSeasonBackupRow[],
  options: { confirm?: boolean } = {},
): Promise<{ rows: number; restored: number; written: boolean }> {
  const groups = new Map<string | null, string[]>()
  for (const r of rows) {
    if (!groups.has(r.from)) groups.set(r.from, [])
    groups.get(r.from)?.push(r.matchId)
  }
  let restored = 0
  for (const [from, ids] of groups) {
    if (!options.confirm) {
      restored += ids.length
      continue
    }
    const done = await prisma.match.updateMany({
      where: { id: { in: ids } },
      data: { seasonId: from },
    })
    restored += done.count
  }
  log(
    `되돌리기 ${options.confirm ? '실행' : '미리보기'} — ${rows.length.toLocaleString()}줄 중 ${restored.toLocaleString()}건`,
  )
  return { rows: rows.length, restored, written: options.confirm === true }
}
