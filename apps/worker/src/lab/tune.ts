/**
 * 상수 결정 리포트 실행기 (sandbox).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/lab/tune.ts
 *
 * DB에 붙지 않는다. 후보 상수 세트를 통과 기준으로 채점하고,
 * 통과 기준으로 갈리지 않는 상수는 **그 상수가 실제로 조절하는 것**을 따로 잰다.
 */
import { candidates, evaluateCriteria, runScenarios, score } from './tuneSim.js'
import {
  clanSpread,
  farmMargin,
  lineupTracking,
  repeatSuppression,
  seasonBehaviour,
  sweep,
} from './tuneSweep.js'

function heading(title: string): void {
  console.info(`\n${title}`)
}

function main(): void {
  console.info('래더 상수 후보 채점 — 승인된 정책(D-057~D-067) 기준\n')

  const rows = candidates().map((candidate) => {
    const metrics = runScenarios(candidate.constants)
    return { candidate, metrics, criteria: evaluateCriteria(metrics), score: score(metrics) }
  })

  const total = rows[0]?.criteria.length ?? 0
  console.info(`후보 ${rows.length}개 · 통과 기준 ${total}개\n`)

  for (const row of rows) {
    const failed = row.criteria.filter((criterion) => !criterion.passed)
    console.info(
      `${row.candidate.name.padEnd(18)} ${row.score}/${total}  ${row.candidate.note}` +
        (failed.length > 0
          ? `\n${failed.map((criterion) => `      ✗ ${criterion.name} — ${criterion.detail}`).join('\n')}`
          : ''),
    )
  }

  const best = [...rows].sort((left, right) => right.score - left.score)[0]!
  console.info(`\n최고 점수: ${best.candidate.name} (${best.score}/${total})`)

  heading('선택 후보의 시나리오 수치')
  const m = best.metrics
  console.info(`  동급 1경기 증감 합           ${m.evenPairSum}  (0이면 점수가 주입되지 않는다)`)
  console.info(`  리그 평균 이동(100명 5,000경기) ${m.populationMeanDrift.toFixed(1)}`)
  console.info(`  업셋 승 +${m.upsetWin} / 근소우위 승 +${m.favoriteWin} / 예상 패 ${m.favoriteLoss}`)
  console.info(`  양학 300경기 → ${m.farmerRating}  vs  정상 65% 300경기 → ${m.legitRating}`)
  console.info(`  강자 상대 45% 300경기 → ${m.grinderRating}`)
  console.info(`  같은 상대 20연승 +${m.repeatGain}  vs  새 상대 20연승 +${m.freshGain}`)
  console.info(`  신규 강자 ${m.strongNewcomerMatches}경기 · 신규 약자 ${m.weakNewcomerMatches}경기 만에 안정화`)
  console.info(
    `  시즌 3회 soft reset → 순위 상관 ${m.seasonOrderPreserved.toFixed(4)} · 폭 ${(m.seasonSpreadRatio * 100).toFixed(1)}%`,
  )
  console.info(`  3v3 경기 개인 결과 ${m.partialPlayerResults}건 · 라인업 반영 ${m.partialLineupBlended}`)
  console.info(`  20,000경기 수치 안전 ${m.numericSafe} · 결정적 ${m.deterministic}`)

  heading('[D] 기대승률 분모 — 래더가 실력차를 얼마나 급하게 반영하는가 (원본 관측 3400)')
  console.info(
    sweep(
      'D',
      [400, 800, 1200, 1600, 3400],
      (value) => ({ expectedScoreDivisor: value }),
      (constants) => {
        const spread = clanSpread(constants)
        const margin = farmMargin(constants)
        const scenario = runScenarios(constants)
        return (
          `클랜폭 ${Math.round(spread.spread)} · 전력상관 ${spread.correlation.toFixed(3)} · ` +
          `양학마진 ${Math.round(margin)} · 신규안착 ${scenario.strongNewcomerMatches}경기 · ` +
          `리그평균이동 ${scenario.populationMeanDrift.toFixed(1)}`
        )
      },
    ).join('\n'),
  )

  heading('[clanK] 클랜 래더 폭 — 관측 987~1,840(폭 약 850)에 가까울수록 좋다')
  console.info(
    sweep(
      'clanK',
      [12, 16, 20, 24, 30],
      (value) => ({ clanK: value }),
      (constants) => {
        const result = clanSpread(constants)
        return `폭 ${Math.round(result.spread)} (${Math.round(result.min)}~${Math.round(result.max)}) · 전력상관 ${result.correlation.toFixed(3)}`
      },
    ).join('\n'),
  )

  heading('[rewardCap] 양학 마진 — 정상 경로가 양학보다 얼마나 앞서는가 (클수록 좋다)')
  console.info(
    sweep(
      'cap',
      [
        [200, 700],
        [300, 900],
        [400, 1200],
        [600, 1800],
      ] as const,
      (value) => ({ rewardCapStart: value[0], rewardCapFull: value[1] }),
      (constants) => `마진 ${Math.round(farmMargin(constants))}점`,
    ).join('\n'),
  )

  heading('[repeatDecay] 반복 억제율 — 1에 가까울수록 반복 farming이 무의미하다')
  console.info(
    sweep(
      'decay',
      [0.3, 0.4, 0.6, 0.8, 1],
      (value) => ({ repeatDecay: value }),
      (constants) => `억제율 ${(repeatSuppression(constants) * 100).toFixed(1)}%`,
    ).join('\n'),
  )

  heading('[carryRate] 시즌 soft reset — 폭 축소 vs 순위 보존')
  console.info(
    sweep(
      'carry',
      [0.3, 0.4, 0.5, 0.6, 0.7],
      (value) => ({ seasonCarryRate: value }),
      (constants) => {
        const result = seasonBehaviour(constants)
        return `폭 ${(result.spreadRatio * 100).toFixed(0)}% 유지 · 순위상관 ${result.order.toFixed(4)}`
      },
    ).join('\n'),
  )

  heading('[lineupBlend] 클랜 래더가 실제 출전 전력을 얼마나 따라가는가')
  console.info(
    sweep(
      'blend',
      [0, 0.3, 0.5, 0.7, 1],
      (value) => ({ lineupBlend: value }),
      (constants) => {
        const result = lineupTracking(constants)
        return `전력상관 ${result.correlation.toFixed(3)} · 반영된 경기 ${(result.blendedRatio * 100).toFixed(0)}%`
      },
    ).join('\n'),
  )
}

main()
