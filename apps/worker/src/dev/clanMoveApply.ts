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

/* ══ ★2026-09-05 · 사장님이 43곳을 다시 정하셨다★ ══════════════════════
 *
 *   > «어린이 매너 사신 야부리 이모탈 플라잉 ★만★ 열산클랜»
 *
 *   ★9/3 분류와 14곳이 다르다.★ 사장님께 확인했고 «방금한게 최종» 이라 하셨다.
 *     SPL → 열산 (3곳)  immortals(이모탈) · 사신 · 야부리！
 *     열산 → SPL (11곳) CeIebrity · eternalrz · Grand'rN · hilarious- · IinecIan: ·
 *                        MiraGe. · recentwct- · respects- · resun`z · sugarcandy · 鬼神。
 *
 *   ⚠ ★옛 목록은 지우지 않는다★ (`CLAUDE.md` 1-4) — 아래 `_V1` 에 그대로 있다.
 *   ⚠ 새로 옮기기 전에 ★9/3 이동 3,351건을 먼저 되돌렸다.★
 *     옛 되돌리기 파일은 `clan-move-backup-2026-09-03.jsonl` 로 남겼다.
 * ══════════════════════════════════════════════════════════════════════ */

/** ★옛 분류 (2026-09-03)★ — 지우지 않는다. 계산에 쓰지 않는다 */
const KEEP_SPL_V1 = [
  '-tsAr.nTc', '［P.ro™］', '＃chasepIay', '＃chaseplay', 'AK-47', 'Castle', 'Chamundara',
  'des`per@do.', 'dravelior', 'e2stro-', 'hing', 'Iatency-', 'immortals', 'isyour',
  'mercedes-', 'rNtwo-', 'ThelVub', 'unfair', 'Βlackpearl', '마왕', '사신', '야부리！',
  '★PURPLE★', 'afterpray', 'gaIactico-', 'innatemass', 'recent.wct', 'saint', 'stylecIan',
]
/** ★옛 분류 (2026-09-03)★ — 지우지 않는다 */
const KEEP_SANPLY_V1 = [
  'CeIebrity', 'eternalrz', 'flying-', "Grand'rN", 'hilarious-', 'IinecIan:', 'MiraGe.',
  'recentwct-', 'respects-', 'resun`z', 'sugarcandy', '매너', '어린이', '鬼神。',
]
void KEEP_SPL_V1
void KEEP_SANPLY_V1

/** ★열산은 이 6곳뿐이다★ (2026-09-05 사장님) */
const KEEP_SANPLY = ['flying-', 'immortals', '매너', '사신', '야부리！', '어린이']

