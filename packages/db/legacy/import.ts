/**
 * Legacy 시즌 요약 CSV 적재.
 *
 *   pnpm legacy:import <파일.csv> [--dry-run] [--source=3rd.supply]
 *
 * 설계 원칙
 * - **여러 번 넣어도 행이 늘어나지 않는다.** `dedupeKey`로 upsert 한다.
 * - **빈 칸은 null이다.** 원본에 없던 값을 만들어 넣지 않는다.
 * - 한 줄이 잘못돼도 **나머지를 넣고, 실패한 줄은 그대로 보고한다.**
 *   조용히 건너뛰면 "완료"라는 말이 거짓이 된다 (CLAUDE.md 3-A 6번).
 * - 운영 데이터(`LeaguePlayerSeason` / `Match`)는 건드리지 않는다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/index.js'
import { parseCsv } from './csv.js'
import { LEGACY_CSV_COLUMNS, toLegacySeason, type RowError } from './row.js'

const args = process.argv.slice(2)
const file = args.find((value) => !value.startsWith('--'))
const dryRun = args.includes('--dry-run')
const source = args.find((v) => v.startsWith('--source='))?.slice('--source='.length) ?? '3rd.supply'

if (!file) {
  console.error('사용법: pnpm legacy:import <파일.csv> [--dry-run] [--source=3rd.supply]')
  process.exit(1)
}

/**
 * 경로는 **명령을 친 위치** 기준으로 푼다.
 *
 * `pnpm --filter` 는 패키지 디렉터리에서 스크립트를 돌리기 때문에,
 * 저장소 루트에서 상대경로를 주면 `packages/db/packages/db/...` 로 어긋난다.
 * pnpm이 넣어주는 `INIT_CWD`(명령을 실행한 디렉터리)를 기준으로 삼는다.
 */
function resolveFromCallerCwd(csvPath: string): string {
  if (path.isAbsolute(csvPath)) return csvPath
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), csvPath)
}

async function main(csvPath: string) {
  const absolute = resolveFromCallerCwd(csvPath)
  const text = readFileSync(absolute, 'utf8')
  const rows = parseCsv(text)

  console.info(`파일: ${absolute}`)
  console.info(`출처: ${source}${dryRun ? '   (dry-run — 저장하지 않는다)' : ''}`)
  console.info(`읽은 줄: ${rows.length}`)

  const known = new Set<string>(LEGACY_CSV_COLUMNS)
  const unknown = Object.keys(rows[0] ?? {}).filter((column) => !known.has(column) && column !== '')
  if (unknown.length > 0) {
    // 오타를 조용히 넘기면 그 열은 통째로 사라진다. 반드시 알린다.
    console.info(`\n경고: 모르는 열이 있다 → ${unknown.join(', ')}`)
    console.info(`      쓰는 열: ${LEGACY_CSV_COLUMNS.join(', ')}`)
  }

  const errors: RowError[] = []
  let created = 0
  let updated = 0
  const seen = new Set<string>()
  let duplicatesInFile = 0

  for (const [index, row] of rows.entries()) {
    // 헤더가 1줄이므로 파일에서의 줄 번호는 +2
    const line = index + 2
    const parsed = toLegacySeason(row, line, source)
    if (!parsed.ok) {
      errors.push(parsed.error)
      continue
    }

    const value = parsed.value
    if (seen.has(value.dedupeKey)) duplicatesInFile += 1
    seen.add(value.dedupeKey)

    if (dryRun) continue

    const existing = await prisma.legacyPlayerSeason.findUnique({
      where: { dedupeKey: value.dedupeKey },
      select: { id: true },
    })

    await prisma.legacyPlayerSeason.upsert({
      where: { dedupeKey: value.dedupeKey },
      create: value,
      update: value,
    })

    if (existing) updated += 1
    else created += 1
  }

  console.info('\n결과')
  if (dryRun) {
    console.info(`  검사 통과: ${rows.length - errors.length}줄`)
  } else {
    console.info(`  새로 넣음: ${created}`)
    console.info(`  덮어씀   : ${updated}`)
  }
  if (duplicatesInFile > 0) {
    console.info(`  파일 안 중복: ${duplicatesInFile}줄 (같은 대상이 여러 번 있다 — 마지막 값이 남는다)`)
  }

  if (errors.length > 0) {
    console.info(`\n실패한 줄: ${errors.length}`)
    for (const error of errors.slice(0, 20)) {
      console.info(`  ${error.line}행: ${error.message}`)
    }
    if (errors.length > 20) console.info(`  … 외 ${errors.length - 20}건`)
    // 실패를 성공으로 처리하지 않는다
    process.exitCode = 1
  }

  if (!dryRun) {
    const total = await prisma.legacyPlayerSeason.count({ where: { source } })
    console.info(`\n현재 저장된 Legacy 시즌 기록 (${source}): ${total}행`)
  }
}

main(file)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
