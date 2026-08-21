/**
 * 시뮬레이션 리포트 실행기 — Phase 9 조사용 sandbox (운영 코드 아님).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/lab/run.ts
 *
 * DB에 붙지 않는다. 넥슨을 부르지 않는다. 결과를 저장하지도 않는다.
 * 숫자를 화면에 찍을 뿐이고, 그 숫자를 사람이 보고 공식을 고른다.
 */
import { type CrossMode } from './ladder.js'
import { metrics, simulate } from './simulate.js'
import {
  crossModeDivergence,
  farmingProbe,
  inactivityProbe,
  lineupProbe,
  newcomerProbe,
  repeatMatchProbe,
  specAnchors,
  transferProbe,
  upsetProbe,
  winRateDistortionProbe,
} from './scenarios.js'
import type { ClanLadderCandidate } from './clanLadder.js'

const CROSS_MODES: CrossMode[] = ['k', 'final', 'both']
const CLAN_CANDIDATES: ClanLadderCandidate[] = ['team-elo', 'member-mean', 'roster-strength']

const MODE_LABEL: Record<CrossMode, string> = {
  k: 'P-A  0.6을 K·배수에 (반올림 전)',
  final: 'P-B  0.6을 최종 증감에만',
  both: 'P-C  0.6을 양쪽 모두',
}

function line(title: string): void {
  console.info(`\n${'─'.repeat(78)}\n${title}\n${'─'.repeat(78)}`)
}

function fixed(value: number, digits = 2): string {
  return value.toFixed(digits)
}

