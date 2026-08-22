/**
 * Phase 9 최종 audit 실행기 (sandbox).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/lab/auditRun.ts
 */
import { DEFAULT_RATING_CONSTANTS } from '@sacloud/rating'
import { auditRows, invariants } from './audit.js'

function main(): void {
  console.info('Phase 9 최종 audit — 시나리오 19종 + 불변식\n')

  console.info('[시나리오]')
  for (const row of auditRows()) {
    console.info(`  ${row.name.padEnd(30)} ${row.detail}`)
  }

  console.info('\n[불변식]')
  let failed = 0
  for (const item of invariants()) {
    if (!item.passed) failed += 1
    console.info(`  ${item.passed ? 'PASS' : 'FAIL'}  ${item.name.padEnd(42)} ${item.detail}`)
  }

  console.info(
    `\n상수: D=${DEFAULT_RATING_CONSTANTS.expectedScoreDivisor} · ` +
      `cap ${DEFAULT_RATING_CONSTANTS.rewardCapStart}~${DEFAULT_RATING_CONSTANTS.rewardCapFull} · ` +
      `repeatDecay ${DEFAULT_RATING_CONSTANTS.repeatDecay}(격차 ${DEFAULT_RATING_CONSTANTS.repeatDecayMinGap}↑) · ` +
      `clanK ${DEFAULT_RATING_CONSTANTS.clanK}`,
  )
  console.info(failed === 0 ? '불변식 전부 통과.' : `불변식 ${failed}건 실패.`)
  if (failed > 0) process.exitCode = 1
}

main()
