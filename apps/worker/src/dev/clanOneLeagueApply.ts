/**
 * ★★클랜 하나 = 리그 하나★★ (2026-09-05 · 사장님 지시).
 *
 * ```
 * node scripts/prod-run.mjs clan-one-league            미리보기
 * node scripts/prod-run.mjs clan-one-league --confirm  적용 (되돌릴 파일을 먼저 쓴다)
 * node scripts/prod-run.mjs clan-one-league --revert   되돌린다
 * ```
 *
 * ══ ★무엇을 하나★ ══
 *
 * 운영 대상 세 리그(IPL·SPL·열산)에서 ★한 클랜이 두 곳에 활성 등록된 것★ 을 끊는다.
 * 사장님이 확정하신 쪽만 남기고 ★반대쪽 등록을 숨긴다.★
 *
 * ★지우지 않는다.★ `expelledAt` 에 시각을 적을 뿐이고, 되돌리면 다시 `null` 이 된다.
 *
 * ── ★왜 `expelledAt` 인가 — 새 칸을 안 만들고★
 *   이 저장소는 ★이미 그 칸을 「안 보이게 하는 표시」로 쓰고 있다.★
 *   실측(2026-09-05): `hingˇ` · `idylic` 의 열산 등록이 8월 말에 그렇게 숨겨져 있었다.
 *   화면·집계·겹침 검사가 전부 `expelledAt IS NULL` 로 활성을 가른다.
 *   ★새 칸을 만들면 그 모든 곳을 다시 고쳐야 하고, 하나라도 빠뜨리면 조용히 샌다.★
 *
 *   ⚠ 스키마 주석은 이 칸을 「추방 — 되돌릴 수 없고 재가입 불가(관측)」라고 적어 뒀다.
 *     그건 ★원본(3rd.supply)의 동작 관측★ 이지 우리 DB 의 제약이 아니다.
 *     우리는 되돌릴 수 있고, 되돌릴 파일을 남긴다.
 *
 * ── ★대룰(daerule)은 건드리지 않는다★
 *   사장님: «daerule 은 운영 대상이 아니므로 이번 규칙 적용과 분리해서 보존한다»
 *
 * ── ★경기는 옮기지 않는다★
 *   사장님: «이 작업 때문에 과거 경기들을 대량 이동시키지 마라»
 *   숨긴 등록을 가리키는 과거 경기는 ★그대로 둔다.★ 이 도구는 등록만 본다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { prisma } from '@sacloud/db'

const confirm = process.argv.includes('--confirm')
const revert = process.argv.includes('--revert')
const BACKUP = 'data/clan-one-league/expelled-backup.jsonl'

/** ★운영 대상 세 리그★ — 대룰은 여기 없다 */
const LIVE = ['nolink', 'supply', 'sanply'] as const

/** ★열산으로 확정된 6곳★ (2026-09-05 사장님). 43곳 중 나머지 37곳은 SPL */
const KEEP_SANPLY = ['flying-', 'immortals', '매너', '사신', '야부리！', '어린이']

interface Backup {
  id: string
  expelledAt: string | null
}

interface Reg {
  lcId: string
  clanId: string
  clanName: string
  leagueSlug: string
  expelledAt: Date | null
}

async function doRevert(): Promise<void> {
  if (!existsSync(BACKUP)) {
    console.info(`★되돌릴 파일이 없다★ — ${BACKUP}`)
    return
  }
  const lines = readFileSync(BACKUP, 'utf8').trim().split('\n').filter(Boolean)
  console.info(`되돌릴 등록 ${lines.length}개`)
  for (const line of lines) {
    const b = JSON.parse(line) as Backup
    await prisma.leagueClan.update({
      where: { id: b.id },
      data: { expelledAt: b.expelledAt === null ? null : new Date(b.expelledAt) },
    })
  }
  console.info('되돌렸다')
}

async function main(): Promise<void> {
  if (revert) return doRevert()

  /* ① 지금 겹쳐 있는 것을 전부 모은다 (운영 3리그 · 활성만) */
  const regs = await prisma.$queryRaw<Reg[]>`
    SELECT lc.id AS "lcId", lc."clanId", c.name AS "clanName",
           l.slug AS "leagueSlug", lc."expelledAt"
    FROM "LeagueClan" lc
    JOIN "League" l ON l.id = lc."leagueId"
    JOIN "Clan" c ON c.id = lc."clanId"
    WHERE l.slug = ANY(${[...LIVE]}) AND lc."expelledAt" IS NULL
    ORDER BY c.name, l.slug`

  const byClan = new Map<string, Reg[]>()
  for (const r of regs) {
    const list = byClan.get(r.clanId) ?? []
    list.push(r)
    byClan.set(r.clanId, list)
  }
  const overlapped = [...byClan.values()].filter((l) => l.length > 1)
  console.info(`운영 3리그 활성 등록 ${regs.length}개 · 클랜 ${byClan.size}곳`)
  console.info(`★두 곳 이상에 활성인 클랜 ${overlapped.length}곳★\n`)

  /* ② 어디를 남길지 정한다 */
  const hide: Reg[] = []
  const untouched: string[] = []
  for (const list of overlapped) {
    const name = list[0]!.clanName
    const slugs = list.map((r) => r.leagueSlug)

    let keepSlug: string | null = null
    if (slugs.includes('nolink')) {
      /* IPL 은 무소속리그다 — 거기 등록돼 있으면 IPL 클랜이다 */
      keepSlug = 'nolink'
    } else if (slugs.includes('supply') && slugs.includes('sanply')) {
      keepSlug = KEEP_SANPLY.includes(name) ? 'sanply' : 'supply'
    }

    if (!keepSlug || !slugs.includes(keepSlug)) {
      untouched.push(`${name} (${slugs.join('+')}) — 고를 수 없다`)
      continue
    }
    const keep = list.find((r) => r.leagueSlug === keepSlug)!
    const drop = list.filter((r) => r.lcId !== keep.lcId)
    console.info(
      `${name.padEnd(16).slice(0, 16)} ★${keepSlug}★ 남기고 → ${drop.map((d) => d.leagueSlug).join(' · ')} 숨김`,
    )
    hide.push(...drop)
  }

  if (untouched.length > 0) {
    console.info('\n★손대지 않은 것★')
    for (const u of untouched) console.info(`  ${u}`)
  }
  console.info(`\n숨길 등록 ★${hide.length}개★ · 손 안 댄 클랜 ${untouched.length}곳`)

  if (!confirm) {
    console.info('\n미리보기다. 적용하려면 --confirm')
    return
  }

  /* ③ 되돌릴 파일을 ★먼저★ 쓴다 */
  const backups: Backup[] = hide.map((h) => ({ id: h.lcId, expelledAt: null }))
  mkdirSync(dirname(BACKUP), { recursive: true })
  writeFileSync(BACKUP, backups.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8')
  const wrote = readFileSync(BACKUP, 'utf8').trim().split('\n').filter(Boolean).length
  if (wrote !== backups.length) throw new Error(`백업 줄 수가 안 맞는다 ${wrote} ≠ ${backups.length}`)
  console.info(`\n★되돌릴 파일 먼저 썼다★ ${BACKUP} · ${wrote}줄 (확인함)\n`)

  /* ④ 숨긴다 */
  const now = new Date()
  for (const h of hide) {
    await prisma.leagueClan.update({ where: { id: h.lcId }, data: { expelledAt: now } })
  }
  console.info(`★숨겼다 ${hide.length}개★`)
}

main()
  .catch((e) => {
    console.error((e as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
