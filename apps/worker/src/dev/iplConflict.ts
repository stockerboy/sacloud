/**
 * IPL 명단 중 **공식리그(DPL) 1·2부에 이미 등록된 클랜이 있는가** 를 본다 (읽기 전용).
 *
 * `docs/IPL_SPEC.md` 1장: 공식리그 1·2부 등록 클랜은 IPL 에 소속될 수 없다.
 * 열산리그와는 겹쳐도 된다. 이 배타는 **한 방향뿐**이다.
 */
import { prisma } from '@sacloud/db'
import { IPL_ROSTER } from './iplRoster'

async function main(): Promise<void> {
  const names = IPL_ROSTER.map((r) => r.name)
  const clans = await prisma.clan.findMany({
    where: { name: { in: names } },
    select: { id: true, slug: true, name: true },
  })
  const rows = await prisma.leagueClan.findMany({
    where: { clanId: { in: clans.map((c) => c.id) } },
    select: {
      division: true,
      clan: { select: { name: true, slug: true } },
      league: { select: { slug: true, name: true } },
    },
  })
  if (rows.length === 0) {
    console.info('명단 클랜 중 어떤 리그에도 등록된 곳이 없다.')
  }
  for (const r of rows) {
    console.info(
      `${r.clan.name.padEnd(14)} (${r.clan.slug}) → ${r.league.name}(${r.league.slug}) ${r.division}부/티어`,
    )
  }
  const blocked = rows.filter((r) => r.league.slug === 'supply')
  console.info(`\n공식리그(supply) 등록 = IPL 불가 대상: ${blocked.length}곳`)
}

main()
  .catch((e) => console.error(String(e).slice(0, 600)))
  .finally(() => prisma.$disconnect())
