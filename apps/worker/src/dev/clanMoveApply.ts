/**
 * **O-044 (나) — 경기를 제 리그로 옮긴다** (2026-09-03).
 *
 * ```
 * node scripts/prod-run.mjs clan-move            미리보기
 * node scripts/prod-run.mjs clan-move --confirm  옮긴다 (되돌릴 파일을 먼저 쓴다)
 * node scripts/prod-run.mjs clan-move --revert   되돌린다 (그 파일을 읽어서)
 * ```
 *
 * ══ 사장님이 (나)를 고르셨다 ══
 *
 * > «Castle vs Mirage 는 열산클랜이 더 이상 아니다. **둘이 대결한 기록은 반드시 spl에만 존재한다**»
 *
 * ★양쪽 다 같은 리그로 정해진 경기만 옮긴다.★ 한쪽만 정해진 것은 ★감추기★ 이지 옮기기가 아니다.
 *
 * ══ ★래더는 건드리지 않는다★ ══
 *
 * 옮기는 경기의 대부분이 `legacy`·`Beta` 창에 있고 스키마 주석이 **「재계산하지 않는다」** 다.
 * 시즌0 것도 10/1 에 0 으로 리셋된다. 그리고 과거 점수를 바꾸면 **사람들이 이미 본 숫자가 바뀐다**
 * (`CLAUDE.md` 6장 4번이 막는 「과거 오염」과 같은 종류다).
 * → ★경기는 옮기되 점수는 그대로 둔다.★ 사장님이 「다시 계산해라」 하시면 그때 한다.
 *
 * ══ ★되돌리는 법★ ══
 *
 * 옮기기 전에 **경기마다 세 칸**(`leagueId` · `redLeagueClanId` · `blueLeagueClanId`)을
 * JSONL 로 남긴다. ⚠ ★그 파일이 없으면 되돌릴 수 없다★ —
 * 「양쪽이 SPL 행이고 지금 SPL 에 있다」만으로는 **원래 SPL 이던 48,933건과 구별이 안 된다.**
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { prisma } from '@sacloud/db'

const confirm = process.argv.includes('--confirm')
const revert = process.argv.includes('--revert')
const BACKUP = 'data/o044/clan-move-backup.jsonl'

const KEEP_SPL = [
  '-tsAr.nTc', '［P.ro™］', '＃chasepIay', '＃chaseplay', 'AK-47', 'Castle', 'Chamundara',
  'des`per@do.', 'dravelior', 'e2stro-', 'hing', 'Iatency-', 'immortals', 'isyour',
  'mercedes-', 'rNtwo-', 'ThelVub', 'unfair', 'Βlackpearl', '마왕', '사신', '야부리！',
  '★PURPLE★', 'afterpray', 'gaIactico-', 'innatemass', 'recent.wct', 'saint', 'stylecIan',
]
const KEEP_SANPLY = [
  'CeIebrity', 'eternalrz', 'flying-', "Grand'rN", 'hilarious-', 'IinecIan:', 'MiraGe.',
  'recentwct-', 'respects-', 'resun`z', 'sugarcandy', '매너', '어린이', '鬼神。',
]

interface Backup {
  id: string
  leagueId: string
  redLeagueClanId: string
  blueLeagueClanId: string
}

async function counts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ slug: string; n: bigint }[]>`
    SELECT l."slug" AS slug, count(*) AS n
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     WHERE l."slug" IN ('supply','sanply') GROUP BY 1
  `
  return Object.fromEntries(rows.map((r) => [r.slug, Number(r.n)]))
}

async function doRevert(): Promise<void> {
  if (!existsSync(BACKUP)) {
    console.info(`★되돌릴 파일이 없다★ — ${BACKUP}`)
    return
  }
  const lines = readFileSync(BACKUP, 'utf8').trim().split('\n').filter(Boolean)
  console.info(`되돌릴 경기 ${lines.length.toLocaleString()}건\n`)
  const before = await counts()
  let done = 0
  for (const line of lines) {
    const b = JSON.parse(line) as Backup
    await prisma.match.update({
      where: { id: b.id },
      data: {
        leagueId: b.leagueId,
        redLeagueClanId: b.redLeagueClanId,
        blueLeagueClanId: b.blueLeagueClanId,
        /* ★시즌도 풀어 준다★ — 리그가 바뀌면 시즌 행이 달라진다. season-assign 이 다시 채운다 */
        seasonId: null,
      },
    })
    done += 1
    if (done % 2000 === 0) console.info(`  ${done.toLocaleString()}건…`)
  }
  const after = await counts()
  console.info(`\n되돌렸다 ${done.toLocaleString()}건`)
  console.info(`  supply ${before.supply?.toLocaleString()} → ★${after.supply?.toLocaleString()}★`)
  console.info(`  sanply ${before.sanply?.toLocaleString()} → ★${after.sanply?.toLocaleString()}★`)
  console.info('\n⚠ ★`season-assign --confirm` 을 다시 돌려야 시즌이 채워진다★')
}