/** 나머지 37곳은 전부 SPL */
const KEEP_SPL = [
  '-tsAr.nTc', '［P.ro™］', '＃chasepIay', '＃chaseplay', 'AK-47', 'Castle', 'Chamundara',
  'des`per@do.', 'dravelior', 'e2stro-', 'hing', 'Iatency-', 'isyour',
  'mercedes-', 'rNtwo-', 'ThelVub', 'unfair', 'Βlackpearl', '마왕',
  '★PURPLE★', 'afterpray', 'gaIactico-', 'innatemass', 'recent.wct', 'saint', 'stylecIan',
  'CeIebrity', 'eternalrz', "Grand'rN", 'hilarious-', 'IinecIan:', 'MiraGe.',
  'recentwct-', 'respects-', 'resun`z', 'sugarcandy', '鬼神。',
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
  const plans: { to: 'supply' | 'sanply'; from: string; toId: string; clanIds: string[] }[] = [
    { to: 'supply', from: lid.sanply!, toId: lid.supply!, clanIds: toSpl },
    { to: 'sanply', from: lid.supply!, toId: lid.sanply!, clanIds: toSan },
  ]

  const before = await counts()
  console.info(confirm ? '★쓰기 모드★\n' : '미리보기 — 아무것도 쓰지 않는다\n')

  /*
   * ★★되돌릴 값을 「쓰기 전에」 저장한다★★
   *
   * 앞서 이 스크립트는 백업을 **루프가 끝난 뒤** 저장했다. 그런데 루프가 중간에 터지자
   * ★백업 파일이 아예 안 만들어졌다.★ 그때는 우연히 `seasonId` 를 null 로 둔 덕에
   * 건드린 행을 찾아 되돌릴 수 있었다 — ★운이었다.★
   * 그래서 이제 **모으기 → 파일 쓰기 → 파일 확인 → 그다음 옮기기** 순서로 한다.
   */
  const backups: Backup[] = []
  let moved = 0
  const targets: { p: (typeof plans)[number]; rows: Backup[] }[] = []
  for (const p of plans) {
    /*
     * ★목적지에 같은 경기가 이미 있으면 옮기지 않는다★
     *
     * `@@unique([leagueId, origin, sourceMatchId])` 라 옮기면 충돌한다.
     * 그리고 ★옮길 이유도 없다★ — SPL 사본이 이미 있으니 열산 사본을 감추면
     * 「반드시 SPL 에만 존재한다」가 그대로 성립한다.
     * 실측: 열산→SPL 의 ★99.5%★ · SPL→열산 의 ★38.3%★ 가 이미 쌍둥이가 있다
     */
    const rows = await prisma.$queryRaw<Backup[]>`
      SELECT m."id", m."leagueId", m."redLeagueClanId", m."blueLeagueClanId"
        FROM "Match" m
        JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
        JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
       WHERE m."leagueId" = ${p.from}
         AND rlc."clanId" = ANY(${p.clanIds})
         AND blc."clanId" = ANY(${p.clanIds})
         AND NOT EXISTS (
           SELECT 1 FROM "Match" t
            WHERE t."leagueId" = ${p.toId}
              AND t."origin" = m."origin"
              AND t."sourceMatchId" = m."sourceMatchId"
         )
    `
    console.info(`  → ${p.to} 로 옮길 것 ★${rows.length.toLocaleString()}건★`)
    targets.push({ p, rows })
    backups.push(...rows)
  }

  if (!confirm) {
    moved = backups.length
  } else {
    /* ── ★1단계 · 백업을 먼저 쓴다★ ─────────────────────────────── */
    mkdirSync(dirname(BACKUP), { recursive: true })
    writeFileSync(BACKUP, backups.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8')

    /* ── ★2단계 · 진짜 만들어졌는지 확인한다★ ────────────────────── */
    if (!existsSync(BACKUP)) throw new Error('백업 파일이 안 만들어졌다 — 옮기지 않는다')
    const wrote = readFileSync(BACKUP, 'utf8').trim().split('\n').filter(Boolean).length
    if (wrote !== backups.length) {
      throw new Error(`백업 줄 수가 안 맞는다 ${wrote} ≠ ${backups.length} — 옮기지 않는다`)
    }
    console.info(`\n★되돌릴 파일 먼저 썼다★ ${BACKUP} · ${wrote.toLocaleString()}줄 (확인함)\n`)

    /* ── ★3단계 · 이제 옮긴다★ ──────────────────────────────────── */
    for (const { p, rows } of targets) {
      const targetLc = await prisma.leagueClan.findMany({
        where: { leagueId: p.toId, clanId: { in: p.clanIds } },
        select: { id: true, clanId: true },
      })
      const lcOf = new Map(targetLc.map((x) => [x.clanId, x.id]))
      const srcLc = await prisma.leagueClan.findMany({
        where: {
          id: { in: [...new Set(rows.flatMap((r) => [r.redLeagueClanId, r.blueLeagueClanId]))] },
        },
        select: { id: true, clanId: true },
      })
      const clanOfLc = new Map(srcLc.map((x) => [x.id, x.clanId]))

      for (const r of rows) {
        const red = lcOf.get(clanOfLc.get(r.redLeagueClanId)!)
        const blue = lcOf.get(clanOfLc.get(r.blueLeagueClanId)!)
        if (!red || !blue) throw new Error(`목적지 등록행이 없다: ${r.id}`)
        await prisma.match.update({
          where: { id: r.id },
          data: { leagueId: p.toId, redLeagueClanId: red, blueLeagueClanId: blue, seasonId: null },
        })
        moved += 1
        if (moved % 500 === 0) console.info(`    ${moved.toLocaleString()}건…`)
      }
    }
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
