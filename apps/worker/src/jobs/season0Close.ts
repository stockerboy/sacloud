/**
 * 시즌0 마감 — 시즌1 을 여는 순간 시즌0 성적을 **지난시즌 카드**로 굳힌다 (D-175).
 *
 * ── 사용자 지시 (2026-08-29, 원문)
 *
 * > "시즌0이란 시즌 시작전 테스트 시즌이야. 시즌1오픈 날은 내가 정한다.
 * >  그전까지는 계속 시즌0. 내가 시즌1 오픈하면 자동으로 시즌0 마무리 후
 * >  각 선수 개인기록에 카드로 만들어서 저장."
 *
 * ── 새 축을 만들지 않는다
 *
 * 카드도 랭킹 스냅샷도 **이미 있는 것**을 쓴다. `closeSeason`(`@sacloud/db/ops`)이
 * `LeaguePlayerSeason` · `LeagueClanSeason` · `RankSnapshot` 을 한 트랜잭션으로 남기고,
 * 화면은 그 카드를 그대로 그린다 (D-101 · D-166). 여기서는
 *
 *   1) 지금 열려 있는 시즌이 **정말 시즌0 인지** 확인하고
 *   2) `Season.startedAt` 을 시즌0 창 시작(2026-04-01 KST)에 맞추고
 *   3) `closeSeason` 을 부르고
 *   4) 카드가 실제로 생겼는지 **숫자로 확인**한다.
 *
 * 새 시즌을 여는 것은 `startSeason` 이 한다. 이 명령은 그것을 이어서 부르기만 한다.
 *
 * ── 시즌 번호는 **추측하지 않는다**
 *
 * `Season` 표에는 3rd.supply 에서 이관한 **시즌 1~7 이 이미 있다.** 그래서
 * "다음 번호" 는 8 이 되는데, 사용자가 말하는 `시즌1` 과 숫자가 다르다.
 * 어느 쪽이 맞는지 원본으로도 우리 기록으로도 정해지지 않는다 —
 * 그래서 여는 쪽은 **`--number` 를 반드시 받아야** 진행한다 (`[미확인]` · D-175).
 *
 * ```bash
 * # 미리보기 (아무것도 쓰지 않는다)
 * pnpm --filter @sacloud/worker nexon season0-finish --league supply --dry-run
 * # 시즌0 마감만
 * pnpm --filter @sacloud/worker nexon season0-finish --league supply --confirm
 * # 마감 + 다음 시즌 열기 (번호는 사용자가 정한다)
 * pnpm --filter @sacloud/worker nexon season0-finish --league supply --open --number 8 --confirm
 * ```
 */
import { prisma } from '@sacloud/db'
import { closeSeason, previewSeasonClose, seasonLabel, startSeason } from '@sacloud/db/ops'
import { log, warn } from '../lib/log.js'
import { SEASON0_FROM, SEASON0_NUMBER, SEASON0_TYPE } from '../lib/season0Window.js'
import type { JobContext } from './context.js'

export interface Season0CloseResult {
  ok: boolean
  reason: string
  /** 닫은 시즌 번호 */
  closedSeason: number | null
  /** `Season.startedAt` 을 시즌0 창 시작으로 맞췄는가 */
  alignedStartedAt: string | null
  /** 실제로 DB 에 생긴 카드 수 (`closeSeason` 이 보고한 값이 아니라 다시 센 값) */
  playerCards: number
  clanCards: number
  /** 카드에 값이 실제로 들어간 행 (rating 이 있는 행) */
  playerCardsWithRating: number
  /** 이어서 연 시즌 */
  openedSeason: number | null
  openedStartedAt: string | null
}

const EMPTY: Season0CloseResult = {
  ok: false,
  reason: '',
  closedSeason: null,
  alignedStartedAt: null,
  playerCards: 0,
  clanCards: 0,
  playerCardsWithRating: 0,
  openedSeason: null,
  openedStartedAt: null,
}

