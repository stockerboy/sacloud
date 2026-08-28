/**
 * 시즌0 반영을 **운영 DB** 에 실행한다 (D-172).
 *
 * 접속 문자열은 `packages/db/.env.production.local` 에서 읽는다 —
 * `prodRollupProbe` 와 같은 방식이고, **값을 화면에 찍지 않는다.**
 * 셸 환경변수로 넘기지 않으려고 잡 안에서 읽는다.
 *
 * `prisma` 싱글턴이 `DATABASE_URL` 을 보고 만들어지므로,
 * **import 보다 먼저** 환경변수를 세우고 동적 import 한다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/season0ApplyProd.ts                 # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/season0ApplyProd.ts --confirm
 * pnpm --filter @sacloud/worker exec tsx src/dev/season0ApplyProd.ts --revert <파일>
 * ```
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/env.js'

function productionUrl(): string {
  const file = path.join(REPO_ROOT, 'packages', 'db', '.env.production.local')
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)$/)
    if (!match) continue
    return (match[1] ?? '').trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('.env.production.local 에서 DATABASE_URL 을 찾지 못했다')
}

async function main(): Promise<void> {
  const url = productionUrl()
  /* 호스트만 보여준다. 자격증명은 찍지 않는다 */
  console.log(`운영 DB — ${url.replace(/^.*@/, '').replace(/[/?].*$/, '')}`)
  process.env.DATABASE_URL = url

  /* `--verify` 는 쓰지 않고 운영 결과만 조회한다 (그 모듈은 import 하면 바로 돈다) */
  if (process.argv.includes('--verify')) {
    await import('./season0Verify.js')
    return
  }

  /* `--migrate` — 추가만 하는 스키마 변경을 운영에 적용한다 (D-173).
     `IF NOT EXISTS` 라 여러 번 돌려도 안전하다. 기존 데이터는 건드리지 않는다 */
  if (process.argv.includes('--migrate')) {
    const { prisma: db } = await import('@sacloud/db')
    await db.$executeRawUnsafe(
      `ALTER TABLE "LeaguePlayerWeaponStat" ADD COLUMN IF NOT EXISTS "isMain" BOOLEAN NOT NULL DEFAULT false`,
    )
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "LeaguePlayerWeaponStat_weapon_isMain_ratingDelta_idx" ON "LeaguePlayerWeaponStat" ("weapon", "isMain", "ratingDelta" DESC)`,
    )
    console.log('스키마 반영 완료 — isMain 컬럼 + 인덱스')
    await db.$disconnect()
    return
  }

  const { applySeason0, revertSeason0 } = await import('../jobs/season0Apply.js')
  const { prisma } = await import('@sacloud/db')

  const revertIndex = process.argv.indexOf('--revert')
  const leaguesIndex = process.argv.indexOf('--leagues')
  const leagues =
    leaguesIndex >= 0 && process.argv[leaguesIndex + 1]
      ? process.argv[leaguesIndex + 1]!.split(',').map((s) => s.trim()).filter(Boolean)
      : ['supply']

  try {
    if (revertIndex >= 0) await revertSeason0(process.argv[revertIndex + 1] ?? '')
    else await applySeason0(leagues, process.argv.includes('--confirm'))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