async function main(): Promise<void> {
  if (revert) return doRevert()

  const clans = await prisma.clan.findMany({
    where: { name: { in: [...KEEP_SPL, ...KEEP_SANPLY] } },
    select: { id: true, name: true },
  })
  const toSpl = clans.filter((c) => KEEP_SPL.includes(c.name)).map((c) => c.id)
  const toSan = clans.filter((c) => KEEP_SANPLY.includes(c.name)).map((c) => c.id)
  if (toSpl.length !== KEEP_SPL.length || toSan.length !== KEEP_SANPLY.length) {
    console.info('★43곳이 안 맞는다 — 멈춘다★')
    return
  }

  const leagues = await prisma.league.findMany({
    where: { slug: { in: ['supply', 'sanply'] } },
    select: { id: true, slug: true },
  })
  const lid = Object.fromEntries(leagues.map((l) => [l.slug, l.id]))

  /* 옮길 대상 — 양쪽 다 같은 무리이고, 지금 그 리그가 아닌 경기 */
  const plans: { to: 'supply' | 'sanply'; from: string; clanIds: string[] }[] = [
    { to: 'supply', from: lid.sanply!, clanIds: toSpl },
    { to: 'sanply', from: lid.supply!, clanIds: toSan },
  ]

  const before = await counts()
  console.info(confirm ? '★쓰기 모드★\n' : '미리보기 — 아무것도 쓰지 않는다\n')

  const backups: Backup[] = []
  let moved = 0
  for (const p of plans) {
    const rows = await prisma.$queryRaw<Backup[]>`
      SELECT m."id", m."leagueId", m."redLeagueClanId", m."blueLeagueClanId"
        FROM "Match" m
        JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
        JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
       WHERE m."leagueId" = ${p.from}
         AND rlc."clanId" = ANY(${p.clanIds})
         AND blc."clanId" = ANY(${p.clanIds})
    `
    console.info(`  → ${p.to} 로 옮길 것 ★${rows.length.toLocaleString()}건★`)
    if (!confirm) {
      moved += rows.length
      continue
    }
    backups.push(...rows)

    /* 그 클랜의 ★목적지 리그★ 등록행을 찾아 둔다 */
    const targetLc = await prisma.leagueClan.findMany({
      where: { leagueId: lid[p.to]!, clanId: { in: p.clanIds } },
      select: { id: true, clanId: true },
    })
    const lcOf = new Map(targetLc.map((x) => [x.clanId, x.id]))

    const srcLc = await prisma.leagueClan.findMany({
      where: { id: { in: [...new Set(rows.flatMap((r) => [r.redLeagueClanId, r.blueLeagueClanId])) ] } },
      select: { id: true, clanId: true },
    })
    const clanOfLc = new Map(srcLc.map((x) => [x.id, x.clanId]))

    for (const r of rows) {
      const red = lcOf.get(clanOfLc.get(r.redLeagueClanId)!)
      const blue = lcOf.get(clanOfLc.get(r.blueLeagueClanId)!)
      if (!red || !blue) throw new Error(`목적지 등록행이 없다: ${r.id}`)
      await prisma.match.update({
        where: { id: r.id },
        data: { leagueId: lid[p.to]!, redLeagueClanId: red, blueLeagueClanId: blue, seasonId: null },
      })
      moved += 1
      if (moved % 2000 === 0) console.info(`    ${moved.toLocaleString()}건…`)
    }
  }

  if (confirm) {
    mkdirSync(dirname(BACKUP), { recursive: true })
    writeFileSync(BACKUP, backups.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8')
    console.info(`\n★되돌릴 파일★ ${BACKUP} · ${backups.length.toLocaleString()}줄`)
  }

  const after = await counts()
  console.info(`\n${confirm ? '옮겼다' : '옮길 것'} ★${moved.toLocaleString()}건★`)
  console.info(`  supply ${before.supply?.toLocaleString()} → ★${after.supply?.toLocaleString()}★`)
  console.info(`  sanply ${before.sanply?.toLocaleString()} → ★${after.sanply?.toLocaleString()}★`)
  console.info(
    `  ★합 ${(before.supply! + before.sanply!).toLocaleString()} → ${(after.supply! + after.sanply!).toLocaleString()}★` +
      ` ${before.supply! + before.sanply! === after.supply! + after.sanply! ? '(보존됨)' : '★어긋났다★'}`,
  )
  if (confirm) console.info('\n⚠ ★`season-assign --confirm` 을 다시 돌려야 시즌이 채워진다★')
  else console.info('\n미리보기다. 실제로 옮기려면 --confirm')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