function main(): void {
  console.info('래더 공식 시뮬레이션 — 합성 데이터, seed 고정, DB 미사용')
  console.info('※ 최종 공식은 사용자 승인 전까지 production에 적용하지 않는다')

  /* 0. 스펙 §8 회귀 앵커 */
  line('0. 스펙 §8 관측 앵커 대조 (관측: div1 -12 · div2 -15 · div1이 div2에 -7)')
  for (const mode of CROSS_MODES) {
    const anchors = specAnchors(mode)
    console.info(
      `${MODE_LABEL[mode]}\n` +
        `   div1 동급 패 ${anchors.div1Even} · div2 동급 패 ${anchors.div2Even} · ` +
        `div1이 div2에 패 ${anchors.div1VsDiv2} · div2가 div1에 패 ${anchors.div2VsDiv1}\n` +
        `   div1 승리에서 나오는 정수(1000~4000점 구간): ${anchors.winValues.join(', ')}` +
        `${anchors.winValues.includes(11) || anchors.winValues.includes(19) ? '  ← +11/+19가 나온다(관측과 불일치)' : '  ← +11/+19 없음 ✓'}`,
    )
  }

  /* 0-2. P-A vs P-B 구분 가능성 */
  line('0-2. P-A와 P-B를 관측만으로 구분할 수 있는가 (교차 division 승리 전 구간 대조)')
  const divergence = crossModeDivergence()
  console.info(
    `   대조 ${divergence.scanned}건 중 다른 값 ${divergence.differing}건 ` +
      `(${((divergence.differing / divergence.scanned) * 100).toFixed(1)}%) · 최대 차이 ${divergence.maxDifference}점`,
  )
  for (const [rating, opponent, a, b] of divergence.samples) {
    console.info(`   예: 본인 ${rating} vs 상대평균 ${opponent} → P-A +${a} · P-B +${b}`)
  }

  /* 1. 분포 */
  line('1. 기본 시뮬레이션 — 40클랜 · 320명 · 4,000경기')
  for (const mode of CROSS_MODES) {
    const result = metrics(simulate({ crossMode: mode }))
    console.info(
      `${MODE_LABEL[mode]}\n` +
        `   개인 래더  평균 ${fixed(result.ratings.mean, 0)} · 표준편차 ${fixed(result.ratings.stdev, 0)} · ` +
        `범위 ${result.ratings.min}~${result.ratings.max}\n` +
        `   실력 상관 ${fixed(result.skillCorrelation, 3)} · 인플레이션 ${fixed(result.inflation, 0)} · ` +
        `경기 ${result.matchesPlayed}\n` +
        `   승리 증감 정수: ${result.winDeltaValues.join(', ')}\n` +
        `   패배 증감 정수: ${result.loseDeltaValues.join(', ')}`,
    )
  }

  /* 2. 클랜 후보별 분포 */
  line('2. 클랜 래더 후보별 분포 (관측: 1위 1,840 · 20위 987)')
  for (const candidate of CLAN_CANDIDATES) {
    const result = metrics(simulate({ clanCandidate: candidate }))
    console.info(
      `${candidate.padEnd(16)} 평균 ${fixed(result.clanRatings.mean, 0)} · ` +
        `표준편차 ${fixed(result.clanRatings.stdev, 0)} · ` +
        `범위 ${result.clanRatings.min}~${result.clanRatings.max}`,
    )
  }

  /* 3. 업셋 */
  line('3. 업셋 — 약자(1200)가 강자(2600)를 이겼을 때')
  for (const mode of CROSS_MODES) {
    const probe = upsetProbe(mode)
    console.info(
      `${MODE_LABEL[mode]}\n` +
        `   약자 승 +${probe.underdogWin} · 강자 승 +${probe.favoriteWin} · ` +
        `강자 패 ${probe.favoriteLoss} · 약자 패 ${probe.underdogLoss}`,
    )
  }

  /* 4. 양학 */
  line('4. 강팀 양학 — 1000점 상대만 300경기 이겼을 때')
  for (const mode of CROSS_MODES) {
    const probe = farmingProbe(mode)
    console.info(
      `${MODE_LABEL[mode]}  →  ${probe.startRating} → ${probe.finalRating} · ` +
        `마지막 10경기 평균 +${fixed(probe.tailGainPerMatch, 2)} · 0점 승리 도달 ${probe.reachedZeroGain}`,
    )
  }

  /* 5. 신규 유저 */
  line('5. 신규 유저 — 실제 실력 2600인 사람이 1500에서 시작')
  for (const mode of CROSS_MODES) {
    const probe = newcomerProbe(mode)
    console.info(
      `${MODE_LABEL[mode]}  →  제자리(2500)까지 ${probe.matchesToTarget}경기 · ` +
        `400경기 후 ${probe.finalRating}`,
    )
  }

  /* 6. 장기 미접속 */
  line('6. 장기 미접속 — 200경기 동안 쉰 사람 vs 계속 한 사람')
  for (const mode of CROSS_MODES) {
    const probe = inactivityProbe(mode)
    console.info(
      `${MODE_LABEL[mode]}  →  쉰 사람 점수 변화 ${probe.ratingDrift} · ` +
        `활동자(승률 50%) 변화 ${probe.activeGain}`,
    )
  }

  /* 7. 이적 */
  line('7. 이적 — 2400점 에이스가 클랜을 떠났을 때 클랜 점수')
  for (const candidate of CLAN_CANDIDATES) {
    const probe = transferProbe(candidate)
    console.info(
      `${candidate.padEnd(16)} ${probe.before} → ${probe.afterTransfer} · ` +
        `즉시 반응 ${probe.immediateResponse}`,
    )
  }

  /* 8. 라인업 조작 */
  line('8. 라인업 조작 — 약한 5명으로 이겼을 때 vs 강한 5명으로 이겼을 때')
  for (const candidate of CLAN_CANDIDATES) {
    const probe = lineupProbe(candidate, 'k')
    console.info(
      `${candidate.padEnd(16)} 약한 라인업 +${probe.weakestLineupGain} · ` +
        `강한 라인업 +${probe.strongestLineupGain} · 악용 가능 ${probe.exploitable}`,
    )
  }

  /* 9. 반복 대전 */
  line('9. 반복 대전 — 같은 실력 두 팀이 500경기')
  for (const mode of CROSS_MODES) {
    const probe = repeatMatchProbe(mode)
    console.info(
      `${MODE_LABEL[mode]}  →  최종 점수차 ${probe.finalGap} · ` +
        `평균 ${fixed(probe.gapDistribution.mean, 1)} · 최대 ${probe.gapDistribution.max}`,
    )
  }

  /* 10. 승률 왜곡 */
  line('10. 승률 왜곡 — 90% 양학 vs 55% 정면승부 (각 300경기)')
  for (const mode of CROSS_MODES) {
    const probe = winRateDistortionProbe(mode)
    console.info(
      `${MODE_LABEL[mode]}  →  양학 ${probe.farmerRating}(승률 ${fixed(probe.farmerWinRate * 100, 1)}%) · ` +
        `정면 ${probe.contenderRating}(승률 ${fixed(probe.contenderWinRate * 100, 1)}%) · ` +
        `양학이 더 높음 ${probe.farmerRanksHigher}`,
    )
  }

  console.info('\n끝. 이 숫자는 판단 재료다. 공식 확정은 사용자 승인 사항이다.')
}

main()
