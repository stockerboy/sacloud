/**
 * **O-044 — 감추기 전에 숫자를 낸다** (2026-09-03 · 읽기 전용).
 *
 * ══ 사장님이 43곳을 직접 분류하셨다 ══
 *
 * ```
 * SPL 로 남긴다 29곳   → ★열산에서 감춘다★
 * 열산으로 남긴다 14곳  → ★SPL 에서 감춘다★
 * ```
 * > 사장님: «감춰라» — ★지우지 않는다★ (`CLAUDE.md` 1-4)
 *
 * ══ ★이름으로 짝짓지 않는다★ ══
 *
 * `＃chasepIay`(대문자 I) 와 `＃chaseplay`(소문자 l) 처럼 **눈으로 구별이 안 되는 이름**이 있다.
 * ★그래서 이름은 대조용으로만 쓰고, 실제 짝은 `slug` 로 짓는다.★
 * 이름이 하나라도 안 맞으면 **멈추고 사람에게 알린다** — 지어내지 않는다.
 *
 * ⚠ **읽기만 한다.** 이 파일은 숫자만 낸다.
 */
import { prisma } from '@sacloud/db'

/** 사장님 분류 — SPL 로 남긴다 (= 열산에서 감춘다) */
const KEEP_SPL = [
  '-tsAr.nTc', '［P.ro™］', '＃chasepIay', '＃chaseplay', 'AK-47', 'Castle', 'Chamundara',
  'des`per@do.', 'dravelior', 'e2stro-', 'hing', 'Iatency-', 'immortals', 'isyour',
  'mercedes-', 'rNtwo-', 'ThelVub', 'unfair', 'Βlackpearl', '마왕', '사신', '야부리！',
  '★PURPLE★', 'afterpray', 'gaIactico-', 'innatemass', 'recent.wct', 'saint', 'stylecIan',
]

/** 사장님 분류 — 10mountain(열산)으로 남긴다 (= SPL 에서 감춘다) */
const KEEP_SANPLY = [
  'CeIebrity', 'eternalrz', 'flying-', "Grand'rN", 'hilarious-', 'IinecIan:', 'MiraGe.',
  'recentwct-', 'respects-', 'resun`z', 'sugarcandy', '매너', '어린이', '鬼神。',
]

async function main(): Promise<void> {
  console.info('══ 1 · 겹친 43곳을 DB 에서 다시 꺼낸다 ══\n')
  const rows = await prisma.$queryRaw<
    { name: string; slug: string; supply_lc: string; sanply_lc: string }[]
  >`
    WITH live AS (
      SELECT lc."clanId", lc."id" AS lcid, l."slug" AS lg
        FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId"
       WHERE lc."expelledAt" IS NULL AND l."slug" IN ('supply', 'sanply')
    )
    SELECT c."name" AS name, c."slug" AS slug,
           max(CASE WHEN live.lg = 'supply' THEN live.lcid END) AS supply_lc,
           max(CASE WHEN live.lg = 'sanply' THEN live.lcid END) AS sanply_lc
      FROM live
      JOIN "Clan" c ON c."id" = live."clanId"
     GROUP BY 1, 2
    HAVING count(DISTINCT live.lg) = 2
     ORDER BY 1
  `
  console.info(`  DB 에서 찾은 겹침  ★${rows.length}곳★ (사장님 목록은 43곳)`)

  const byName = new Map(rows.map((r) => [r.name, r]))
  const missSpl = KEEP_SPL.filter((n) => !byName.has(n))
  const missSan = KEEP_SANPLY.filter((n) => !byName.has(n))
  const extra = rows.filter((r) => !KEEP_SPL.includes(r.name) && !KEEP_SANPLY.includes(r.name))

  console.info(`\n  사장님 목록 ${KEEP_SPL.length + KEEP_SANPLY.length}곳 · DB ${rows.length}곳`)
  if (missSpl.length || missSan.length || extra.length) {
    console.info('  ★★이름이 안 맞는다 — 여기서 멈춰야 한다★★')
    if (missSpl.length) console.info(`    SPL 목록에 있는데 DB 에 없음: ${missSpl.join(' · ')}`)
    if (missSan.length) console.info(`    열산 목록에 있는데 DB 에 없음: ${missSan.join(' · ')}`)
    if (extra.length) console.info(`    DB 에 있는데 목록에 없음: ${extra.map((r) => r.name).join(' · ')}`)
  } else {
    console.info('  ★43곳이 이름까지 정확히 맞는다. slug 로 짝지어도 안전하다★')
  }

  console.info('\n══ 2 · ★감추면 몇 건이 안 보이게 되나★ ══\n')
  /* 감출 등록행(lcid)을 모아 그 행이 낀 경기를 센다 */
  const hideSanply = rows.filter((r) => KEEP_SPL.includes(r.name)).map((r) => r.sanply_lc)
  const hideSupply = rows.filter((r) => KEEP_SANPLY.includes(r.name)).map((r) => r.supply_lc)

  for (const [lg, ids] of [
    ['sanply(열산)', hideSanply],
    ['supply(SPL)', hideSupply],
  ] as const) {
    const clean = ids.filter((x): x is string => Boolean(x))
    if (clean.length === 0) {
      console.info(`  ${lg} 감출 클랜이 없다`)
      continue
    }
    const either = await prisma.match.count({
      where: { OR: [{ redLeagueClanId: { in: clean } }, { blueLeagueClanId: { in: clean } }] },
    })
    const both = await prisma.match.count({
      where: { redLeagueClanId: { in: clean }, blueLeagueClanId: { in: clean } },
    })
    const total = await prisma.match.count({
      where: { league: { slug: lg.startsWith('sanply') ? 'sanply' : 'supply' } },
    })
    console.info(
      `  ${lg.padEnd(12)} 클랜 ${clean.length}곳 · 그 클랜이 낀 경기 ★${either.toLocaleString()}건★ ` +
        `(그 리그 ${total.toLocaleString()}건 중 ${((either / total) * 100).toFixed(1)}%)`,
    )
    console.info(
      `  ${''.padEnd(12)} 그중 ★양쪽 다 감춰져 통째로 안 보이는 경기 ${both.toLocaleString()}건★`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
