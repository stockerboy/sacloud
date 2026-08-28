/** 임시 조사 — DB 로 원본 id 를 채울 수 있는가. 읽기만 한다. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'

const REPO = join(process.cwd(), '..', '..')

async function main() {
  for (const slug of ['supply', 'daerule', 'sanply']) {
    const league = await prisma.league.findUnique({
      where: { slug },
      select: { id: true, sourceLeagueId: true },
    })
    const raw = JSON.parse(
      readFileSync(join(REPO, 'packages', 'db', 'data', `supply-mirror-${slug}.json`), 'utf8'),
    ) as { leagueId: number; clans: Record<string, { leagueClanId: number | null }> }

    const clanSlugs = Object.keys(raw.clans)
    const rows = await prisma.leagueClan.findMany({
      where: { leagueId: league?.id ?? '', clan: { slug: { in: clanSlugs } } },
      select: { sourceLeagueClanId: true, clan: { select: { slug: true } } },
    })
    const have = rows.filter((r) => r.sourceLeagueClanId !== null)
    let match = 0
    let mismatch = 0
    for (const r of have) {
      const expect = raw.clans[r.clan.slug]?.leagueClanId
      if (expect === null || expect === undefined) continue
      if (String(expect) === r.sourceLeagueClanId) match += 1
      else mismatch += 1
    }
    console.log(
      `${slug}: League.sourceLeagueId=${league?.sourceLeagueId} (파일 ${raw.leagueId}) · ` +
        `등록 ${clanSlugs.length} · LeagueClan ${rows.length} · sourceLeagueClanId 있음 ${have.length} · ` +
        `파일과 일치 ${match} · 불일치 ${mismatch}`,
    )
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
