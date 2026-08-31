/**
 * `battlelogCheck` 를 CLI 없이 돌리는 runner.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/battlelogCheck.ts
 * ```
 *
 * `apps/worker/src/cli.ts` 는 지금 다른 작업자가 고치고 있어서 손대지 않았다.
 * CLI 에 붙으면(`nexon battlelog-check`) 이 파일은 지워도 된다 — 같은 함수를 부른다.
 */
import { prisma } from '@sacloud/db'
import { checkBattleLogs } from '../jobs/battlelogCheck.js'

async function main(): Promise<void> {
  const r = await checkBattleLogs()

  console.info('── 수집 현황 ──────────────────────────────')
  console.info(`매치목록이 아는 고유 경기      ${r.matchesKnown.toLocaleString()}`)
  console.info(`배틀로그 받음                  ${r.matchesFetched.toLocaleString()}`)
  console.info(`배틀로그 안 받음               ${r.matchesMissing.toLocaleString()}`)
  console.info(`클랜 단위 응답 행              ${r.clanRows.toLocaleString()}`)
  console.info(`좌표가 들어온 라운드           ${r.roundsWithPoints.toLocaleString()}`)
  console.info(`좌표 이벤트                    ${r.points.toLocaleString()}`)
  console.info(`빈 응답(지워졌거나 없는 경기)  ${r.emptyResponses.toLocaleString()}`)
  const coverage =
    r.matchesKnown > 0 ? ((r.matchesFetched / r.matchesKnown) * 100).toFixed(1) : '0.0'
  console.info(`→ 덮은 비율                    ${coverage}%`)
  /* **숫자가 바뀐 이유를 남긴다** (D-218) */
  console.info(
    `\n※ 판정 기준이 바뀌었다 (D-218). 응답 하나에 양 팀 10명이 다 온다 —\n` +
      `  옛 '한 팀만 받음 ${r.legacy.oneResponse.toLocaleString()}건' 은 결손이 아니라 완전한 경기다.\n` +
      `  이제 '받음/안 받음' 으로만 센다 (참고: 응답을 두 벌 받아 둔 경기 ${r.legacy.twoResponses.toLocaleString()}건).`,
  )

  if (r.worklistPairs !== null) {
    console.info('\n── 작업목록 대비 ──────────────────────────')
    console.info(`남은 짝 ${r.worklistPairs.toLocaleString()}개`)
    for (const p of r.worklistByPriority) {
      console.info(`  ${p.priority}순위 ${p.label} — ${p.pairs.toLocaleString()}개`)
    }
  } else {
    console.info('\n작업목록이 없다. battlelogWorklist.ts 를 먼저 돌려라')
  }

  console.info('\n── 성과 지표 · 1티어 ──────────────────────')
  for (const a of r.aces) {
    const where = a.found ? (a.clan ?? '소속없음') : '우리 DB 에 없음'
    console.info(`  ${a.name.padEnd(14)} ${String(a.matches).padStart(6)}경기  ${where}`)
  }
  const aceCovered = r.aces.filter((a) => a.matches > 0).length
  console.info(`  → 배틀로그가 있는 1티어 ${aceCovered}/${r.aces.length}명`)

  console.info('\n── 성과 지표 · 개인랭킹 1~30등 ────────────')
  for (const t of r.top30) {
    console.info(`  ${t.name.padEnd(16)} ${String(t.matches).padStart(6)}경기  ${t.clan ?? '소속없음'}`)
  }
  const topCovered = r.top30.filter((t) => t.matches > 0).length
  console.info(`  → 배틀로그가 있는 상위권 ${topCovered}/${r.top30.length}명`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
