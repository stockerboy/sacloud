/**
 * **확정된 시즌 구분이 코드·DB 와 맞나** (2026-09-04 · ★읽기 전용★).
 *
 * 사장님이 확정하신 구분 —
 * ```
 * legacy ~3/4 · ★Beta 3/5~7/1★ · ★시즌0 7/2~9/30★ · 시즌1 10/1~
 * ```
 * ★코드에 박힌 값과 DB 의 `Season` 표가 그것과 같은지 본다.★ ★고치지 않는다. 보기만 한다.★
 */
import { prisma } from '@sacloud/db'
import { IPL_PROJECT_FROM, SEASON0_FROM, SEASON0_TO } from '../lib/season0Window.js'

const kst = (d: Date | null): string =>
  d ? new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '(끝 없음)'

async function main(): Promise<void> {
  console.info('══ ★코드에 박힌 값★ ══')
  console.info('')
  console.info(`  시즌0 집계 창 시작   ${kst(SEASON0_FROM)} KST`)
  console.info(`  시즌0 집계 창 끝     ${kst(SEASON0_TO)}`)
  console.info(`  ★적재 창 시작★      ${kst(IPL_PROJECT_FROM)} KST  (2026-09-04 에 갈랐다)`)
  console.info('')
  console.info('  ⚠ 사장님 확정은 ★시즌0 7/2~9/30★ · 코드는 ★7/1 시작 · 끝 없음★')
  console.info('     → ★시작이 하루 다르고, 끝이 안 박혀 있다★')
  console.info('')

  const seasons = await prisma.season.findMany({
    select: {
      number: true,
      seasonType: true,
      status: true,
      startedAt: true,
      endedAt: true,
      league: { select: { slug: true } },
    },
    orderBy: [{ leagueId: 'asc' }, { startedAt: 'asc' }],
  })

  console.info('══ ★DB 의 `Season` 표★ ══')
  console.info('')
  console.info('  리그        번호  종류        상태        시작 ~ 끝 (KST)')
  console.info('  ' + '─'.repeat(76))
  for (const s of seasons) {
    console.info(
      `  ${s.league.slug.padEnd(10)} ${String(s.number).padStart(3)}  ` +
        `${s.seasonType.padEnd(10)} ${s.status.padEnd(10)} ` +
        `${kst(s.startedAt)} ~ ${kst(s.endedAt)}`,
    )
  }
  console.info('')
  console.info('  ★읽는 법★ — ★Beta(3/5~7/1)에 해당하는 줄이 없으면 「지난시즌」에 아무것도 안 나온다.★')
  console.info('  만들지 말지는 ★사람이 정할 일★ 이다. ★여기서는 보기만 한다.★')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
