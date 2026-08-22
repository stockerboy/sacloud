/**
 * 시즌 운영 CLI (Phase 9 · Phase 10에서 웹 관리자와 공용화).
 *
 * **판단·변경 로직은 여기 없다.** `@sacloud/db/ops`에 있고, 웹 관리자 화면도 같은 함수를 부른다.
 * 여기서는 명령줄 결과를 보여 주는 일만 한다 — 두 경로가 갈라지면 운영 사고가 난다.
 *
 * 절대 규칙 (그대로다)
 *   - 자동으로 도는 것이 없다. 운영자가 부를 때만 실행된다 (D-077)
 *   - 종료 → 시작 순서를 강제한다
 *   - 지난 시즌 기록은 건드리지 않는다
 */
import {
  closeSeason,
  previewSeasonClose,
  previewSeasonStart,
  seasonOverview,
  startSeason,
  type SeasonCloseResult,
  type SeasonOverview,
  type SeasonStartResult,
} from '@sacloud/db/ops'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

export async function seasonStatus(leagueSlug: string): Promise<SeasonOverview | null> {
  return seasonOverview(leagueSlug)
}

/** 시즌 종료 — `dry-run`이면 미리보기만 한다 */
export async function runSeasonClose(
  ctx: JobContext,
  input: { leagueSlug: string; endedAt?: Date },
): Promise<SeasonCloseResult> {
  const preview = await previewSeasonClose(input.leagueSlug)
  if (!preview.ok) {
    warn(preview.reason)
    return { ok: false, reason: preview.reason, season: null, clanRows: 0, playerRows: 0, endedAt: null }
  }

  log(
    `시즌 ${preview.season} 종료 예정 — 클랜 스냅샷 ${preview.clanRows} · 개인 스냅샷 ${preview.playerRows}`,
  )
  for (const leader of preview.divisionLeaders) {
    log(`  ${leader.division}부 1위 ${leader.clan} (${leader.rating}점)`)
  }

  if (ctx.dryRun) {
    log('[dry-run] 실제로 닫지 않았다')
    return {
      ok: true,
      reason: '',
      season: preview.season,
      clanRows: preview.clanRows,
      playerRows: preview.playerRows,
      endedAt: null,
    }
  }

  const result = await closeSeason({ leagueSlug: input.leagueSlug, endedAt: input.endedAt })
  if (result.ok) {
    log(`시즌 ${result.season} 종료 — 최종 랭킹 스냅샷 저장 완료`)
    log('경기·참가기록·시즌 통계는 그대로 보존된다')
  } else {
    warn(result.reason)
  }
  return result
}

/** 새 시즌 시작 — 승강 반영 + 전원 같은 출발점. `dry-run`이면 미리보기만 한다 */
export async function runSeasonOpen(
  ctx: JobContext,
  input: {
    leagueSlug: string
    startedAt?: Date
    number?: number
    skipPromotion?: boolean
  },
): Promise<SeasonStartResult> {
  const preview = await previewSeasonStart(input.leagueSlug)
  if (!preview.ok) {
    warn(preview.reason)
    return { ...preview, startedAt: null }
  }

  log(
    `시즌 ${preview.nextNumber} 시작 예정 — 승격 ${preview.promoted?.clan ?? '없음'} · ` +
      `강등 ${preview.relegated?.clan ?? '없음'}`,
  )
  log(`선수 ${preview.players}명 · 클랜 ${preview.clans}곳이 전부 ${preview.baseline}점에서 시작한다`)

  if (ctx.dryRun) {
    log('[dry-run] 실제로 시작하지 않았다')
    return { ...preview, startedAt: null }
  }

  const result = await startSeason({
    leagueSlug: input.leagueSlug,
    startedAt: input.startedAt,
    number: input.number,
    skipPromotion: input.skipPromotion,
  })
  if (result.ok) {
    log(`시즌 ${result.nextNumber} 시작 (${result.startedAt})`)
    log('지난 시즌 기록과 최종 랭킹 스냅샷은 그대로 남아 있다')
  } else {
    warn(result.reason)
  }
  return result
}
