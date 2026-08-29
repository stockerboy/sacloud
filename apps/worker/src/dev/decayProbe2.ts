/** 감점이 계산 단계에서 나오는지 직접 확인 — 읽기만 한다. */
import { V2_RATING_CONSTANTS, dailyDecay, displayScore } from '@sacloud/rating'
import { runRate } from '../jobs/rate.js'
import { season0Scope } from '../lib/season0Window.js'
import type { JobContext } from '../jobs/context.js'

const DRY: JobContext = { config: {} as never, client: null, dryRun: true, limit: null, resume: false }

async function main(): Promise<void> {
  /* 상수만으로 감점이 나오는지 먼저 본다 */
  const sample = displayScore({ internalRating: 3541, games: 417, winRate: 0.645, constants: V2_RATING_CONSTANTS })
  console.log('표시 점수 계산', { base: sample.base, gated: sample.gated, display: sample.display })
  console.log('하루치 감점(4893점 · 60일 쉼)', dailyDecay(4893, 60, V2_RATING_CONSTANTS))
  console.log('하루치 감점(4893점 · 3일 쉼)', dailyDecay(4893, 3, V2_RATING_CONSTANTS))

  const result = await runRate(DRY, {
    leagueSlug: 'supply',
    matchScope: season0Scope(),
    constants: V2_RATING_CONSTANTS,
  })

  const withPenalty = result.report.players.filter((p) => p.penalty > 0)
  console.log(`\n감점 있는 선수 ${withPenalty.length} / ${result.report.players.length}`)
  console.table(
    result.report.players
      .slice()
      .sort((a, b) => b.display - a.display)
      .slice(0, 10)
      .map((p) => ({
        표시: p.display,
        내부: Math.round(p.internal),
        감점: Math.round(p.penalty),
        판수: p.games,
      })),
  )
  console.table(
    withPenalty
      .slice()
      .sort((a, b) => b.penalty - a.penalty)
      .slice(0, 5)
      .map((p) => ({ 표시: p.display, 감점: Math.round(p.penalty), 판수: p.games })),
  )
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
