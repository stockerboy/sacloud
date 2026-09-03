/**
 * **PC 를 끄면 몇 시간이 비나** (O-051 · 2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 재나 ══
 *
 * 실행기에서 수집이 안 되면 ★다른 곳에서 돌려야 한다.★ 후보가 사장님 PC 인데 —
 *
 * > 사장님: «★나는 크롬 못켜놓는다★»
 *
 * ★그 말이 「내 컴퓨터를 쓰지 마라」인지 「크롬을 띄워 두는 게 싫다」인지 우리가 정하지 않는다.★
 * 다만 사장님이 고르시려면 ★「PC 를 끄면 무엇을 잃는가」★ 를 숫자로 아셔야 한다.
 *
 * ══ 무엇으로 재나 ══
 *
 * ★IPL 경기가 실제로 몇 시에 열리나★ 를 센다 (KST 시간대별).
 * 밤에 PC 가 꺼져 있으면 ★그 시간대 경기는 다음에 켤 때까지 안 들어온다.★
 * ⚠ ★안 들어오는 게 아니라 늦게 들어온다★ — 병영수첩이 과거 경기를 계속 준다.
 *   그래서 잃는 것은 ★기록★ 이 아니라 ★신선도★ 다. 그 구별이 중요하다.
 */
import { prisma } from '@sacloud/db'

const BAR = (n: number, max: number): string => '█'.repeat(Math.max(0, Math.round((n / max) * 40)))

async function main(): Promise<void> {
  console.info('══ 1 · ★IPL 경기가 몇 시에 열리나★ (KST) ══\n')
  const rows = await prisma.$queryRaw<{ hr: number; n: bigint }[]>`
    SELECT EXTRACT(HOUR FROM m."startAt" AT TIME ZONE 'Asia/Seoul')::int AS hr,
           count(*) AS n
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE l."slug" = 'nolink'
       AND m."startAt" >= now() - interval '30 days'
     GROUP BY 1 ORDER BY 1
  `
  const total = rows.reduce((a, r) => a + Number(r.n), 0)
  const max = Math.max(...rows.map((r) => Number(r.n)), 1)
  for (const r of rows) {
    const n = Number(r.n)
    console.info(
      `  ${String(r.hr).padStart(2, '0')}시  ${n.toLocaleString().padStart(6)}건 ` +
        `${((100 * n) / total).toFixed(1).padStart(5)}%  ${BAR(n, max)}`,
    )
  }
  console.info(`\n  최근 30일 IPL 경기 ★${total.toLocaleString()}건★`)

  /* ── 2 · 밤에 PC 를 끄면 몇 %가 늦어지나 ─────────────────────── */
  console.info('\n══ 2 · ★PC 를 끄는 시간대별로 몇 %가 늦어지나★ ══\n')
  const share = (from: number, to: number): number => {
    let s = 0
    for (const r of rows) {
      const h = r.hr
      const inRange = from <= to ? h >= from && h < to : h >= from || h < to
      if (inRange) s += Number(r.n)
    }
    return (100 * s) / total
  }
  const CASES: [string, number, number][] = [
    ['새벽 02~08시를 끄면', 2, 8],
    ['밤 00~09시를 끄면', 0, 9],
    ['밤 23~10시를 끄면', 23, 10],
    ['낮에만 켜면 (10~22시)', 22, 10],
  ]
  for (const [label, from, to] of CASES) {
    const pct = share(from, to)
    console.info(`  ${label.padEnd(24)} ★${pct.toFixed(1)}%★ 가 그 사이에 열린다`)
  }

  /* ── 3 · 늦어지는 것이지 잃는 것이 아니다 ────────────────────── */
  console.info('\n══ 3 · ★잃는 것인가 늦어지는 것인가★ ══\n')
  const old = await prisma.$queryRaw<{ oldest: Date | null; newest: Date | null }[]>`
    SELECT min(m."startAt") AS oldest, max(m."startAt") AS newest
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     WHERE l."slug" = 'nolink'
  `
  const o = old[0]!
  const kst = (d: Date | null): string =>
    d === null ? '없음' : new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)
  console.info(`  지금 갖고 있는 IPL 경기: ${kst(o.oldest)} ~ ${kst(o.newest)}`)
  console.info(
    '\n  ★병영수첩은 과거 경기를 계속 준다★ — 매치목록이 최근 것부터 쭉 온다.\n' +
      '  그래서 PC 가 꺼져 있던 동안의 경기도 ★다음에 켤 때 들어온다.★\n' +
      '  ★잃는 것은 「기록」이 아니라 「신선도」다.★ 이 구별이 사장님 판단을 가른다',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
