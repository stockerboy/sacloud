/**
 * `side_clan_mismatch` 가 **실제로 무엇을 빼는지** 숫자로 확인한다 — 읽기만 한다 (D-179).
 *
 * ── 왜 재나
 *
 * `rate.ts` 의 경기 루프는 순서가 이렇다.
 *
 *   ① `rateMatch`  ② 개인 승패·킬 누적  ③ 클랜 승패 누적
 *   ④ 개인 래더 반영 + `pendingStats.push`   ⑤ **red/blue 못 찾으면 `side_clan_mismatch` 로 continue**
 *   ⑥ 클랜 래더 반영 · `matchesRated += 1`
 *
 * 즉 ⑤ 에서 빠져도 ②③④ 는 **이미 끝난 뒤**다. 그래서 `side_clan_mismatch` 는
 * 개인 래더를 빼지 않고 **클랜 래더만** 뺀다. 코드를 읽어서가 아니라 숫자로 확인한다 —
 * `stats` 에 담긴 경기 수가 `matchesRated` 보다 많으면 그것이 증거다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/sideClanMismatchImpact.ts --leagues supply
 * ```
 */
import { prisma } from '@sacloud/db'
import { runSeason0 } from '../jobs/season0.js'

async function main(): Promise<void> {
  const index = process.argv.indexOf('--leagues')
  const leagues = (index >= 0 ? process.argv[index + 1]! : 'supply')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const slug of leagues) {
    const result = await runSeason0(slug)
    if (!result?.raw) {
      console.log(`결과 없음: ${slug}`)
      continue
    }
    const statMatchIds = new Set(result.raw.statKeys.map((s) => s.matchId))
    const skipped = Object.entries(result.skipped)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ')
    console.log(`\n=== ${slug}`)
    console.log(`대상 ${result.matchesConsidered} · 클랜 래더 반영(matchesRated) ${result.matchesRated}`)
    console.log(`개인 증감이 실제로 계산된 경기 수(stats 안 distinct matchId) ${statMatchIds.size}`)
    console.log(`차이 ${statMatchIds.size - result.matchesRated}  ← side_clan_mismatch 와 같으면 개인 래더는 빠지지 않은 것이다`)
    console.log(`제외 사유 ${skipped}`)

    /* 클랜 쪽 증거 — 승패 누적은 ③ 에서 됐는데 판수는 ⑥ 에서만 는다.
       그래서 어긋난 경기가 있는 클랜은 `승 + 패 > 판수` 가 된다 */
    const broken = result.clans.filter((c) => c.win + c.lose !== c.games)
    console.log(
      `클랜 ${result.clans.length}곳 중 승+패 ≠ 판수 인 곳 ${broken.length} · ` +
        `빠진 클랜-경기 합계 ${broken.reduce((sum, c) => sum + (c.win + c.lose - c.games), 0)}`,
    )
    console.table(
      broken
        .slice()
        .sort((a, b) => b.win + b.lose - b.games - (a.win + a.lose - a.games))
        .slice(0, 10)
        .map((c) => ({
          클랜: c.name,
          '클랜 래더 판수': c.games,
          '승+패': c.win + c.lose,
          '빠진 경기': c.win + c.lose - c.games,
          점수: Math.round(c.display),
        })),
    )
  }
  await prisma.$disconnect()
}

main().catch(async (e: unknown) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