export async function runSeason0Close(
  ctx: JobContext,
  input: {
    leagueSlug: string
    /** 마감 시각. 없으면 지금 */
    endedAt?: Date
    /** 이어서 다음 시즌을 연다. 번호는 **반드시** 준다 */
    open?: { number: number; startedAt?: Date; skipPromotion?: boolean }
  },
): Promise<Season0CloseResult> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, name: true },
  })
  if (!league) return { ...EMPTY, reason: `리그를 찾을 수 없다: ${input.leagueSlug}` }

  const active = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, seasonType: true, startedAt: true },
  })
  if (!active) return { ...EMPTY, reason: '활성 시즌이 없다. 닫을 것이 없다' }

  /* 시즌0 이 아닌 시즌을 이 명령으로 닫지 않는다 — 실수로 정식 시즌을 굳히면 되돌리기 어렵다.
     정식 시즌 마감은 기존 `nexon season --close` 를 쓴다 */
  if (active.seasonType !== SEASON0_TYPE || active.number !== SEASON0_NUMBER) {
    return {
      ...EMPTY,
      reason:
        `열려 있는 시즌이 시즌0 이 아니다 — ${seasonLabel(active)} ` +
        `(number ${active.number} · ${active.seasonType}). 이 명령은 시즌0 전용이다`,
    }
  }

  const needsAlign = active.startedAt.getTime() !== SEASON0_FROM.getTime()

  const preview = await previewSeasonClose(input.leagueSlug)
  if (!preview.ok) return { ...EMPTY, reason: preview.reason }

  log(
    `${league.name} — 시즌0 마감 예정 · 개인 카드 대상 ${preview.playerRows} · ` +
      `클랜 카드 대상 ${preview.clanRows}`,
  )
  if (needsAlign) {
    log(
      `시즌0 시작 시각을 창 시작으로 맞춘다 — ${active.startedAt.toISOString()} → ` +
        `${SEASON0_FROM.toISOString()} (2026-04-01 KST)`,
    )
  }
  if (input.open) {
    log(`마감 뒤 시즌 ${input.open.number} 을 연다`)
  }

  if (ctx.dryRun) {
    log('[dry-run] 아무것도 쓰지 않았다')
    return {
      ...EMPTY,
      ok: true,
      reason: '미리보기',
      closedSeason: active.number,
      alignedStartedAt: needsAlign ? SEASON0_FROM.toISOString() : null,
      playerCards: preview.playerRows,
      clanCards: preview.clanRows,
    }
  }

  /* 1) 창과 시즌 행을 맞춘다. 카드에 적히는 "그 시즌" 이 실제 집계 창과 달라서는 안 된다 */
  if (needsAlign) {
    await prisma.season.update({
      where: { id: active.id },
      data: { startedAt: SEASON0_FROM },
    })
  }

  /* 2) 마감 — 카드·스냅샷은 전부 `closeSeason` 이 만든다 */
  const closed = await closeSeason({ leagueSlug: input.leagueSlug, endedAt: input.endedAt })
  if (!closed.ok) return { ...EMPTY, reason: `시즌0 을 닫지 못했다: ${closed.reason}` }

  /* 3) **보고가 아니라 DB 를 다시 세서** 확인한다 (CLAUDE.md 3-A 6번) */
  const [playerCards, clanCards, withRating] = await Promise.all([
    prisma.leaguePlayerSeason.count({ where: { seasonId: active.id } }),
    prisma.leagueClanSeason.count({ where: { seasonId: active.id } }),
    prisma.leaguePlayerSeason.count({ where: { seasonId: active.id, rating: { not: null } } }),
  ])
  log(`시즌0 카드 — 개인 ${playerCards} (점수 있는 행 ${withRating}) · 클랜 ${clanCards}`)
  if (playerCards === 0) warn('개인 카드가 한 장도 생기지 않았다. 확인이 필요하다')

  const result: Season0CloseResult = {
    ok: true,
    reason: '',
    closedSeason: closed.season,
    alignedStartedAt: needsAlign ? SEASON0_FROM.toISOString() : null,
    playerCards,
    clanCards,
    playerCardsWithRating: withRating,
    openedSeason: null,
    openedStartedAt: null,
  }

  /* 4) 다음 시즌 — 번호는 사용자가 준 값만 쓴다 */
  if (input.open) {
    const started = await startSeason({
      leagueSlug: input.leagueSlug,
      number: input.open.number,
      startedAt: input.open.startedAt,
      skipPromotion: input.open.skipPromotion,
      seasonType: 'official',
    })
    if (!started.ok) {
      warn(`시즌0 은 닫혔는데 새 시즌을 열지 못했다: ${started.reason}`)
      return { ...result, reason: started.reason }
    }
    result.openedSeason = started.nextNumber
    result.openedStartedAt = started.startedAt
    log(`시즌 ${started.nextNumber} 시작 (${started.startedAt}) — 전원 ${started.baseline}점`)
    log('시즌0 기록(경기·참가기록·카드·랭킹 스냅샷)은 그대로 남아 있다')
  }

  return result
}
