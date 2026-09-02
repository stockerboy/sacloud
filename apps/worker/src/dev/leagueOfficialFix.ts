/**
 * `League.official` 을 사장님 지시에 맞춘다 — 「공식리그는 SPL 과 IPL, 열산만 비공식」 (지시 #20 · 2026-09-02).
 *
 * ```
 * cd packages/db
 * DATABASE_URL="…운영…" npx tsx ../../apps/worker/src/dev/leagueOfficialFix.ts              # 미리보기 + 백업
 * DATABASE_URL="…운영…" npx tsx ../../apps/worker/src/dev/leagueOfficialFix.ts --confirm    # 반영
 *   --backup-dir <디렉터리>   백업 JSON 을 둘 곳. 기본은 저장소 밖(스크래치패드)이 아니라 cwd 이므로 반드시 넘긴다
 * ```
 *
 * ── 왜
 *   운영 `nolink`(IPL) 의 `official` 이 false 였다. API 가 이 열을 그대로 내보내므로 화면 상수만
 *   고치면(024f83c) 진실이 둘이 된다. DB 를 정본으로 맞춘다.
 *
 * ── 무엇을 / 무엇을 안 하나
 *   바꾼다     `official` 열 하나. `supply=true` · `nolink=true` · `sanply=false`
 *   안 바꾼다  `category` — 정렬·집계가 본다 (IPL 티어 정렬이 `category === 'independent'`).
 *              `daerule`(닫은 리그) 과 그 밖의 행. 스키마. 삭제 없음
 *
 * ── 안전
 *   · `--confirm` 없이는 한 줄도 쓰지 않는다
 *   · 바꾸기 전에 대상 세 행을 JSON 으로 백업한다 (되돌릴 때 `official` 만 되쓰면 된다)
 *   · UPDATE 는 `slug` 로 한정, **한 행씩 순차**. 영향 행 수를 찍는다 (운영 통로는 하나다)
 *   · 이미 목표값이면 건너뛴다 — 멱등. 다시 돌려도 0행
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { prisma } from '@sacloud/db'

/** 목표값. 여기 없는 slug 는 **읽기만** 한다 */
const TARGET: ReadonlyArray<{ slug: string; official: boolean }> = [
  { slug: 'supply', official: true },
  { slug: 'nolink', official: true },
  { slug: 'sanply', official: false },
]

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : fallback
}
const CONFIRM = process.argv.includes('--confirm')
const BACKUP_DIR = resolve(flag('backup-dir', process.cwd()))

interface Row {
  slug: string
  name: string
  official: boolean
  category: string
}

async function snapshot(label: string): Promise<Row[]> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "slug", "name", "official", "category" FROM "League" ORDER BY "slug"
  `
  console.info(`\n[${label}] League ${rows.length}행`)
  console.info('  slug       name          official  category')
  for (const r of rows)
    console.info(`  ${r.slug.padEnd(10)} ${r.name.padEnd(13)} ${String(r.official).padEnd(9)} ${r.category}`)
  return rows
}

async function main(): Promise<void> {
  const before = await snapshot('전')
  const bySlug = new Map(before.map((r) => [r.slug, r]))

  /* 계획 — 목표와 다른 행만 */
  const plan = TARGET.map((t) => {
    const row = bySlug.get(t.slug) ?? null
    return { ...t, row, change: row !== null && row.official !== t.official }
  })
  for (const p of plan) {
    if (!p.row) console.info(`  ⚠ ${p.slug} 행이 없다 — 건너뛴다`)
    else console.info(`  ${p.slug}: official ${p.row.official} → ${p.official} ${p.change ? '(바꾼다)' : '(이미 목표값 · 건너뜀)'}`)
  }
  const toChange = plan.filter((p) => p.change)
  console.info(`바꿀 행 ${toChange.length}개 · category 는 건드리지 않는다`)

  /* 백업 — 대상 세 행 그대로 (되돌릴 때 official 만 되쓴다) */
  mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = join(BACKUP_DIR, `league-official-backup-${stamp}.json`)
  writeFileSync(
    backupFile,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: '지시 #20 반영 전 League 대상 행. 되돌리려면 slug 로 official 만 UPDATE 한다. category 는 바꾼 적이 없다',
        rows: TARGET.map((t) => bySlug.get(t.slug) ?? { slug: t.slug, missing: true }),
        allRows: before,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.info(`백업 ${backupFile}`)

  if (!CONFIRM) {
    console.info('미리보기다. 반영하려면 --confirm')
    return
  }

  /* 반영 — slug 로 한정, 한 행씩 순차 */
  let affectedTotal = 0
  for (const p of toChange) {
    const affected = await prisma.$executeRaw`
      UPDATE "League" SET "official" = ${p.official}, "updatedAt" = now()
      WHERE "slug" = ${p.slug} AND "official" <> ${p.official}
    `
    console.info(`  UPDATE ${p.slug} official=${p.official} → 영향 ${affected}행`)
    affectedTotal += affected
  }
  console.info(`바꾼 행 수 ${affectedTotal}`)

  const after = await snapshot('후')
  /* 검증 — 목표값 · category 불변 · 다른 행 불변 */
  const problems: string[] = []
  for (const t of TARGET) {
    const a = after.find((r) => r.slug === t.slug)
    if (a && a.official !== t.official) problems.push(`${t.slug} official 이 ${a.official} 이다`)
  }
  for (const b of before) {
    const a = after.find((r) => r.slug === b.slug)
    if (!a) problems.push(`${b.slug} 행이 사라졌다`)
    else if (a.category !== b.category) problems.push(`${b.slug} category 가 바뀌었다 (${b.category} → ${a.category})`)
    else if (!TARGET.some((t) => t.slug === b.slug) && a.official !== b.official)
      problems.push(`${b.slug} 은 대상이 아닌데 official 이 바뀌었다`)
  }
  if (problems.length > 0) {
    console.error(`⚠ 검증 실패: ${problems.join(' · ')}`)
    process.exitCode = 1
  } else {
    console.info('검증 통과 — 목표값 일치 · category 불변 · 다른 행 불변')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
