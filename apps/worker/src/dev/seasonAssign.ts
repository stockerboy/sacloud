/**
 * **시즌 넷을 만들고 경기를 묶는다** (O-046 · 2026-09-03).
 *
 * ```
 * node scripts/prod-run.mjs season-assign            미리보기 (아무것도 안 쓴다)
 * node scripts/prod-run.mjs season-assign --confirm  실제로 쓴다
 * ```
 *
 * ══ 무엇을 하나 ══
 *
 * 리그마다 `Season` 행 넷을 만들고, 경기의 `seasonId` 를 채운다.
 * 경계는 **`@sacloud/contract` 의 `SEASON_WINDOWS` 한 곳**에서만 읽는다.
 *
 * ```
 * legacy -2   ~2026-03-04     ★이전 기록★ — 재계산하지 않는다
 * Beta   -1   03-05~07-01
 * 시즌0   0   07-02~09-30
 * 시즌1   1   10-01~          (아직 경기가 없다)
 * ```
 *
 * ══ ★지우지 않는다★ ══
 *
 * 사장님이 «작년건 버려라» 라고 하셨지만 그 답의 전제가 **틀린 숫자(218건)** 였다.
 * 실제 2025-12 는 13,993건이고, 「작년」을 그대로 적용하면 **289,435건 = 전체의 75%** 다.
 * ★그래서 「버린다」를 「`legacy` 로 표시한다」로 읽었다.★ 한 건도 지우지 않는다
 * (`CLAUDE.md` 1-4 · 스키마 주석 「이전된 과거 기록 · 재계산하지 않는다」).
 * ⚠ 사장님이 「진짜 지우라는 뜻」이라고 하시면 **`SEASON_WINDOWS` 의 첫 항목만 빼면 된다.**
 *
 * ══ 안 건드리는 것 ══
 *
 * · 래더 점수 · 승패 · 라인업 — ★`seasonId` 칸 하나만 채운다★
 * · 이미 다른 시즌에 묶여 있는 경기 — 덮어쓰지 않는다 (지금은 0건이다)
 */
import { SEASON_WINDOWS } from '@sacloud/contract'
import { prisma } from '@sacloud/db'

const confirm = process.argv.includes('--confirm')

async function main(): Promise<void> {
  console.info(confirm ? '★쓰기 모드★\n' : '미리보기 — 아무것도 쓰지 않는다\n')

  const leagues = await prisma.league.findMany({ select: { id: true, slug: true } })
  console.info(`리그 ${leagues.length}곳 · 시즌 창 ${SEASON_WINDOWS.length}개\n`)

  /* ── 1. 시즌 행 ────────────────────────────────────────────────── */
  const seasonId = new Map<string, string>() /* `${leagueId}:${number}` → Season.id */
  let made = 0
  let had = 0
  for (const lg of leagues) {
    for (const w of SEASON_WINDOWS) {
      const key = `${lg.id}:${w.number}`
      const found = await prisma.season.findFirst({
        where: { leagueId: lg.id, number: w.number },
        select: { id: true, seasonType: true, startedAt: true, endedAt: true },
      })
      if (found) {
        seasonId.set(key, found.id)
        had += 1
        /*
         * ★번호는 같은데 뜻이 다른 행이 있다★
         *
         * `supply #0` 이 예전에 `seasonType='beta'` 로 만들어져 있었다 (그때는 beta = 시즌0).
         * 이제 `#0` 은 ★시즌0(official)★ 이다. 그대로 두면 ★뜻이 어긋난 행★ 이 남는다.
         * 창(`SEASON_WINDOWS`)이 진실이므로 **거기에 맞춘다.**
         * ⚠ 값을 지우는 게 아니라 **고치는 것**이다. 무엇을 고쳤는지 찍는다
         */
        const drift =
          found.seasonType !== w.seasonType ||
          found.startedAt.getTime() !== w.startedAt.getTime() ||
          (found.endedAt?.getTime() ?? null) !== (w.endedAt?.getTime() ?? null)
        if (drift) {
          console.info(
            `  ⚠ ${lg.slug} #${w.number} ★이미 있는데 값이 다르다★ — ` +
              `${found.seasonType} ${found.startedAt.toISOString().slice(0, 10)}` +
              ` → ${w.seasonType} ${w.startedAt.toISOString().slice(0, 10)}`,
          )
          if (confirm) {
            await prisma.season.update({
              where: { id: found.id },
              data: {
                seasonType: w.seasonType,
                startedAt: w.startedAt,
                endedAt: w.endedAt,
                status: w.endedAt === null || w.endedAt > new Date() ? 'active' : 'closed',
                frozen: w.seasonType === 'legacy',
              },
            })
          }
        }
        continue
      }
      if (!confirm) {
        made += 1
        continue
      }
      const created = await prisma.season.create({
        data: {
          leagueId: lg.id,
          number: w.number,
          seasonType: w.seasonType,
          startedAt: w.startedAt,
          endedAt: w.endedAt,
          /* 진행 중인 것만 active. 지난 것은 closed */
          status: w.endedAt === null || w.endedAt > new Date() ? 'active' : 'closed',
          /* ★legacy 는 얼어 있다★ — 수집·재계산이 못 건드린다 (스키마 주석) */
          frozen: w.seasonType === 'legacy',
          imported: w.seasonType === 'legacy',
        },
        select: { id: true },
      })
      seasonId.set(key, created.id)
      made += 1
    }
  }
  console.info(`시즌 행  새로 만듦 ${made} · 이미 있음 ${had}\n`)

  /* ── 2. 경기를 묶는다 ──────────────────────────────────────────── */
  console.info('경기 묶기 (리그 × 시즌 창)\n')
  let total = 0
  for (const lg of leagues) {
    const parts: string[] = []
    for (const w of SEASON_WINDOWS) {
      const where = {
        leagueId: lg.id,
        seasonId: null,
        startAt: { gte: w.startedAt, ...(w.endedAt ? { lt: w.endedAt } : {}) },
      }
      const n = await prisma.match.count({ where })
      if (n === 0) continue
      if (confirm) {
        const id = seasonId.get(`${lg.id}:${w.number}`)
        if (!id) throw new Error(`시즌 행이 없다: ${lg.slug} #${w.number}`)
        await prisma.match.updateMany({ where, data: { seasonId: id } })
      }
      parts.push(`${w.label} ${n.toLocaleString()}`)
      total += n
    }
    console.info(`  ${lg.slug.padEnd(9)} ${parts.join(' · ') || '없음'}`)
  }
  console.info(`\n  ${confirm ? '묶었다' : '묶을 것'} ★${total.toLocaleString()}건★`)

  /* ── 3. 남은 것 ────────────────────────────────────────────────── */
  const left = await prisma.match.count({ where: { seasonId: null } })
  console.info(`\n★어느 시즌에도 안 묶인 경기 ${left.toLocaleString()}건★`)
  if (left > 0 && confirm) {
    const sample = await prisma.match.findFirst({
      where: { seasonId: null },
      orderBy: { startAt: 'asc' },
      select: { startAt: true, league: { select: { slug: true } } },
    })
    console.info(
      `  ⚠ 가장 오래된 것 ${sample?.league.slug} ${sample?.startAt.toISOString()} — ★창 밖이다★`,
    )
  }

  if (!confirm) console.info('\n미리보기다. 실제로 쓰려면 --confirm 을 붙인다')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
