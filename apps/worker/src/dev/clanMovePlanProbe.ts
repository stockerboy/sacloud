/**
 * **O-044 (나) — 옮길 경기가 몇 건인가** (2026-09-03 · 읽기 전용).
 *
 * ══ 사장님이 (나)를 고르셨다 ══
 *
 * > «Castle vs Mirage 는 열산클랜이 더 이상 아니다.
 * >  **둘이 대결한 기록은 반드시 spl에만 존재한다**»
 * > (A 가 «(가) 원래 SPL 경기만 남긴다 / (나) 열산 경기도 SPL 로 옮긴다» 를 여쭙자) → «**나)**»
 *
 * ```
 * ① 양쪽 다 같은 리그로 정해졌으면 → ★그 경기를 그 리그로 옮긴다★
 * ② 한쪽만 정해졌으면            → ★감춘다 (안 옮긴다)★
 *    감춘 쪽 기록실에서만 안 보이고, ★상대 리그 킬뎃·승률에는 그대로 들어간다★
 * ```
 *
 * ⚠ **읽기만 한다.** 옮기지 않는다. ★래더는 건드리지 않는다★ (A 가 사장님께 확인 중).
 */
import { prisma } from '@sacloud/db'

/** 사장님 분류 — SPL 로 남긴다 */
const KEEP_SPL = [
  '-tsAr.nTc', '［P.ro™］', '＃chasepIay', '＃chaseplay', 'AK-47', 'Castle', 'Chamundara',
  'des`per@do.', 'dravelior', 'e2stro-', 'hing', 'Iatency-', 'immortals', 'isyour',
  'mercedes-', 'rNtwo-', 'ThelVub', 'unfair', 'Βlackpearl', '마왕', '사신', '야부리！',
  '★PURPLE★', 'afterpray', 'gaIactico-', 'innatemass', 'recent.wct', 'saint', 'stylecIan',
]
/** 사장님 분류 — 10mountain(열산)으로 남긴다 */
const KEEP_SANPLY = [
  'CeIebrity', 'eternalrz', 'flying-', "Grand'rN", 'hilarious-', 'IinecIan:', 'MiraGe.',
  'recentwct-', 'respects-', 'resun`z', 'sugarcandy', '매너', '어린이', '鬼神。',
]

async function main(): Promise<void> {
  /* 43곳의 slug 를 이름으로 찾되, ★짝은 slug 로 짓는다★ */
  const clans = await prisma.clan.findMany({
    where: { name: { in: [...KEEP_SPL, ...KEEP_SANPLY] } },
    select: { id: true, name: true, slug: true },
  })
  const toSpl = new Set(clans.filter((c) => KEEP_SPL.includes(c.name)).map((c) => c.id))
  const toSan = new Set(clans.filter((c) => KEEP_SANPLY.includes(c.name)).map((c) => c.id))
  console.info(`43곳 확인 — SPL 로 ${toSpl.size}곳 · 열산으로 ${toSan.size}곳\n`)
  if (toSpl.size !== KEEP_SPL.length || toSan.size !== KEEP_SANPLY.length) {
    console.info('  ★★이름이 안 맞는다 — 멈춰야 한다★★')
    return
  }

  /* 경기마다 양쪽 클랜이 어느 무리인지 본다 */
  const rows = await prisma.$queryRaw<
    { league: string; red_group: string; blue_group: string; n: bigint }[]
  >`
    SELECT l."slug" AS league,
           CASE WHEN rc."id" = ANY(${[...toSpl]}) THEN 'SPL행'
                WHEN rc."id" = ANY(${[...toSan]}) THEN '열산행'
                ELSE '해당없음' END AS red_group,
           CASE WHEN bc."id" = ANY(${[...toSpl]}) THEN 'SPL행'
                WHEN bc."id" = ANY(${[...toSan]}) THEN '열산행'
                ELSE '해당없음' END AS blue_group,
           count(*) AS n
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
      JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
      JOIN "Clan" rc ON rc."id" = rlc."clanId"
      JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
      JOIN "Clan" bc ON bc."id" = blc."clanId"
     WHERE l."slug" IN ('supply', 'sanply')
     GROUP BY 1, 2, 3 ORDER BY 4 DESC
  `

  console.info('══ 1 · ★옮길 경기 (양쪽 다 같은 무리 · 지금은 딴 리그)★ ══\n')
  let moveToSpl = 0
  let moveToSan = 0
  for (const r of rows) {
    if (r.red_group === 'SPL행' && r.blue_group === 'SPL행' && r.league === 'sanply') {
      moveToSpl += Number(r.n)
    }
    if (r.red_group === '열산행' && r.blue_group === '열산행' && r.league === 'supply') {
      moveToSan += Number(r.n)
    }
  }
  console.info(`  열산 → SPL  ★${moveToSpl.toLocaleString()}건★`)
  console.info(`  SPL → 열산  ★${moveToSan.toLocaleString()}건★`)

  console.info('\n══ 2 · ★감출 경기 (한쪽만 해당)★ ══\n')
  let hideOnly = 0
  for (const r of rows) {
    const groups = [r.red_group, r.blue_group]
    const hit = groups.filter((g) => g !== '해당없음').length
    if (hit === 1) hideOnly += Number(r.n)
    /* 양쪽이 서로 다른 무리면 옮길 수 없다 — 감추기만 한다 */
    if (hit === 2 && r.red_group !== r.blue_group) hideOnly += Number(r.n)
  }
  console.info(`  한쪽만 해당하거나 서로 다른 무리  ★${hideOnly.toLocaleString()}건★ (감추기만)`)

  console.info('\n══ 3 · ★옮기면 리그 경기 수가 이렇게 바뀐다★ ══\n')
  const before = await prisma.$queryRaw<{ slug: string; n: bigint }[]>`
    SELECT l."slug" AS slug, count(*) AS n
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     WHERE l."slug" IN ('supply', 'sanply') GROUP BY 1 ORDER BY 1
  `
  for (const b of before) {
    const n = Number(b.n)
    const delta = b.slug === 'supply' ? moveToSpl - moveToSan : moveToSan - moveToSpl
    console.info(
      `  ${b.slug.padEnd(8)} ${n.toLocaleString().padStart(9)} → ★${(n + delta).toLocaleString()}★  (${delta >= 0 ? '+' : ''}${delta.toLocaleString()})`,
    )
  }

  console.info('\n══ 4 · 자세히 (무리 조합별) ══\n')
  for (const r of rows) {
    if (r.red_group === '해당없음' && r.blue_group === '해당없음') continue
    console.info(
      `  ${r.league.padEnd(8)} 红 ${r.red_group.padEnd(7)} 藍 ${r.blue_group.padEnd(7)} ${Number(r.n).toLocaleString().padStart(8)}건`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
